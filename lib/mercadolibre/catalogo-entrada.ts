// Entrar a competir en el catálogo de ML (Fer, 7/10), para las notebooks de la
// prueba de planes (lib/mercadolibre/prueba-planes.ts):
//   1. «Revisar catálogo» (sólo lectura): para cada publicación común (no de
//      catálogo) de esas notebooks, en todas las cuentas, le pregunta a ML si puede
//      entrar (GET /items/{id}/catalog_listing_eligibility) y lo guarda.
//   2. «Preparar entrada al catálogo»: para las que ML dice READY_FOR_OPTIN y tienen
//      producto de catálogo, deja un lote por cuenta en la cola (POST
//      /items/catalog_listings): ML crea la publicación de catálogo, que comparte el
//      stock con la común. Nada sale sin el clic de Fer.

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { PRUEBA } from "@/lib/mercadolibre/prueba-planes";

export const SKUS_CATALOGO = [...new Set(PRUEBA.map((p) => p.sku))];

/** Lo que contesta ML, en criollo. */
export const ESTADO_CATALOGO: Record<string, string> = {
  READY_FOR_OPTIN: "Puede entrar",
  ALREADY_OPTED_IN: "Ya está en el catálogo",
  CLOSED: "La publicación está cerrada",
  PRODUCT_INACTIVE: "El producto de catálogo está inactivo",
  NOT_ELIGIBLE: "No puede entrar",
  CATALOG_PRODUCT_ID_NULL: "No tiene producto de catálogo asociado",
  CATALOG_LISTING: "Ya es una publicación de catálogo",
  COMPETING: "Ya compite en el catálogo",
};
/** Los motivos (reason) que da ML, en criollo; los que ya dice el estado no se repiten. */
const MOTIVO_CATALOGO: Record<string, string | null> = {
  item_catalog_product_id_null: null,
  item_has_item_relations: "ya tiene su publicación de catálogo",
};
export const textoMotivoCatalogo = (m: string | null) =>
  m ? m.split(" · ").map((x) => (Object.hasOwn(MOTIVO_CATALOGO, x) ? MOTIVO_CATALOGO[x] : x)).filter(Boolean).join(" · ") || null : null;
export const textoEstadoCatalogo = (e: string | null) => (e ? ESTADO_CATALOGO[e] ?? e : "—");

export type FilaCatalogo = {
  canal: number; cuenta: string; item_id: string; sku: string; tipo: string; catalog_product_id: string | null;
  estado: string | null; motivo: string | null; leido: string | null; pedido: boolean;
  /** Para las que ML no tiene asociadas: el producto de catálogo con que se puede intentar la entrada, y de dónde sale. */
  sugerido: string | null; sugerido_como: "otra publicación" | "código de barras" | null; sugerido_nombre: string | null;
};

/** Se puede pedir la entrada: ML dice que puede, o no tiene producto asociado pero conocemos uno (se intenta). */
export const sePuedePedir = (f: FilaCatalogo) =>
  !f.pedido && ((f.estado === "READY_FOR_OPTIN" && !!f.catalog_product_id) || (f.estado === "CATALOG_PRODUCT_ID_NULL" && !!f.sugerido));

/** Las publicaciones comunes activas o pausadas de esas notebooks, con lo último que dijo ML. */
export async function filasCatalogo(org: string): Promise<FilaCatalogo[]> {
  return consulta<FilaCatalogo>(`
    select m.canal_id::int canal, c.nombre cuenta, m.item_id, m.sku, m.tipo,
           coalesce(e.catalog_product_id, m.datos_externos -> 'ml' ->> 'catalog_product_id') catalog_product_id,
           e.estado, e.respuesta ->> 'motivo' motivo, to_char(e.leido_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') leido,
           exists (select 1 from ml_cola q where q.canal_id = m.canal_id and q.item_id = 'catalogo:' || m.item_id
                     and q.estado in ('preparado', 'pendiente', 'enviando', 'ok')) pedido,
           -- El producto de catálogo de otra publicación nuestra del mismo SKU (en cualquier cuenta), o el encontrado por código de barras.
           coalesce(o.producto, s.producto) sugerido,
           case when o.producto is not null then 'otra publicación' when s.producto is not null then 'código de barras' end sugerido_como,
           s.nombre sugerido_nombre
      from meli_item m join canal c on c.id = m.canal_id
      left join ml_catalogo_elegibilidad e on e.canal_id = m.canal_id and e.item_id = m.item_id
      left join lateral (select x.datos_externos -> 'ml' ->> 'catalog_product_id' producto from meli_item x
                          where x.organizacion_id = m.organizacion_id and x.sku = m.sku and x.datos_externos -> 'ml' ->> 'catalog_product_id' is not null
                          group by 1 order by count(*) desc limit 1) o on true
      left join ml_catalogo_sku s on s.organizacion_id = m.organizacion_id and s.sku = m.sku
     where m.organizacion_id = $1 and m.sku = any($2::text[]) and m.estado in ('active', 'paused')
       and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) = false
     group by m.canal_id, c.nombre, m.item_id, m.sku, m.tipo, m.datos_externos, e.catalog_product_id, e.estado, e.respuesta, e.leido_ts, o.producto, s.producto, s.nombre
     order by m.sku, c.nombre, m.tipo, m.item_id`, [org, SKUS_CATALOGO]);
}

