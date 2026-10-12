// Catálogo con nuestra marca (Fer, 12/10). Mercado Libre ata solo nuestras publicaciones a productos
// de catálogo (o a páginas que arma juntando publicaciones parecidas) que llevan la marca de otro
// vendedor, y no hay forma de desatarlas. Lo que sí se puede es proponerle un producto de catálogo con
// nuestra marca (Brand Central, /catalog_suggestions) y, cuando lo aprueba, pasar ahí nuestras
// publicaciones. En las cuentas con el interruptor «Catálogo con nuestra marca» prendido
// (canal.config.catalogo_propio_auto; prenderlo es el clic de Fer), cada 30 minutos:
//   1. sigue las propuestas en trámite: aprobada → engancha las publicaciones comunes de las
//      cuentas de esa marca; «a corregir» → la IA corrige lo que ML observó (hasta 2 veces);
//      rechazada → queda anotada con el motivo;
//   2. con el cupo libre de cada cuenta (las propuestas en trámite al mismo tiempo), propone los
//      productos nuestros atados a un catálogo o página de otra marca, los que más venden primero.
// La marca de la propuesta es la de la cuenta (canal.config.marca_publicaciones). Sólo productos sin
// marca propia (los que llevan la marca de la cuenta, pautas.ts); un catálogo de marca de fábrica
// (Arduino original, Asus…) es legítimo y no se toca. Todo lo que va a ML pasa por la cola.

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolar, type CambioMl } from "@/lib/mercadolibre/cola";
import { MARCAS_NUESTRAS, MARCAS_VETADAS } from "@/lib/mercadolibre/catalogo-marca";
import { esMarcaReemplazable } from "@/lib/mercadolibre/pautas";
import { sinFotosConMarca } from "@/lib/mercadolibre/fotos-marca";
import { hayClaude, jsonDe, pedirClaude } from "@/lib/claude";

const normal = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** ¿Este catálogo hay que reemplazarlo por uno nuestro? Sí si es de una marca vetada, o si es una página armada por ML
 *  («flex») con la marca de otro vendedor. No si es nuestro, genérico, o un catálogo de verdad de una marca de fábrica. Pura. */
export function catalogoAjeno(marca: string | null, tipo: string | null): boolean {
  const m = normal(marca);
  if (MARCAS_NUESTRAS.includes(m)) return false;
  if (MARCAS_VETADAS.includes(m)) return true;
  if (esMarcaReemplazable(marca)) return false;
  return tipo === "flex";
}

/** Atributos que no describen el producto (son de la publicación o del envío): no van en la propuesta. */
const NO_VA = /^(SELLER_SKU|ITEM_CONDITION|GTIN|EMPTY_GTIN_REASON|SELLER_PACKAGE_.*|PACKAGE_.*|SHIPMENT_.*|IS_FLAMMABLE|IS_KIT|IS_FACTORY_KIT|UNITS_PER_PACK|SALE_FORMAT|PRODUCT_DATA_SOURCE|IS_SUITABLE_FOR_SHIPMENT|.*_PACKAGE)$/;

type AtributoItem = { id: string; value_id?: string | null; value_name?: string | null };
export type AtributoSugerencia = { id: string; values: { name: string }[] };

/** Los atributos de la propuesta, desde los de nuestra publicación, con la marca de la cuenta. Pura. */
export function atributosSugerencia(atributos: AtributoItem[], marca: string): AtributoSugerencia[] {
  const vistos = new Set<string>();
  const res: AtributoSugerencia[] = [];
  for (const a of atributos) {
    const v = (a.value_name ?? "").trim();
    if (!v || a.id === "BRAND" || NO_VA.test(a.id) || vistos.has(a.id)) continue;
    vistos.add(a.id);
    res.push({ id: a.id, values: [{ name: v }] });
  }
  return [{ id: "BRAND", values: [{ name: marca }] }, ...res];
}

