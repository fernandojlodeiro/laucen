// Piezas que comparten Facturas de compra y Despachos: verificar que un id
// que llega del formulario sea de la organización, buscar variaciones por
// SKU o título, y cómo se escribe un número de comprobante.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { patronesBusqueda, sqlBusqueda } from "@/lib/busqueda";

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
export function numeroFactura(f: { letra: string; es_nota_credito: boolean; es_nota_debito?: boolean; punto_venta: number | null; numero: string | number | null }) {
  const pv = f.punto_venta != null ? `${String(f.punto_venta).padStart(5, "0")}-` : "";
  const nro = f.numero != null ? String(f.numero).padStart(8, "0") : "s/n";
  return `${f.es_nota_credito ? "NC " : f.es_nota_debito ? "ND " : ""}${f.letra} ${pv}${nro}`;
}

export const pct = (n: number | string) => `${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

/** Tablas que se pueden verificar con `deLaOrg`. */
type Tabla = "proveedor" | "deposito" | "recepcion" | "plan_cuenta" | "variacion" | "emisor";

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
 *  barras o título), con la regla común de búsqueda (lib/busqueda.ts). Hasta 30.
 *  Las de productos inactivos (archivados), sólo si se pide `inactivos`, o si
 *  ningún activo coincide pero sí alguno inactivo (regla de inactivos de Fer). */
export async function buscarVariaciones(org: string, q: string, inactivos = false): Promise<VariacionEncontrada[]> {
  const t = q.trim();
  if (!t) return [];
  const buscar = (conInactivos: boolean) => consulta<VariacionEncontrada>(`
    select v.id::int, v.sku, titulo_variacion(v.id) titulo
      from variacion v join producto p on p.id = v.producto_id
     where v.organizacion_id = $1 and v.estado <> 'archivada' and ($3 or p.estado <> 'archivado')
       and (v.codigo_barras = $4 or ${sqlBusqueda("$2", ["v.sku", "titulo_variacion(v.id)", "p.sku_base", "v.codigo_barras", "p.codigo_barras"])})
     order by (v.codigo_barras = $4) desc, (v.sku ilike $4) desc, v.sku limit 30`, [org, patronesBusqueda(t), conInactivos, t]);
  const filas = await buscar(inactivos);
  return filas.length || inactivos ? filas : buscar(true);
}

/** El título de una variación (para la descripción por defecto de una línea). */
export async function tituloVariacion(org: string, variacionId: number) {
  const r = await una<{ sku: string; titulo: string }>("select sku, titulo_variacion(id) titulo from variacion where id = $1 and organizacion_id = $2", [variacionId, org]);
  if (!r) throw new ErrorErp("El producto elegido no existe.");
  return `${r.sku} · ${r.titulo}`;
}
