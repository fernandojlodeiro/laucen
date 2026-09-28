// Piloto: el motor. Vercel corta cada pedido a los 5 minutos, así que el
// trabajo avanza por tandas: cada llamada a avanzar() hace lo que puede
// hasta `hasta` y deja todo guardado; la pantalla la vuelve a llamar hasta
// que termina. Con candado: una sola tanda a la vez por piloto.

import { pool } from "@/db";
import { costosFinales } from "@/lib/apify";
import { USD_POR_MTOK } from "@/lib/claude";
import { asegurarEsquema } from "./esquema";
import { buscadosDeCategoria, cruzar, datosDeEnvio, listadoDeCategoria, urlDeCategoria } from "./ml";
import { buscarEnChina, cajasConWeb, estimarCajas, flete, juzgar } from "./china";
import { costosML, tasasDe } from "./costo";
import type { AvanceCategoria, Caja, Candidato, Ficha, Juicio, Parametros, PubML } from "./tipos";
import { leerFicha, precioMinimo } from "./ficha";
import { claveDe, clasificar, corregir } from "./ncm";

export type Corrida = {
  id: number; organizacion_id: string; creada_el: Date; parametros: Parametros; estado: string;
  avance: Record<string, AvanceCategoria>; costos: Costos; trabajando_desde: Date | null; automatico: boolean;
};
export type Costos = { apifyUsd?: number; apifyRuns?: string[]; apifyFinal?: boolean; claude?: Record<string, { in: number; out: number; usd?: number }> };

/** Lo gastado en Claude: el costo guardado por etapa (según el modelo usado)
 *  o, en los pilotos viejos que no lo guardaban, a precio de Opus. */
export function usdDeClaude(c: Costos) {
  return Object.values(c.claude ?? {}).reduce((t, x) => t + (x.usd ?? (x.in * USD_POR_MTOK.entrada + x.out * USD_POR_MTOK.salida) / 1_000_000), 0);
}

export async function crearCorrida(organizacionId: string, p: Parametros, automatico = false) {
  await asegurarEsquema();
  const r = await pool.query<{ id: number }>("insert into piloto_corridas (organizacion_id, parametros, automatico) values ($1, $2, $3) returning id", [organizacionId, p, automatico]);
  return r.rows[0].id;
}

export async function corrida(id: number, organizacionId: string): Promise<Corrida | null> {
  await asegurarEsquema();
  const r = await pool.query<Corrida>("select * from piloto_corridas where id = $1 and organizacion_id = $2", [id, organizacionId]);
  return r.rows[0] ?? null;
}

export async function corridas(organizacionId: string) {
  await asegurarEsquema();
  const r = await pool.query<Corrida & { productos: number; listos: number }>(
    `select c.*, (select count(*)::int from piloto_productos p where p.corrida_id = c.id) productos,
            (select count(*)::int from piloto_productos p where p.corrida_id = c.id and p.etapa = 'listo') listos
       from piloto_corridas c where organizacion_id = $1 order by id desc limit 30`, [organizacionId]);
  return r.rows;
}

// Costos: se suman en la base (varias tareas en paralelo).
// Se guardan también las corridas de Apify: al terminar, Apify todavía no
// asentó todos los cobros (piloto #6: AliExpress figuraba en cero) y el costo
// final se vuelve a leer después (costoApifyFinal).
async function sumarApify(id: number, usd: number | null, runIds: (string | undefined)[] = []) {
  const runs = runIds.filter(Boolean);
  if (!usd && !runs.length) return;
  await pool.query(
    `update piloto_corridas set costos = jsonb_set(jsonb_set(costos, '{apifyUsd}', to_jsonb(coalesce((costos->>'apifyUsd')::float, 0) + $2::float)),
       '{apifyRuns}', coalesce(costos->'apifyRuns', '[]'::jsonb) || $3::jsonb) where id = $1`, [id, usd ?? 0, JSON.stringify(runs)]);
}

/** Relee de Apify el costo final de las corridas del piloto y lo guarda. Una
 *  hora después de creado el piloto ya no cambia y se deja de consultar. */