/** El nombre del producto de catálogo: el título sin las marcas nuestras ni «Genérico», con la marca al final. Pura. */
export function tituloSugerencia(titulo: string, marca: string): string {
  const fuera = new Set(["tiendavirtual", "daitom", "deirolab", "laucen", "generico", "generica", "oem", normal(marca)]);
  const palabras = titulo.split(/\s+/).filter((p) => p && !fuera.has(normal(p).replace(/[^a-z0-9]/g, "")));
  let base = palabras.join(" ");
  const max = 60 - marca.length - 1;
  if (base.length > max) base = base.slice(0, max).replace(/\s+\S*$/, "");
  return `${base} ${marca}`.trim();
}

/** Lo que ML dice que está mal de una propuesta (validate o validations), en una lista de textos. Pura. */
export function motivosValidacion(datos: unknown): { errores: string[]; avisos: string[] } {
  const d = datos as { validations?: { type?: string; message?: string }[]; cause?: { type?: string; message?: string }[]; message?: string } | null;
  const lista = [...(d?.validations ?? []), ...(d?.cause ?? [])];
  const errores = lista.filter((x) => x.type !== "warning" && x.message).map((x) => x.message!);
  const avisos = lista.filter((x) => x.type === "warning" && x.message).map((x) => x.message!);
  if (!lista.length && d?.message && typeof d.message === "string") errores.push(d.message);
  return { errores, avisos };
}

type Item = {
  canal_id: number; item_id: string; sku: string; titulo: string; dominio: string | null; vendidos: number;
  atributos: AtributoItem[]; fotos: { id?: string; url?: string; secure_url?: string }[];
};

/** La IA corrige los atributos que ML observó (sin inventar: si no sabe, deja el valor como está). */
async function corregirConIA(titulo: string, atributos: AtributoSugerencia[], problemas: string[]): Promise<AtributoSugerencia[] | null> {
  if (!hayClaude() || !problemas.length) return null;
  const r = await pedirClaude({
    modelo: "chico", maxTokens: 1500,
    system: "Corregís los datos de una propuesta de producto de catálogo de Mercado Libre según lo que Mercado Libre observó. " +
      "Cambiás sólo los valores observados, con el formato del ejemplo que da Mercado Libre; un dato que no podés corregir con seguridad lo sacás. " +
      "Contestás sólo un objeto JSON.",
    contenido: `Producto: ${titulo}\n\nDatos actuales: ${JSON.stringify(atributos)}\n\nLo que observó Mercado Libre:\n- ${problemas.join("\n- ")}\n\n` +
      "Devolvé {\"atributos\": [los datos corregidos, en el mismo formato {id, values:[{name}]}]}.",
  });
  const j = "texto" in r ? jsonDe<{ atributos?: AtributoSugerencia[] }>(r.texto) : null;
  const lista = j?.atributos?.filter((a) => a?.id && Array.isArray(a.values) && a.values.every((v) => typeof v?.name === "string" && v.name.trim()));
  if (!lista?.length) return null;
  return lista.some((a) => a.id === "BRAND") ? lista : [atributos.find((a) => a.id === "BRAND")!, ...lista];
}

/** El cuerpo de la propuesta para un producto, con lo que tiene nuestra publicación más vendida. */
async function armarPropuesta(it: Item, marca: string): Promise<Record<string, unknown> | null> {
  if (!it.dominio) return null;
  const fotos = (await sinFotosConMarca(it.fotos)).filter((f) => f.id).slice(0, 10).map((f) => ({ id: f.id! }));
  if (!fotos.length) return null;
  return { title: tituloSugerencia(it.titulo, marca), domain_id: it.dominio, pictures: fotos, attributes: atributosSugerencia(it.atributos, marca) };
}

/** Lee y guarda la marca de los productos de catálogo que no se conocen (o se leyeron hace más de una semana). */
async function leerMarcas(cuenta: CuentaMl, productos: string[], hasta: number): Promise<void> {
  const conocidos = new Set((await consulta<{ producto_id: string }>(
    "select producto_id from ml_catalogo_marca where producto_id = any($1) and leido_ts > now() - interval '7 days'", [productos])).map((x) => x.producto_id));
  for (const p of productos.filter((x) => !conocidos.has(x))) {
    if (Date.now() > hasta) break;
    const r = await ml<{ type?: string; name?: string; attributes?: { id: string; value_name?: string | null }[] }>(cuenta, "GET", `/products/${p}`);
    if (r.status !== 200) continue;
    await consulta(`insert into ml_catalogo_marca (producto_id, marca, tipo, nombre) values ($1, $2, $3, $4)
                    on conflict (producto_id) do update set marca = excluded.marca, tipo = excluded.tipo, nombre = excluded.nombre, leido_ts = now()`,
      [p, r.datos.attributes?.find((a) => a.id === "BRAND")?.value_name ?? "", r.datos.type ?? null, r.datos.name ?? null]);
  }
}