type Elegibilidad = { status?: string; message?: string; error?: string; cause?: { message?: string }[]; reason?: string; variations?: { status?: string }[] };

/** El motivo legible de un "no" de ML (lo que venga: reason, message, cause). */
function motivoDe(d: Elegibilidad | null): string | null {
  if (!d) return null;
  const partes = [d.reason, d.message, ...(d.cause ?? []).map((c) => c.message)].filter((x): x is string => !!x?.trim());
  return partes.length ? [...new Set(partes)].join(" · ") : null;
}

/** «Revisar catálogo»: pregunta a ML por cada publicación y lo guarda. Sólo lectura. */
export async function revisarCatalogo(org: string, hastaMs: number): Promise<string> {
  const filas = await filasCatalogo(org);
  const cuentas = new Map<number, CuentaMl | null>();
  let leidas = 0, pueden = 0, errores = 0, faltaron = 0;
  for (const f of filas) {
    if (Date.now() > hastaMs) { faltaron++; continue; }
    if (!cuentas.has(f.canal)) cuentas.set(f.canal, await cuentaDelCanal(org, f.canal));
    const cuenta = cuentas.get(f.canal);
    if (!cuenta || cuenta.estado !== "activa") { errores++; continue; }
    const r = await ml<Elegibilidad>(cuenta, "GET", `/items/${f.item_id}/catalog_listing_eligibility`);
    // Un 404 o 400 también es respuesta (ej. sin producto de catálogo): se guarda con su motivo.
    if (r.status === 0 || r.status >= 500 || r.status === 401 || r.status === 429) { errores++; continue; }
    const d = (r.datos ?? null) as Elegibilidad | null;
    const estado = r.status === 200 ? d?.status ?? null : "NOT_ELIGIBLE";
    // El producto de catálogo, si ML no lo dice, el que trae la publicación.
    const producto = (await una<{ p: string | null }>(
      "select datos_externos -> 'ml' ->> 'catalog_product_id' p from meli_item where canal_id = $1 and item_id = $2 limit 1", [f.canal, f.item_id]))?.p ?? null;
    await consulta(`
      insert into ml_catalogo_elegibilidad (organizacion_id, canal_id, item_id, estado, catalog_product_id, respuesta, leido_ts)
      values ($1, $2, $3, $4, $5, $6::jsonb, now())
      on conflict (canal_id, item_id) do update set estado = excluded.estado, catalog_product_id = excluded.catalog_product_id,
        respuesta = excluded.respuesta, leido_ts = now()`,
      [org, f.canal, f.item_id, estado, producto, JSON.stringify({ status: r.status, datos: d, motivo: r.status === 200 && estado === "READY_FOR_OPTIN" ? null : motivoDe(d) })]);
    leidas++;
    if (estado === "READY_FOR_OPTIN") pueden++;
  }
  const encontrados = await buscarPorCodigo(org, cuentas, hastaMs);
  const partes = [`Leídas ${leidas} publicaciones: ${pueden} pueden entrar al catálogo.`];
  if (encontrados) partes.push(encontrados);
  if (errores) partes.push(`${errores} no se pudieron leer (cuenta desconectada o ML no respondió).`);
  if (faltaron) partes.push(`Faltaron ${faltaron} por tiempo: apretá de nuevo.`);
  return partes.join(" ");
}

/** Para cada SKU sin producto de catálogo conocido, lo busca en ML por su código de barras
 *  (el de Laucen o el GTIN de la publicación). Sólo lectura; lo guarda en ml_catalogo_sku. */