export async function costoApifyFinal(c: Corrida) {
  const runs = c.costos.apifyRuns ?? [];
  if (c.estado !== "listo" || !runs.length || c.costos.apifyFinal) return c.costos.apifyUsd ?? 0;
  const finales = await costosFinales(runs);
  const leidos = Object.values(finales);
  if (leidos.length < runs.length) return c.costos.apifyUsd ?? 0;
  const usd = leidos.reduce((t, x) => t + (x.usd ?? 0), 0);
  const final = Date.now() - new Date(c.creada_el).getTime() > 3_600_000;
  await pool.query(
    "update piloto_corridas set costos = costos || jsonb_build_object('apifyUsd', $2::float, 'apifyFinal', $3::boolean) where id = $1", [c.id, usd, final]);
  return usd;
}
async function sumarClaude(id: number, etapa: string, tin: number, tout: number, usd: number) {
  if (!tin && !tout) return;
  await pool.query(
    `update piloto_corridas set costos = jsonb_set(jsonb_set(costos, '{claude}', coalesce(costos->'claude', '{}')), array['claude', $2::text],
       jsonb_build_object('in', coalesce((costos->'claude'->$2::text->>'in')::int, 0) + $3::int, 'out', coalesce((costos->'claude'->$2::text->>'out')::int, 0) + $4::int,
                          'usd', coalesce((costos->'claude'->$2::text->>'usd')::float, 0) + $5::float))
     where id = $1`, [id, etapa, tin, tout, usd]);
}
async function gastoApify(id: number) {
  const r = await pool.query<{ usd: number | null }>("select (costos->>'apifyUsd')::float usd from piloto_corridas where id = $1", [id]);
  return r.rows[0]?.usd ?? 0;
}

