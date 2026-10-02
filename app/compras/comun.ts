// Piezas que comparten Facturas de compra y Despachos: verificar que un id
// que llega del formulario sea de la organización, buscar variaciones por
// SKU o título, y cómo se escribe un número de comprobante.

import { consulta, una, ErrorErp } from "@/lib/erp/base";

type Tono = "verde" | "gris" | "amarillo" | "rojo" | "azul";

export const ESTADO_FACTURA: Record<string, { texto: string; tono: Tono }> = {
  borrador: { texto: "Borrador", tono: "amarillo" },
  registrada: { texto: "Registrada", tono: "verde" },
  anulada: { texto: "Anulada", tono: "rojo" },
};
export const ESTADO_DESPACHO: Record<string, { texto: string; tono: Tono }> = {
  borrador: { texto: "Borrador", tono: "amarillo" },
  registrado: { texto: "Registrado", tono: "verde" },
  anulado: { texto: "Anulado", tono: "rojo" },
};

export const LETRAS = ["A", "B", "C", "M", "E", "X"] as const;
export const ALICUOTAS = [21, 10.5, 27, 0] as const;

/** "A 00003-00001234" (o "NC A …" si es nota de crédito). */
export function numeroFactura(f: { letra: string; es_nota_credito: boolean; punto_venta: number | null; numero: string | number | null }) {
  const pv = f.punto_venta != null ? `${String(f.punto_venta).padStart(5, "0")}-` : "";
  const nro = f.numero != null ? String(f.numero).padStart(8, "0") : "s/n";
  return `${f.es_nota_credito ? "NC " : ""}${f.letra} ${pv}${nro}`;
}

export const pct = (n: number | string) => `${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

/** Tablas que se pueden verificar con `deLaOrg`. */
type Tabla = "proveedor" | "deposito" | "recepcion" | "plan_cuenta" | "variacion";

/** Devuelve el id si existe en esa tabla y es de la organización; si no, tira
 *  un error en criollo. null/0 pasa como null (campo opcional vacío). */
export async function deLaOrg(org: string, tabla: Tabla, id: number | null, nombre: string): Promise<number | null> {
  if (!id) return null;
  const r = await una(`select 1 from ${tabla} where id = $1 and organizacion_id = $2`, [id, org]);
  if (!r) throw new ErrorErp(`${nombre} no existe.`);
  return id;
}

export type VariacionEncontrada = { id: number; sku: string; titulo: string };

/** Variaciones de la organización que coinciden con el texto (SKU, código de
 *  barras o título). Hasta 30. Las de productos inactivos (archivados), sólo
 *  si se pide `inactivos`. */
export function buscarVariaciones(org: string, q: string, inactivos = false) {
  if (!q.trim()) return Promise.resolve([] as VariacionEncontrada[]);
  return consulta<VariacionEncontrada>(`
    select v.id::int, v.sku, titulo_variacion(v.id) titulo
      from variacion v join producto p on p.id = v.producto_id
     where v.organizacion_id = $1 and v.estado <> 'archivada' and ($3 or p.estado <> 'archivado')
       and (v.sku ilike '%' || $2 || '%' or v.codigo_barras = $2 or titulo_variacion(v.id) ilike '%' || $2 || '%')
     order by (v.sku ilike $2) desc, v.sku limit 30`, [org, q.trim(), inactivos]);
}

/** El título de una variación (para la descripción por defecto de una línea). */
export async function tituloVariacion(org: string, variacionId: number) {
  const r = await una<{ sku: string; titulo: string }>("select sku, titulo_variacion(id) titulo from variacion where id = $1 and organizacion_id = $2", [variacionId, org]);
  if (!r) throw new ErrorErp("El producto elegido no existe.");
  return `${r.sku} · ${r.titulo}`;
}