async function buscarPorCodigo(org: string, cuentas: Map<number, CuentaMl | null>, hastaMs: number): Promise<string | null> {
  const filas = await filasCatalogo(org);
  const sinProducto = [...new Set(filas.filter((f) => !f.catalog_product_id && !f.sugerido).map((f) => f.sku))];
  if (!sinProducto.length) return null;
  const cuenta = [...cuentas.values()].find((c) => c?.estado === "activa") ?? null;
  if (!cuenta) return "No se pudo buscar por código de barras: ninguna cuenta conectada.";
  // El código de barras de cada modelo: el de Laucen o el GTIN de sus publicaciones.
  const gtinDe = new Map<string, string | null>();
  for (const sku of SKUS_CATALOGO) {
    const g = await una<{ gtin: string | null }>(`
      select coalesce(nullif(regexp_replace(coalesce(v.codigo_barras, ''), '[^0-9]', '', 'g'), ''),
             (select a ->> 'value_name' from meli_item m, jsonb_array_elements(coalesce(m.datos_externos -> 'ml' -> 'attributes', '[]'::jsonb)) a
               where m.organizacion_id = $1 and m.sku = $2 and a ->> 'id' = 'GTIN' and a ->> 'value_name' is not null limit 1)) gtin
        from variacion v where v.organizacion_id = $1 and v.sku = $2`, [org, sku]);
    gtinDe.set(sku, g?.gtin?.replace(/[^0-9]/g, "").replace(/^0+(?=\d{12}$)/, "") || null);
  }
  const res: string[] = [];
  for (const sku of sinProducto) {
    if (Date.now() > hastaMs) break;
    const gtin = gtinDe.get(sku) ?? null;
    if (!gtin) { res.push(`${sku}: sin código de barras`); continue; }
    // El mismo código en dos modelos distintos: está mal cargado en alguno, no se usa (Fer, 7/10).
    const otros = SKUS_CATALOGO.filter((x) => x !== sku && gtinDe.get(x) === gtin);
    if (otros.length) { res.push(`${sku}: el código ${gtin} también está en ${otros.join(", ")}; corregilo antes`); continue; }
    const r = await ml<{ results?: { id: string; name?: string; status?: string }[] }>(cuenta, "GET",
      `/products/search?status=active&site_id=MLA&product_identifier=${encodeURIComponent(gtin)}`);
    if (r.status !== 200) { res.push(`${sku}: ML no contestó`); continue; }
    const p = (r.datos.results ?? []).find((x) => x.id) ?? null;
    await consulta(`
      insert into ml_catalogo_sku (organizacion_id, sku, gtin, producto, nombre, respuesta, leido_ts) values ($1, $2, $3, $4, $5, $6::jsonb, now())
      on conflict (organizacion_id, sku) do update set gtin = excluded.gtin, producto = excluded.producto, nombre = excluded.nombre,
        respuesta = excluded.respuesta, leido_ts = now()`,
      [org, sku, gtin, p?.id ?? null, p?.name ?? null, JSON.stringify(r.datos)]);
    res.push(p ? `${sku}: encontrado ${p.id}` : `${sku}: no hay producto con el código ${gtin}`);
  }
  return `Búsqueda por código de barras: ${res.join("; ")}.`;
}

/** «Preparar entrada al catálogo»: un lote por cuenta con las que pueden entrar. */
export async function prepararEntradaCatalogo(org: string, usuarioId: string): Promise<string> {
  // Las que ML dice que pueden, y las que no tienen producto asociado pero conocemos uno: ésas se intentan (ML puede rechazarlas).
  const filas = (await filasCatalogo(org)).filter(sePuedePedir);
  if (!filas.length) return "No hay publicaciones que puedan entrar o intentarlo (o ya están pedidas). Apretá «Revisar catálogo» primero.";
  const porCuenta = new Map<number, FilaCatalogo[]>();
  for (const f of filas) porCuenta.set(f.canal, [...(porCuenta.get(f.canal) ?? []), f]);
  const lotes: string[] = [];
  for (const [canal, fs] of porCuenta) {
    const cambios: CambioMl[] = fs.map((f) => {
      const producto = f.estado === "READY_FOR_OPTIN" ? f.catalog_product_id! : f.sugerido!;
      const intento = f.estado === "READY_FOR_OPTIN" ? "" : ` (se intenta: producto de ${f.sugerido_como})`;
      return {
        canalId: canal, itemId: `catalogo:${f.item_id}`, tipo: "crear",
        antes: { estado: "fuera del catálogo" },
        payload: {
          descripcion: `Entrar al catálogo ${producto}: ${f.item_id} (${f.sku}) en ${f.cuenta}${intento}`,
          pedidos: [{ metodo: "POST", ruta: "/items/catalog_listings", cuerpo: { item_id: f.item_id, catalog_product_id: producto } }],
        },
      };
    });
    const loteId = await encolarLoteConBoton(org, canal, cambios, `Entrar al catálogo: ${fs.length} publicaciones en ${fs[0].cuenta}`, usuarioId);
    lotes.push(`${fs[0].cuenta}: ${fs.length} (lote ${loteId})`);
  }
  return `Quedaron ${lotes.length} lote${lotes.length === 1 ? "" : "s"} esperando tu clic en la Cola de Mercado Libre: ${lotes.join(", ")}.`;
}
