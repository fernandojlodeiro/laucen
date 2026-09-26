// Piloto: el motor. Vercel corta cada pedido a los 5 minutos, así que el
// trabajo avanza por tandas: cada llamada a avanzar() hace lo que puede
// hasta `hasta` y deja todo guardado; la pantalla la vuelve a llamar hasta
// que termina. Con candado: una sola tanda a la vez por piloto.

import { pool } from "@/db";
import { USD_POR_MTOK } from "@/lib/claude";
import { asegurarEsquema } from "./esquema";
import { buscadosDeCategoria, cruzar, listadoDeCategoria, urlDeCategoria } from "./ml";
import { buscarEnChina, estimarCajas, flete, juzgar } from "./china";
import type { AvanceCategoria, Caja, Parametros, PubML } from "./tipos";

export type Corrida = {
  id: number; organizacion_id: string; creada_el: Date; parametros: Parametros; estado: string;
  avance: Record<string, AvanceCategoria>; costos: Costos; trabajando_desde: Date | null;
};
export type Costos = { apifyUsd?: number; claude?: Record<string, { in: number; out: number }> };

export function usdDeClaude(c: Costos) {
  return Object.values(c.claude ?? {}).reduce((t, x) => t + (x.in * USD_POR_MTOK.entrada + x.out * USD_POR_MTOK.salida) / 1_000_000, 0);
}

export async function crearCorrida(organizacionId: string, p: Parametros) {
  await asegurarEsquema();
  const r = await pool.query<{ id: number }>("insert into piloto_corridas (organizacion_id, parametros) values ($1, $2) returning id", [organizacionId, p]);
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
async function sumarApify(id: number, usd: number | null) {
  if (!usd) return;
  await pool.query("update piloto_corridas set costos = jsonb_set(costos, '{apifyUsd}', to_jsonb(coalesce((costos->>'apifyUsd')::float, 0) + $2::float)) where id = $1", [id, usd]);
}
async function sumarClaude(id: number, etapa: string, tin: number, tout: number) {
  if (!tin && !tout) return;
  await pool.query(
    `update piloto_corridas set costos = jsonb_set(jsonb_set(costos, '{claude}', coalesce(costos->'claude', '{}')), array['claude', $2::text],
       jsonb_build_object('in', coalesce((costos->'claude'->$2::text->>'in')::int, 0) + $3::int, 'out', coalesce((costos->'claude'->$2::text->>'out')::int, 0) + $4::int))
     where id = $1`, [id, etapa, tin, tout]);
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

  av.urlListado = await urlDeCategoria(categoriaId, c.organizacion_id, p.precioMin, p.precioMax).catch(() => undefined);
  const [lst, bus] = await Promise.all([
    av.urlListado ? listadoDeCategoria(av.urlListado, categoriaId, p.listado, p.precioMin, p.precioMax, puedeGastar)
      : Promise.resolve({ actores: [], listado: [] as PubML[] }),
    buscadosDeCategoria(categoriaId, c.organizacion_id, p.porCategoria, p.precioMin, p.precioMax)
      .catch((e) => ({ palabras: [], pubs: [], error: String(e).slice(0, 200) })),
  ]);
  if (!av.urlListado) av.errores!.push("No se pudo armar la dirección del listado de la categoría");
  for (const a of lst.actores) await sumarApify(c.id, a.costoUsd);
  av.actores = lst.actores;
  av.listado = lst.listado;
  av.palabras = bus.palabras;
  if (bus.error) av.errores!.push(bus.error);

  const vendidos = lst.listado.slice(0, p.porCategoria);
  // El cruce se hace contra todo el listado leído, no sólo los 3 primeros.
  const cr = await cruzar(bus.pubs, lst.listado);
  await sumarClaude(c.id, "cruce", cr.tokensIn, cr.tokensOut);
  av.cruce = cr.pares.map((x) => ({ buscado: bus.pubs[x.b].titulo, vendido: lst.listado[x.v].titulo, como: x.como }));
  const buscadosCampeones = new Set(cr.pares.map((x) => x.b));
  const vendidosCampeones = new Set(cr.pares.map((x) => x.v));

  // Si una tanda anterior se cortó a mitad de esta categoría, se rehace limpia.
  await pool.query("delete from piloto_productos where corrida_id = $1 and categoria_id = $2", [c.id, categoriaId]);
  for (const [i, pub] of bus.pubs.entries()) await insertarProducto(c.id, categoriaId, "buscado", pub, pub.palabra, buscadosCampeones.has(i));
  for (const [i, pub] of vendidos.entries()) await insertarProducto(c.id, categoriaId, "vendido", pub, null, vendidosCampeones.has(i));
  av.hecho = true;
  await pool.query("update piloto_corridas set avance = jsonb_set(avance, array[$2::text], $3::jsonb) where id = $1", [c.id, categoriaId, JSON.stringify(av)]);
}

type FilaProducto = { id: number; titulo: string; foto: string | null; precio: number | null; caja: Caja | null; china: { candidatos?: unknown[] } | null };

async function productosEn(corridaId: number, etapa: string, n: number) {
  const r = await pool.query<FilaProducto>("select id, titulo, foto, precio, caja, china from piloto_productos where corrida_id = $1 and etapa = $2 order by id limit $3", [corridaId, etapa, n]);
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
      const r = await estimarCajas(lote);
      await sumarClaude(id, "caja", r.tokensIn, r.tokensOut);
      for (const x of lote) {
        const caja = r.cajas.get(x.id) ?? null;
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
        const r = await buscarEnChina(x.titulo, p, puedeGastar);
        await sumarApify(id, r.costoUsd);
        await pool.query("update piloto_productos set china = $2, etapa = 'juez', error = $3 where id = $1",
          [x.id, { en: r.en, zh: r.zh, candidatos: r.candidatos, errores: r.errores }, r.errores.join(" · ") || null]);
      }));
      hechos.push(`China de ${lote.length}`);
    }

    // 4) Juez, de a 4 en paralelo.
    while (quedaTiempo(120_000)) {
      const lote = await productosEn(id, "juez", 4);
      if (!lote.length) break;
      await Promise.all(lote.map(async (x) => {
        const cands = (x.china?.candidatos ?? []) as Parameters<typeof juzgar>[1];
        const r = await juzgar({ titulo: x.titulo, foto: x.foto, precio: x.precio }, cands, p);
        await sumarClaude(id, "juez", r.tokensIn, r.tokensOut);
        await pool.query("update piloto_productos set juicio = $2, etapa = 'listo', error = coalesce($3, error) where id = $1",
          [x.id, r.juicio, r.juicio.error ?? null]);
      }));
      hechos.push(`juez de ${lote.length}`);
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
    china: { en?: string; zh?: string; candidatos?: import("./tipos").Candidato[]; errores?: string[] } | null;
    juicio: import("./tipos").Juicio | null; revision: string | null; comentario: string | null; etapa: string; error: string | null;
  }[];
}

export async function revisar(productoId: number, organizacionId: string, revision: string | null, comentario: string | null) {
  await pool.query(
    `update piloto_productos p set revision = coalesce($3, p.revision), comentario = $4 from piloto_corridas c
      where p.id = $1 and p.corrida_id = c.id and c.organizacion_id = $2`, [productoId, organizacionId, revision, comentario]);
}