/** Nuestras publicaciones activas de la organización, con lo que hace falta para proponer y enganchar. */
async function publicaciones(org: string): Promise<(Item & { catalogo: string | null; de_catalogo: boolean })[]> {
  return consulta(`
    select m.canal_id::int canal_id, m.item_id, m.sku, coalesce(m.datos_externos -> 'ml' ->> 'family_name', m.datos_externos -> 'ml' ->> 'title') titulo,
           m.datos_externos -> 'ml' ->> 'domain_id' dominio, coalesce(m.vendidos, 0)::int vendidos,
           coalesce(m.datos_externos -> 'ml' -> 'attributes', '[]') atributos, coalesce(m.datos_externos -> 'ml' -> 'pictures', '[]') fotos,
           m.datos_externos -> 'ml' ->> 'catalog_product_id' catalogo, coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) de_catalogo
      from meli_item m join canal c on c.id = m.canal_id and c.tipo = 'mercadolibre' and c.estado = 'activo'
     where m.organizacion_id = $1 and m.estado = 'active' and m.sku is not null and m.sku <> ''`, [org]);
}

export type InformeCatalogoPropio = { propuestas: number; aprobadas: number; corregidas: number; enganches: number; sinCupo: boolean };

/** Una vuelta para una organización. */
async function vueltaOrg(org: string, canales: { id: number; marca: string }[], hasta: number): Promise<InformeCatalogoPropio> {
  const inf: InformeCatalogoPropio = { propuestas: 0, aprobadas: 0, corregidas: 0, enganches: 0, sinCupo: false };
  const cuentas = new Map<number, CuentaMl>();
  for (const c of canales) { const k = await cuentaDelCanal(org, c.id); if (k && k.estado === "activa") cuentas.set(c.id, k); }
  if (!cuentas.size) return inf;
  const marcas = [...new Set(canales.map((c) => c.marca))];
  const pubs = await publicaciones(org);

  // ── 1. Las propuestas en trámite ──
  // Las que salieron por la cola: su número de propuesta (o el motivo si ML no la aceptó).
  for (const f of await consulta<{ marca: string; sku: string; estado: string; respuesta: Record<string, unknown> | null; error: string | null }>(`
      select p.marca, p.sku, q.estado, q.respuesta, q.ultimo_error error from ml_catalogo_propio p
        join lateral (select * from ml_cola q where q.organizacion_id = $1 and q.item_id = 'catalogo-propio:' || p.marca || ':' || p.sku
                       order by q.id desc limit 1) q on true
       where p.organizacion_id = $1 and p.estado = 'encolada'`, [org])) {
    if (f.estado === "ok" && typeof f.respuesta?.id === "string") {
      await consulta("update ml_catalogo_propio set estado = 'UNDER_REVIEW', sugerencia_id = $3, actualizado_ts = now() where organizacion_id = $1 and marca = $2 and sku = $4",
        [org, f.marca, f.respuesta.id, f.sku]);
    } else if (f.estado === "error" || f.estado === "descartado") {
      await consulta("update ml_catalogo_propio set estado = 'no_se_puede', motivo = $3, actualizado_ts = now() where organizacion_id = $1 and marca = $2 and sku = $4",
        [org, f.marca, `Mercado Libre no aceptó la propuesta: ${f.error ?? "sin motivo"}`.slice(0, 1000), f.sku]);
    }
  }
  for (const f of await consulta<{ marca: string; sku: string; canal_id: number; sugerencia_id: string; arreglos: number; producto_id: string | null; estado: string }>(`
      select marca, sku, canal_id::int canal_id, sugerencia_id, arreglos, producto_id, estado from ml_catalogo_propio
       where organizacion_id = $1 and sugerencia_id is not null and estado in ('UNDER_REVIEW', 'WAITING_FOR_FIX', 'PUBLISHED')`, [org])) {
    if (Date.now() > hasta) return inf;
    const cuenta = cuentas.get(f.canal_id) ?? [...cuentas.values()][0];
    let estado = f.estado, producto = f.producto_id;
    if (f.estado !== "PUBLISHED") {
      const r = await ml<{ status?: string; catalog_product_id?: string | null; rejected_reasons?: unknown[]; title?: string; pictures?: { id: string }[]; attributes?: { id: string; values: { name: string }[] }[] }>(
        cuenta, "GET", `/catalog_suggestions/${f.sugerencia_id}`);
      if (r.status !== 200 || !r.datos.status) continue;
      estado = r.datos.status;
      producto = r.datos.catalog_product_id ?? null;
      let motivo: string | null = null;
      if (estado === "REJECTED") motivo = `Rechazada por Mercado Libre: ${JSON.stringify(r.datos.rejected_reasons ?? []).slice(0, 500)}`;
      if (estado === "WAITING_FOR_FIX") {
        const v = await ml(cuenta, "GET", `/catalog_suggestions/${f.sugerencia_id}/validations`);
        const { errores } = motivosValidacion(v.datos);
        motivo = errores.join(" · ").slice(0, 1000) || "Mercado Libre pide corregir algo";
        if (f.arreglos < 2) {
          const atributos = (r.datos.attributes ?? []).map((a) => ({ id: a.id, values: (a.values ?? []).map((x) => ({ name: x.name })) }));
          const nuevos = await corregirConIA(r.datos.title ?? f.sku, atributos, errores);
          if (nuevos) {
            await encolar(org, [{ canalId: cuenta.canalId!, itemId: `catalogo-propio-arreglo:${f.marca}:${f.sku}:${f.arreglos + 1}`, tipo: "crear",
              payload: { motivo: "catalogo_propio", descripcion: `Corregir la propuesta de catálogo ${f.sugerencia_id} (${f.sku}, ${f.marca}): ${motivo}`.slice(0, 600),
                pedidos: [{ metodo: "PUT", ruta: `/catalog_suggestions/${f.sugerencia_id}`, cuerpo: { title: r.datos.title, pictures: (r.datos.pictures ?? []).map((p) => ({ id: p.id })), attributes: nuevos } }] } }],
              { origen: "automatico" });
            inf.corregidas++;
            motivo = `Corrigiendo (vez ${f.arreglos + 1}): ${motivo}`;
            await consulta("update ml_catalogo_propio set arreglos = arreglos + 1 where organizacion_id = $1 and marca = $2 and sku = $3", [org, f.marca, f.sku]);
          }
        }
      }
      await consulta(`update ml_catalogo_propio set estado = $4, producto_id = $5, motivo = $6, actualizado_ts = now()
                       where organizacion_id = $1 and marca = $2 and sku = $3`, [org, f.marca, f.sku, estado, producto, motivo]);
      if (estado === "PUBLISHED") inf.aprobadas++;
    }
    // Aprobada: las publicaciones comunes de las cuentas de esa marca entran al catálogo nuevo (cada una una sola vez).
    if (estado === "PUBLISHED" && producto) {
      const deLaMarca = canales.filter((c) => normal(c.marca) === normal(f.marca)).map((c) => c.id);
      const candidatas = pubs.filter((p) => p.sku === f.sku && deLaMarca.includes(p.canal_id) && !p.de_catalogo && p.catalogo !== producto);
      const pedidas = new Set((await consulta<{ item_id: string }>(
        "select item_id from ml_cola where organizacion_id = $1 and item_id = any($2) and creado_ts > now() - interval '30 days'",
        [org, candidatas.map((p) => `catalogo:${p.item_id}`)])).map((x) => x.item_id));
      const cambios: CambioMl[] = candidatas.filter((p) => !pedidas.has(`catalogo:${p.item_id}`)).map((p) => ({
        canalId: p.canal_id, itemId: `catalogo:${p.item_id}`, tipo: "crear", antes: { estado: "fuera del catálogo" },
        payload: { descripcion: `Entrar al catálogo propio ${producto} (${f.marca}): ${p.item_id} (${p.sku})`,
          pedidos: [{ metodo: "POST", ruta: "/items/catalog_listings", cuerpo: { item_id: p.item_id, catalog_product_id: producto } }] },
      }));
      if (cambios.length) { await encolar(org, cambios, { origen: "automatico" }); inf.enganches += cambios.length; }
      await consulta("update ml_catalogo_propio set enganchado_ts = coalesce(enganchado_ts, now()) where organizacion_id = $1 and marca = $2 and sku = $3", [org, f.marca, f.sku]);
    }
  }

  // ── 2. Propuestas nuevas, con el cupo libre ──
  const cupo = new Map<number, number>();
  for (const [canal, cuenta] of cuentas) {
    const r = await ml<{ quota?: { quota_type?: string; available?: number }[] }>(cuenta, "GET", `/catalog_suggestions/users/${cuenta.meliUserId}/quota`);
    cupo.set(canal, r.status === 200 ? (r.datos.quota ?? []).reduce((s, q) => s + Number(q.available ?? 0), 0) : 0);
  }
  if (![...cupo.values()].some((n) => n > 0)) { inf.sinCupo = true; return inf; }
  await leerMarcas([...cuentas.values()][0], [...new Set(pubs.map((p) => p.catalogo).filter((x): x is string => !!x))], hasta - 60_000);
  const marcaDe = new Map((await consulta<{ producto_id: string; marca: string | null; tipo: string | null }>(
    "select producto_id, marca, tipo from ml_catalogo_marca")).map((x) => [x.producto_id, x]));
  const yaEstan = new Set((await consulta<{ clave: string }>("select marca || '|' || sku clave from ml_catalogo_propio where organizacion_id = $1", [org])).map((x) => x.clave));
  // Por producto: su publicación común más vendida (sin marca propia, de cualquier cuenta) y, por marca, si alguna
  // publicación de las cuentas de esa marca está atada a un catálogo ajeno.
  const marcaCanal = new Map(canales.map((c) => [c.id, c.marca]));
  const porSku = new Map<string, { vendidos: number; ajeno: Map<string, string>; origen: Item | null }>();
  for (const p of pubs) {
    const cat = p.catalogo ? marcaDe.get(p.catalogo) : null;
    const s = porSku.get(p.sku) ?? { vendidos: 0, ajeno: new Map<string, string>(), origen: null };
    s.vendidos += p.vendidos;
    const m = marcaCanal.get(p.canal_id);
    if (m && cat && catalogoAjeno(cat.marca, cat.tipo)) s.ajeno.set(m, p.catalogo!);
    const marcaPub = p.atributos.find((a) => a.id === "BRAND")?.value_name ?? null;
    if (!p.de_catalogo && esMarcaReemplazable(marcaPub) && (!s.origen || p.vendidos > s.origen.vendidos)) s.origen = p;
    porSku.set(p.sku, s);
  }
  const lista = [...porSku.entries()].filter(([, s]) => s.ajeno.size && s.origen).sort((a, b) => b[1].vendidos - a[1].vendidos);
  for (const marca of marcas) {
    const deLaMarca = canales.filter((c) => c.marca === marca && cuentas.has(c.id)).map((c) => c.id);
    for (const [sku, s0] of lista) {
      const ajeno = s0.ajeno.get(marca);
      if (!ajeno) continue;
      const s = { ...s0, ajeno };
      if (Date.now() > hasta) return inf;
      if (yaEstan.has(`${marca}|${sku}`)) continue;
      const canal = deLaMarca.find((c) => (cupo.get(c) ?? 0) > 0);
      if (!canal) break;
      const cuenta = cuentas.get(canal)!;
      yaEstan.add(`${marca}|${sku}`);
      let cuerpo = await armarPropuesta(s.origen!, marca);
      const anotar = (estado: string, motivo: string | null) => consulta(`
        insert into ml_catalogo_propio (organizacion_id, marca, sku, canal_id, estado, catalogo_ajeno, motivo) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (organizacion_id, marca, sku) do update set canal_id = excluded.canal_id, estado = excluded.estado, catalogo_ajeno = excluded.catalogo_ajeno,
          motivo = excluded.motivo, actualizado_ts = now()`, [org, marca, sku, canal, estado, s.ajeno, motivo]);
      if (!cuerpo) { await anotar("no_se_puede", "Su publicación no tiene el dominio de catálogo o fotos para armar la propuesta."); continue; }
      // Se comprueba con ML antes (no gasta cupo); si observa algo, la IA lo corrige una vez.
      let v = await ml(cuenta, "POST", "/catalog_suggestions/validate", cuerpo);
      let { errores } = v.status >= 200 && v.status < 300 ? { errores: [] as string[] } : motivosValidacion(v.datos);
      if (errores.length) {
        const nuevos = await corregirConIA(String(cuerpo.title), cuerpo.attributes as AtributoSugerencia[], errores);
        if (nuevos) {
          cuerpo = { ...cuerpo, attributes: nuevos };
          v = await ml(cuenta, "POST", "/catalog_suggestions/validate", cuerpo);
          errores = v.status >= 200 && v.status < 300 ? [] : motivosValidacion(v.datos).errores;
        }
      }
      if (errores.length) { await anotar("no_se_puede", errores.join(" · ").slice(0, 1000)); continue; }
      await encolar(org, [{ canalId: canal, itemId: `catalogo-propio:${marca}:${sku}`, tipo: "crear",
        payload: { motivo: "catalogo_propio", descripcion: `Proponer a Mercado Libre el catálogo «${String(cuerpo.title)}» (${sku}); hoy está en ${s.ajeno}, de otra marca.`,
          pedidos: [{ metodo: "POST", ruta: "/catalog_suggestions", cuerpo }] } }], { origen: "automatico" });
      await anotar("encolada", null);
      cupo.set(canal, (cupo.get(canal) ?? 1) - 1);
      inf.propuestas++;
    }
  }
  return inf;
}

