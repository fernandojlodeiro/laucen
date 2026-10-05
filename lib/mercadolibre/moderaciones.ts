// Por qué una publicación está en revisión en ML (Fer, 5/10). ML la marca
// under_review con sub_status "waiting_for_patch" (frenada hasta que se corrija:
// se puede modificar y ML la vuelve a revisar) o "forbidden" (prohibida, no se
// levanta). El motivo y la solución sugerida salen de las infracciones de la
// cuenta: GET /moderations/infractions/{user_id}?related_item_id={item} (texto con
// HTML). Sólo lectura. Se guarda en meli_moderacion, a lo sumo una vez por día por
// publicación; lo lee el proceso de fondo (/api/erp/tareas) y el botón "Leer motivos
// de revisión" de Catálogo › Publicaciones.

import { consulta } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";

type Infraccion = Record<string, unknown> & {
  related_item_id?: string; element_id?: string; reason?: string; remedy?: string;
  filter_subgroup?: string; subgroup?: string; type?: string; element_type?: string;
};

/** Texto sin HTML ni espacios de más. */
export function sinHtml(t: unknown): string {
  return typeof t === "string"
    ? t.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
      .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()
    : "";
}

/** La lista de infracciones, venga como venga (lista, {infractions}, {results}, {data}). */
export function listaDe(datos: unknown): Infraccion[] {
  if (Array.isArray(datos)) return datos as Infraccion[];
  const d = datos as Record<string, unknown> | null;
  for (const k of ["infractions", "results", "data", "elements"]) if (d && Array.isArray(d[k])) return d[k] as Infraccion[];
  return [];
}

export const PRECIO_RE = /precio|price|pricing|valor de venta/i;

/** El motivo, la solución y si es por precio, de las infracciones de una publicación. */
export function resumir(lista: Infraccion[], itemId: string): { motivo: string | null; solucion: string | null; grupo: string | null; porPrecio: boolean } {
  const propias = lista.filter((x) => (!x.related_item_id && !x.element_id) || x.related_item_id === itemId || x.element_id === itemId);
  const usar = propias.length ? propias : lista;
  const motivos = [...new Set(usar.map((x) => sinHtml(x.reason)).filter(Boolean))];
  const soluciones = [...new Set(usar.map((x) => sinHtml(x.remedy)).filter(Boolean))];
  const grupos = [...new Set(usar.map((x) => String(x.filter_subgroup ?? x.subgroup ?? x.type ?? "")).filter(Boolean))];
  const todo = [...motivos, ...soluciones, ...grupos].join(" ");
  return {
    motivo: motivos.join("\n\n").slice(0, 2000) || null,
    solucion: soluciones.join("\n\n").slice(0, 2000) || null,
    grupo: grupos.join(", ").slice(0, 200) || null,
    porPrecio: PRECIO_RE.test(todo),
  };
}

/** Lee de ML el motivo de una publicación y lo guarda. Devuelve si encontró motivo. */
export async function leerMotivo(cuenta: CuentaMl, itemId: string): Promise<boolean> {
  const r = await ml(cuenta, "GET", `/moderations/infractions/${cuenta.meliUserId}?related_item_id=${encodeURIComponent(itemId)}&limit=20`);
  const lista = r.status === 200 ? listaDe(r.datos) : [];
  const x = resumir(lista, itemId);
  await consulta(`
    insert into meli_moderacion (organizacion_id, canal_id, item_id, motivo, solucion, grupo, por_precio, datos, leido_ts)
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
    on conflict (canal_id, item_id) do update set motivo = excluded.motivo, solucion = excluded.solucion, grupo = excluded.grupo,
      por_precio = excluded.por_precio, datos = excluded.datos, leido_ts = now()`,
    [cuenta.organizacionId, cuenta.canalId, itemId, x.motivo, x.solucion, x.grupo, x.porPrecio,
      JSON.stringify({ status: r.status, respuesta: r.status === 200 ? lista.slice(0, 5) : r.datos })]);
  return !!x.motivo;
}

/** Las publicaciones en revisión cuyo motivo no se leyó en el último día (las nunca leídas primero). */
const SQL_PENDIENTES = `
  select distinct on (m.canal_id, m.item_id) m.organizacion_id, m.canal_id::int, m.item_id, mm.leido_ts
    from meli_item m left join meli_moderacion mm on mm.canal_id = m.canal_id and mm.item_id = m.item_id
   where m.estado = 'under_review' and ($1::text is null or m.organizacion_id = $1)
     and (mm.leido_ts is null or mm.leido_ts < now() - interval '1 day')`;

export async function hayMotivosPendientes(): Promise<boolean> {
  return (await consulta(`${SQL_PENDIENTES} limit 1`, [null])).length > 0;
}

/** Lee los motivos pendientes hasta `hastaMs` (de a una, con el ritmo de la API). */
export async function leerMotivosPendientes(org: string | null, hastaMs: number): Promise<{ leidas: number; conMotivo: number; quedan: number }> {
  const filas = (await consulta<{ organizacion_id: string; canal_id: number; item_id: string; leido_ts: Date | null }>(SQL_PENDIENTES, [org]))
    .sort((a, b) => (a.leido_ts?.getTime() ?? 0) - (b.leido_ts?.getTime() ?? 0));
  const cuentas = new Map<number, CuentaMl | null>();
  let leidas = 0, conMotivo = 0;
  for (const f of filas) {
    if (Date.now() > hastaMs - 2_000) break;
    if (!cuentas.has(f.canal_id)) cuentas.set(f.canal_id, await cuentaDelCanal(f.organizacion_id, f.canal_id));
    const c = cuentas.get(f.canal_id);
    if (!c || c.estado !== "activa") continue;
    if (await leerMotivo(c, f.item_id)) conMotivo++;
    leidas++;
    await new Promise((ok) => setTimeout(ok, 250));
  }
  return { leidas, conMotivo, quedan: filas.length - leidas };
}

/** SQL (alias `mi` = meli_item, `mm` = meli_moderacion) para unir el motivo a una publicación. */
export const UNIR_MODERACION = "left join meli_moderacion mm on mm.canal_id = mi.canal_id and mm.item_id = mi.item_id and mi.estado = 'under_review'";