async function insertarProducto(corridaId: number, categoriaId: string, lado: string, pub: PubML, palabra: string | null, campeon: boolean) {
  await pool.query(
    `insert into piloto_productos (corrida_id, categoria_id, lado, palabra, campeon, item_id, producto_id, titulo, url, foto, precio, vendidos, vendidos_texto, opiniones)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [corridaId, categoriaId, lado, palabra, campeon, pub.itemId, pub.productoId, pub.titulo, pub.url, pub.foto, pub.precio, pub.vendidos, pub.vendidosTexto, pub.opiniones]);
}

/** Etapa Mercado Libre de una categoría: listado (vendidos), tendencias
 *  (buscados), cruce, y los productos elegidos de cada lado. */
async function etapaML(c: Corrida, categoriaId: string) {
  const p = c.parametros;
  const av: AvanceCategoria = { hecho: false, errores: [] };
  const tope = p.topeApifyUsd;
  let gastado = await gastoApify(c.id);
  const puedeGastar = (usd: number) => { if (gastado + usd > tope) return false; gastado += usd; return true; };

  av.urlListado = await urlDeCategoria(categoriaId, c.organizacion_id, p.precioMin, p.precioMax, !!p.soloLocal).catch(() => undefined);
  const sinBuscados = { palabras: [], pubs: [] as (PubML & { palabra: string })[], error: null as string | null };
  const [lst, bus] = await Promise.all([
    av.urlListado ? listadoDeCategoria(av.urlListado, categoriaId, p.listado, p.precioMin, p.precioMax, puedeGastar)
      : Promise.resolve({ actores: [], listado: [] as PubML[] }),
    // (28/9) Fer comprobó que las palabras de tendencias no sirven: con
    // soloListado se toman sólo los primeros del listado de la categoría.
    p.soloListado ? Promise.resolve(sinBuscados)
      : buscadosDeCategoria(categoriaId, c.organizacion_id, p.porCategoria, p.precioMin, p.precioMax)
        .catch((e) => ({ palabras: [], pubs: [], error: String(e).slice(0, 200) })),
  ]);
  if (!av.urlListado) av.errores!.push("No se pudo armar la dirección del listado de la categoría");
  for (const a of lst.actores) await sumarApify(c.id, a.costoUsd, [a.runId]);
  av.actores = lst.actores;
  av.listado = lst.listado;
  av.palabras = bus.palabras;
  if (bus.error) av.errores!.push(bus.error);

  const vendidos = lst.listado.slice(0, p.porCategoria);
  // El cruce se hace contra todo el listado leído, no sólo los 3 primeros.
  const cr = bus.pubs.length ? await cruzar(bus.pubs, lst.listado) : { pares: [], tokensIn: 0, tokensOut: 0, usd: 0 };
  await sumarClaude(c.id, "cruce", cr.tokensIn, cr.tokensOut, cr.usd);
  av.cruce = cr.pares.map((x) => ({ buscado: bus.pubs[x.b].titulo, vendido: lst.listado[x.v].titulo, como: x.como }));
  const buscadosCampeones = new Set(cr.pares.map((x) => x.b));
  const vendidosCampeones = new Set(cr.pares.map((x) => x.v));

  // Si una tanda anterior se cortó a mitad de esta categoría, se rehace limpia.
  await pool.query("delete from piloto_productos where corrida_id = $1 and categoria_id = $2", [c.id, categoriaId]);
  for (const [i, pub] of bus.pubs.entries()) await insertarProducto(c.id, categoriaId, "buscado", pub, pub.palabra, buscadosCampeones.has(i));
  // Un vendido que es la misma publicación o producto que un buscado no se
  // repite: ya está como buscado (y el cruce lo marca campeón).
  const mismo = (a: PubML, b: PubML) => (!!a.itemId && a.itemId === b.itemId) || (!!a.productoId && a.productoId === b.productoId)
    || a.titulo.trim().toLowerCase() === b.titulo.trim().toLowerCase();
  for (const [i, pub] of vendidos.entries()) {
    if (bus.pubs.some((b) => mismo(b, pub))) continue;
    await insertarProducto(c.id, categoriaId, "vendido", pub, null, vendidosCampeones.has(i));
  }
  av.hecho = true;
  await pool.query("update piloto_corridas set avance = jsonb_set(avance, array[$2::text], $3::jsonb) where id = $1", [c.id, categoriaId, JSON.stringify(av)]);
}

type FilaProducto = { id: number; titulo: string; foto: string | null; precio: number | null; caja: Caja | null;
  china: { candidatos?: unknown[]; en?: string; reintentar?: { en: string; motivo: string }; previa?: { en: string; motivo: string } } | null;
  juicio: Juicio | null;
  item_id: string | null; producto_id: string | null; datos_ml: string | null; categoria_id: string };

async function productosEn(corridaId: number, etapa: string, n: number) {
  const r = await pool.query<FilaProducto>("select id, titulo, foto, precio, caja, china, juicio, item_id, producto_id, datos_ml, categoria_id from piloto_productos where corrida_id = $1 and etapa = $2 order by id limit $3", [corridaId, etapa, n]);
  return r.rows;
}

/** Hace una tanda de trabajo. Devuelve si quedó algo por hacer. */
export async function avanzar(id: number, organizacionId: string, hasta: number): Promise<{ terminado: boolean; ocupado?: boolean; hecho: string }> {
  await asegurarEsquema();
  // Candado: si otra tanda empezó hace menos de 5 minutos, no se pisa.
  const tomada = await pool.query(
    `update piloto_corridas set trabajando_desde = now() where id = $1 and organizacion_id = $2
       and (trabajando_desde is null or trabajando_desde < now() - interval '5 minutes') returning id`, [id, organizacionId]);
  if (!tomada.rowCount) return { terminado: false, ocupado: true, hecho: "Hay otra tanda trabajando; espero." };
  const hechos: string[] = [];
  try {
    const c = (await corrida(id, organizacionId))!;
    const p = c.parametros;
    const quedaTiempo = (ms: number) => Date.now() + ms < hasta;

    // 1) Mercado Libre: de a 3 categorías en paralelo (cada una ~2-3 min).
    if (c.estado === "ml") {
      let pendientes = p.categorias.filter((cat) => !c.avance[cat.id]?.hecho);
      while (pendientes.length && quedaTiempo(200_000)) {
        const tanda = pendientes.slice(0, 3);
        await Promise.all(tanda.map(async (cat) => {
          try {
            await etapaML(c, cat.id);
            hechos.push(`Mercado Libre: ${cat.ruta.split(" › ").pop()}`);
          } catch (e) {
            console.error("[piloto] etapa ML", cat.id, e);
            hechos.push(`Mercado Libre: ${cat.ruta.split(" › ").pop()} falló, se reintenta`);
          }
        }));
        const recargada = (await corrida(id, organizacionId))!;
        c.avance = recargada.avance;
        pendientes = p.categorias.filter((cat) => !c.avance[cat.id]?.hecho);
      }
      if (pendientes.length) return { terminado: false, hecho: hechos.join(" · ") || "Sigue con Mercado Libre" };
      await pool.query("update piloto_corridas set estado = 'productos' where id = $1", [id]);
    }

    // 2) Caja y flete, de a 8 productos por pedido a Claude.
    while (quedaTiempo(90_000)) {
      const lote = await productosEn(id, "caja", 8);
      if (!lote.length) break;
      // Primero lo que dice Mercado Libre (gratis): paquete en los atributos,
      // o el texto de atributos y descripción para que Claude lo lea.
      const deML = await Promise.all(lote.map((x) => datosDeEnvio({ itemId: x.item_id, productoId: x.producto_id }, organizacionId)
        .catch(() => ({ caja: null, texto: "" }))));
      // Sin medidas tampoco alcanza: el flete en barco del costo se cobra por volumen.
      const faltan = lote.map((x, i) => ({ ...x, texto: deML[i].texto })).filter((_, i) => !deML[i].caja?.largo);
      // Los que no traen peso: búsqueda web (pilotos nuevos) o estimación por foto (viejos).
      const r = !faltan.length ? { cajas: new Map<number, Caja>(), error: null, tokensIn: 0, tokensOut: 0, usd: 0 }
        : p.soloListado ? await cajasConWeb(faltan) : await estimarCajas(faltan);
      await sumarClaude(id, "caja", r.tokensIn, r.tokensOut, r.usd);
      for (const [i, x] of lote.entries()) {
        await pool.query("update piloto_productos set datos_ml = $2 where id = $1", [x.id, deML[i].texto || null]);
        const deMl = deML[i].caja, deWeb = r.cajas.get(x.id);
        // El peso de Mercado Libre manda; las medidas, de la búsqueda si ML no las trae.
        const caja = deMl && deWeb && !deMl.largo
          ? { ...deWeb, kg: deMl.kg, fuente: deMl.fuente, nota: `${deMl.nota ?? "peso de Mercado Libre"}; medidas: ${deWeb.nota ?? "búsqueda web"}` }
          : deMl ?? deWeb ?? null;
        const f = caja ? flete(caja, x.precio, p) : null;
        // Fuera de la franja: no se busca en China ni pasa por el juez.
        const etapa = f?.franja === "fuera" ? "listo" : "china";
        await pool.query("update piloto_productos set caja = $2, flete_usd = $3, flete_pct = $4, franja = $5, etapa = $6, error = $7 where id = $1",
          [x.id, caja, f?.usd ?? null, f?.pct ?? null, f?.franja ?? null, etapa, caja ? null : `Sin caja estimada${r.error ? `: ${r.error}` : ""} (se busca igual)`]);
      }
      hechos.push(`caja de ${lote.length}`);
    }

    // 3) China, de a 4 productos en paralelo.
    let gastado = await gastoApify(id);
    const puedeGastar = (usd: number) => { if (gastado + usd > p.topeApifyUsd) return false; gastado += usd; return true; };
    while (quedaTiempo(150_000)) {
      const lote = await productosEn(id, "china", 4);
      if (!lote.length) break;
      await Promise.all(lote.map(async (x) => {
        // Si viene de una búsqueda que no encontró nada, se busca con otras palabras (una sola vez).
        const previa = x.china?.reintentar;
        const r = await buscarEnChina(x.titulo, p, puedeGastar, { texto: x.datos_ml ?? undefined, previa });
        await sumarApify(id, r.costoUsd, r.runIds);
        await sumarClaude(id, "busqueda", r.tokensIn, r.tokensOut, r.claudeUsd ?? 0);
        await pool.query("update piloto_productos set china = $2, etapa = 'juez', error = $3 where id = $1",
          [x.id, { en: r.en, zh: r.zh, candidatos: r.candidatos, errores: r.errores, muestra: r.muestra, ...(previa ? { previa } : {}) },
            r.errores.join(" · ") || null]);
      }));
      hechos.push(`China de ${lote.length}`);
    }

    // 4) Juez, de a 4 en paralelo.
    while (quedaTiempo(120_000)) {
      const lote = await productosEn(id, "juez", 4);
      if (!lote.length) break;
      await Promise.all(lote.map(async (x) => {
        const cands = (x.china?.candidatos ?? []) as Parameters<typeof juzgar>[1];
        const r = await juzgar({ titulo: x.titulo, foto: x.foto, precio: x.precio, texto: x.datos_ml ?? undefined }, cands, p);
        await sumarClaude(id, "juez", r.tokensIn, r.tokensOut, r.usd);
        const juicio = { ...r.juicio, ...(x.china?.previa ? { busquedaPrevia: x.china.previa } : {}) };
        // Sin ningún "sí": se replantea la búsqueda una vez (Fer, 28/9: el producto
        // existe en China; si no aparece, se buscó mal).
        const hayIgual = (juicio.veredictos ?? []).some((v) => v.v === "si");
        if (!hayIgual && !x.china?.previa && !juicio.error) {
          await pool.query("update piloto_productos set china = china || jsonb_build_object('reintentar', $2::jsonb), juicio = $3, etapa = 'china' where id = $1",
            [x.id, JSON.stringify({ en: x.china?.en ?? "", motivo: juicio.motivo || "ningún candidato era el mismo producto" }), juicio]);
          return;
        }
        await pool.query("update piloto_productos set juicio = $2, etapa = $4, error = coalesce($3, error) where id = $1",
          [x.id, juicio, juicio.error ?? null, hayIgual ? "ficha" : "listo"]);
      }));
      hechos.push(`juez de ${lote.length}`);
    }

    // 5) Fichas de China de los "sí": precio del pedido mínimo y caja; se
    // elige otra vez con esos precios y se calcula el costo.
    // Leer la ficha (hasta 2 minutos) y clasificar la NCM con el modelo grande: margen amplio.
    while (quedaTiempo(200_000)) {
      const lote = await productosEn(id, "ficha", 3);
      if (!lote.length) break;
      await Promise.all(lote.map(async (x) => {
        const j = x.juicio!;
        const cands = (x.china?.candidatos ?? []) as Candidato[];
        const si = (j.veredictos ?? []).filter((v) => v.v === "si" && cands[v.n - 1])
          .sort((a, b) => (cands[a.n - 1].usd ?? 1e9) - (cands[b.n - 1].usd ?? 1e9)).slice(0, 3);
        const fichas: Record<string, Ficha> = {};
        await Promise.all(si.map(async (v) => {
          const url = cands[v.n - 1].url;
          if (!url || !puedeGastar(0.03)) { fichas[v.n] = { ok: false, error: url ? "tope de gasto de Apify" : "sin dirección" }; return; }
          const f = await leerFicha(url);
          await sumarApify(id, f.costoUsd, [f.runId]);
          fichas[v.n] = { ok: f.ok, tramos: f.tramos, caja: f.caja, error: f.error, muestra: f.muestra };
        }));
        // Lo que el juez estimó para lo que falta (accesorios): se mantiene.
        const el = j.elegido != null ? cands[j.elegido - 1] : null;
        const uEl = (j.veredictos ?? []).find((v) => v.n === j.elegido)?.unidades ?? 1;
        const faltantes = el?.usd != null && j.costoUsd ? Math.max(0, j.costoUsd - uEl * el.usd) : 0;
        let mejor: { n: number; total: number } | null = null;
        for (const v of si) {
          const f = fichas[v.n];
          const minimo = f?.tramos?.[0]?.desde ?? cands[v.n - 1].minimo;
          if (minimo != null && minimo > p.minimoMax) continue;
          const precio = precioMinimo(f) ?? cands[v.n - 1].usd;
          if (precio == null) continue;
          const total = Math.round(((v.unidades ?? 1) * precio + faltantes) * 100) / 100;
          if (!mejor || total < mejor.total) mejor = { n: v.n, total };
        }
        const juicio: Juicio = { ...j, fichas, elegidoJuez: j.elegido, elegido: mejor?.n ?? j.elegido, costoUsd: mejor?.total ?? j.costoUsd };
        const conCandidato = juicio.elegido != null && !!juicio.costoUsd;
        if (!conCandidato) {
          await pool.query("update piloto_productos set juicio = $2, costo = null, etapa = 'listo' where id = $1", [x.id, juicio]);
          return;
        }
        // NCM: una sola vez en la vida por producto de China, con la ficha (material) como contexto.
        const cand = cands[juicio.elegido! - 1];
        const clave = claveDe(cand.url);
        const clas = clave ? await clasificar(clave, {
          mlTitulo: x.titulo, mlTexto: x.datos_ml, componentes: j.componentes, chinaTitulo: cand.titulo,
          chinaFicha: fichas[juicio.elegido!]?.muestra ?? null, sugerida: j.ncm ?? null,
        }).catch(() => null) : null;
        if (clas?.usd) await sumarClaude(id, "ncm", clas.tokensIn, clas.tokensOut, clas.usd);
        const ncm = clas?.ncm ?? j.ncm;
        const otra = clas ? clas.alternativa : j.ncmAlternativa;
        const [tasas, alternativa, deML] = await Promise.all([
          ncm ? tasasDe(ncm, clas?.arancel).catch(() => null) : Promise.resolve(null),
          otra ? tasasDe(otra).catch(() => null) : Promise.resolve(null),
          costosML(organizacionId, x.categoria_id, x.precio, x.caja),
        ]);
        const clasificacion = clas ? { ...clas, usd: undefined, tokensIn: undefined, tokensOut: undefined } : null;
        await pool.query("update piloto_productos set juicio = $2, costo = $3, etapa = 'listo' where id = $1",
          [x.id, juicio, { tasas, alternativa, ml: deML, clasificacion }]);
      }));
      hechos.push(`fichas de ${lote.length}`);
    }

    const faltan = await pool.query<{ n: number }>("select count(*)::int n from piloto_productos where corrida_id = $1 and etapa <> 'listo'", [id]);
    const terminado = faltan.rows[0].n === 0;
    if (terminado) await pool.query("update piloto_corridas set estado = 'listo' where id = $1", [id]);
    return { terminado, hecho: hechos.join(" · ") || "Sin cambios" };
  } finally {
    await pool.query("update piloto_corridas set trabajando_desde = null where id = $1", [id]);
  }
}

export async function productosDe(corridaId: number) {
  const r = await pool.query("select * from piloto_productos where corrida_id = $1 order by categoria_id, lado, id", [corridaId]);
  return r.rows as {
    id: number; categoria_id: string; lado: string; palabra: string | null; campeon: boolean; item_id: string | null;
    titulo: string; url: string | null; foto: string | null; precio: number | null; vendidos: number | null; vendidos_texto: string | null;
    opiniones: number | null; caja: Caja | null; flete_usd: number | null; flete_pct: number | null; franja: import("./tipos").Franja | null;
    china: { en?: string; zh?: string; candidatos?: import("./tipos").Candidato[]; errores?: string[]; muestra?: string; previa?: { en: string; motivo: string } } | null;
    datos_ml: string | null; costo: import("./costo").DatosCosto | null;
    juicio: import("./tipos").Juicio | null; revision: string | null; comentario: string | null; etapa: string; error: string | null;
  }[];
}

export async function revisar(productoId: number, organizacionId: string, revision: string | null, comentario: string | null) {
  await pool.query(
    `update piloto_productos p set revision = coalesce($3, p.revision), comentario = $4 from piloto_corridas c
      where p.id = $1 and p.corrida_id = c.id and c.organizacion_id = $2`, [productoId, organizacionId, revision, comentario]);
}

/** Lápiz de la NCM: guarda la corrección de Fer para ese producto de China
 *  (vale para siempre) y rehace las tasas del producto. */
export async function corregirNcmProducto(productoId: number, organizacionId: string, ncmTexto: string) {
  const r = await pool.query<{ china: { candidatos?: Candidato[] } | null; juicio: Juicio | null; costo: import("./costo").DatosCosto | null }>(
    `select p.china, p.juicio, p.costo from piloto_productos p join piloto_corridas c on c.id = p.corrida_id
      where p.id = $1 and c.organizacion_id = $2`, [productoId, organizacionId]);
  const f = r.rows[0];
  const cand = f?.juicio?.elegido != null ? f.china?.candidatos?.[f.juicio.elegido - 1] : null;
  const clave = claveDe(cand?.url);
  if (!f || !cand || !clave) return false;
  const clas = await corregir(clave, ncmTexto, cand.titulo);
  if (!clas) return false;
  const tasas = await tasasDe(clas.ncm, clas.arancel);
  await pool.query("update piloto_productos set costo = coalesce(costo, '{}'::jsonb) || $2::jsonb where id = $1",
    [productoId, JSON.stringify({ tasas, alternativa: null, clasificacion: clas })]);
  return true;
}