/** Una vuelta por todas las organizaciones con alguna cuenta prendida. */
export async function correrCatalogoPropio(hasta: number): Promise<Record<string, InformeCatalogoPropio>> {
  const canales = await consulta<{ id: number; organizacion_id: string; marca: string | null }>(`
    select id::int, organizacion_id, nullif(trim(config ->> 'marca_publicaciones'), '') marca from canal
     where tipo = 'mercadolibre' and estado = 'activo' and coalesce((config ->> 'catalogo_propio_auto')::boolean, false) order by id`);
  const informe: Record<string, InformeCatalogoPropio> = {};
  for (const org of [...new Set(canales.map((c) => c.organizacion_id))]) {
    const deOrg = canales.filter((c) => c.organizacion_id === org && c.marca).map((c) => ({ id: c.id, marca: c.marca! }));
    if (!deOrg.length) continue;
    try {
      informe[org] = await vueltaOrg(org, deOrg, hasta);
      await consulta(`update canal set config = config || jsonb_build_object('catalogo_propio', jsonb_build_object('ultima_vuelta', now())) where id = any($1)`,
        [deOrg.map((c) => c.id)]);
    } catch (e) {
      console.error("[catalogo-propio]", org, e instanceof Error ? e.message : e);
    }
  }
  return informe;
}

/** Para la pantalla: las propuestas de las marcas de una cuenta. */
export async function propuestasDeCanal(org: string, canal: number) {
  const marca = (await una<{ m: string | null }>("select nullif(trim(config ->> 'marca_publicaciones'), '') m from canal where id = $1 and organizacion_id = $2", [canal, org]))?.m;
  if (!marca) return [];
  return consulta<{ sku: string; estado: string; sugerencia_id: string | null; producto_id: string | null; catalogo_ajeno: string | null; motivo: string | null; producto: number | null; actualizado: string }>(`
    select p.sku, p.estado, p.sugerencia_id, p.producto_id, p.catalogo_ajeno, p.motivo, v.producto_id::int producto, p.actualizado_ts::text actualizado
      from ml_catalogo_propio p left join variacion v on v.organizacion_id = p.organizacion_id and v.sku = p.sku
     where p.organizacion_id = $1 and lower(p.marca) = lower($2)
     order by case p.estado when 'WAITING_FOR_FIX' then 0 when 'no_se_puede' then 1 when 'REJECTED' then 2 when 'encolada' then 3 when 'UNDER_REVIEW' then 4 else 5 end, p.actualizado_ts desc`,
    [org, marca]);
}
