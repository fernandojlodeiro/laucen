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
};

/** Las publicaciones comunes activas o pausadas de esas notebooks, con lo último que dijo ML. */
export async function filasCatalogo(org: string): Promise<FilaCatalogo[]> {
  return consulta<FilaCatalogo>(`
    select m.canal_id::int canal, c.nombre cuenta, m.item_id, m.sku, m.tipo,
           coalesce(e.catalog_product_id, m.datos_externos -> 'ml' ->> 'catalog_product_id') catalog_product_id,
           e.estado, e.respuesta ->> 'motivo' motivo, to_char(e.leido_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') leido,
           exists (select 1 from ml_cola q where q.canal_id = m.canal_id and q.item_id = 'catalogo:' || m.item_id
                     and q.estado in ('preparado', 'pendiente', 'enviando', 'ok')) pedido
      from meli_item m join canal c on c.id = m.canal_id
      left join ml_catalogo_elegibilidad e on e.canal_id = m.canal_id and e.item_id = m.item_id
     where m.organizacion_id = $1 and m.sku = any($2::text[]) and m.estado in ('active', 'paused')
       and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) = false
     group by m.canal_id, c.nombre, m.item_id, m.sku, m.tipo, m.datos_externos, e.catalog_product_id, e.estado, e.respuesta, e.leido_ts
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
  const partes = [`Leídas ${leidas} publicaciones: ${pueden} pueden entrar al catálogo.`];
  if (errores) partes.push(`${errores} no se pudieron leer (cuenta desconectada o ML no respondió).`);
  if (faltaron) partes.push(`Faltaron ${faltaron} por tiempo: apretá de nuevo.`);
  return partes.join(" ");
}

/** «Preparar entrada al catálogo»: un lote por cuenta con las que pueden entrar. */
export async function prepararEntradaCatalogo(org: string, usuarioId: string): Promise<string> {
  const filas = (await filasCatalogo(org)).filter((f) => f.estado === "READY_FOR_OPTIN" && f.catalog_product_id && !f.pedido);
  if (!filas.length) return "No hay publicaciones que puedan entrar al catálogo (o ya están pedidas). Apretá «Revisar catálogo» primero.";
  const porCuenta = new Map<number, FilaCatalogo[]>();
  for (const f of filas) porCuenta.set(f.canal, [...(porCuenta.get(f.canal) ?? []), f]);
  const lotes: string[] = [];
  for (const [canal, fs] of porCuenta) {
    const cambios: CambioMl[] = fs.map((f) => ({
      canalId: canal, itemId: `catalogo:${f.item_id}`, tipo: "crear",
      antes: { estado: "fuera del catálogo" },
      payload: {
        descripcion: `Entrar al catálogo ${f.catalog_product_id}: ${f.item_id} (${f.sku}) en ${f.cuenta}`,
        pedidos: [{ metodo: "POST", ruta: "/items/catalog_listings", cuerpo: { item_id: f.item_id, catalog_product_id: f.catalog_product_id } }],
      },
    }));
    const loteId = await encolarLoteConBoton(org, canal, cambios, `Entrar al catálogo: ${fs.length} publicaciones en ${fs[0].cuenta}`, usuarioId);
    lotes.push(`${fs[0].cuenta}: ${fs.length} (lote ${loteId})`);
  }
  return `Quedaron ${lotes.length} lote${lotes.length === 1 ? "" : "s"} esperando tu clic en la Cola de Mercado Libre: ${lotes.join(", ")}.`;
}
