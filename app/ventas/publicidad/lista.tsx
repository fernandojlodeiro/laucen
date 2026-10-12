// Ventas › Publicidad en Mercado Libre: la lista de productos con su veredicto (modo memoria: el veredicto se calcula en
// lib/publicidad/veredicto.ts) y la de campañas. "Descargar Excel" baja lo mismo que la pantalla.

import { coincideBusqueda } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import type { Fila, Lista } from "@/lib/listas/tipos";
import { veredictos, type FilaProducto } from "@/lib/publicidad/veredicto";

export const BASE_PUBLICIDAD = "/ventas/publicidad";

export const VEREDICTOS: Record<string, string> = { cortar: "CORTAR", bajar: "BAJAR", seguir: "SEGUIR", subir: "SUBIR", esperar: "Sin gasto" };
export const ESTADOS_CAMPANA: Record<string, string> = { active: "Activa", paused: "Pausada", hold: "Retenida", idle: "Sin anuncios", deleted: "Eliminada" };

/** Los productos con publicidad, filtrados como la pantalla (?q=, ?veredicto=, ?canal=). */
export async function productosFiltrados(org: string, sp: Record<string, string | undefined>): Promise<FilaProducto[]> {
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const canal = Number(sp.canal) || null;
  return (await veredictos(org)).filter((f) =>
    (!sp.veredicto || f.veredicto === sp.veredicto)
    && (!canal || f.publicaciones.some((p) => p.canalId === canal))
    && coincideBusqueda([f.clave, f.sku, f.titulo, ...f.publicaciones.map((p) => p.itemId)], q, comienza));
}

export const LISTA_PUBLICIDAD: Lista = {
  pantalla: "publicidad",
  titulo: "Publicidad en Mercado Libre",
  ruta: BASE_PUBLICIDAD,
  permiso: "publicidad_ver",
  campos: [
    { clave: "veredicto", titulo: "Veredicto", valor: (f) => VEREDICTOS[f.veredicto] ?? f.veredicto },
    { clave: "sku", titulo: "SKU", valor: (f) => f.sku ?? f.clave },
    { clave: "titulo", titulo: "Producto", ancho: 45 },
    { clave: "costo", titulo: "Gastado $", formato: "pesos" },
    { clave: "clics", titulo: "Clics", formato: "entero" },
    { clave: "impresiones", titulo: "Impresiones", formato: "entero" },
    { clave: "ventas", titulo: "Ventas por publicidad", formato: "entero" },
    { clave: "monto", titulo: "Vendido por publicidad $", formato: "pesos" },
    { clave: "ventasTotales", titulo: "Ventas totales del producto", formato: "entero" },
    { clave: "porVenta", titulo: "Publicidad por venta $", formato: "pesos" },
    { clave: "pctPorVenta", titulo: "Publicidad por venta %", formato: "pct" },
    { clave: "pctMax", titulo: "Tope %", formato: "pct" },
    { clave: "origenTope", titulo: "Tope", valor: (f) => f.origenTope },
    { clave: "topeSinVentas", titulo: "Corte sin ventas $", formato: "pesos" },
    { clave: "precio", titulo: "Precio promedio $", formato: "pesos" },
    { clave: "costoUnit", titulo: "Costo del producto $", formato: "pesos" },
    { clave: "publicaciones", titulo: "Publicaciones", valor: (f) => (f.publicaciones as FilaProducto["publicaciones"]).map((p) => `${p.itemId} (${p.canal})`).join(", "), ancho: 50, orden: false },
    { clave: "motivo", titulo: "Por qué", ancho: 80 },
  ],
  enPantalla: ["veredicto", "sku", "titulo", "costo", "ventas", "ventasTotales", "porVenta", "pctPorVenta", "pctMax", "motivo"],
  filas: async (ctx, sp) => (await productosFiltrados(ctx.org, sp)) as unknown as Fila[],
};

export const LISTA_PUB_CAMPANAS: Lista = {
  pantalla: "publicidad-campanas",
  titulo: "Campañas de publicidad",
  ruta: BASE_PUBLICIDAD,
  permiso: "publicidad_ver",
  campos: [
    { clave: "canal", titulo: "Cuenta" },
    { clave: "nombre", titulo: "Campaña", ancho: 30 },
    { clave: "estado", titulo: "Estado", valor: (f) => ESTADOS_CAMPANA[f.estado] ?? f.estado },
    { clave: "presupuesto", titulo: "Presupuesto diario $", formato: "pesos" },
    { clave: "presupuesto_diario", titulo: "Presupuesto que usa ML hoy $", formato: "pesos" },
    { clave: "presupuesto_automatico", titulo: "ML sube el presupuesto solo", formato: "sino" },
    { clave: "roas_objetivo", titulo: "ROAS objetivo", formato: "decimal" },
    { clave: "acos_objetivo", titulo: "ACOS objetivo %", formato: "pct" },
    { clave: "costo", titulo: "Gastado $ (días que se miran)", formato: "pesos" },
    { clave: "ventas", titulo: "Ventas directas", formato: "entero" },
    { clave: "monto", titulo: "Vendido directo $", formato: "pesos" },
    { clave: "anuncios", titulo: "Anuncios", formato: "entero" },
  ],
  enPantalla: ["canal", "nombre", "estado", "presupuesto", "presupuesto_diario", "presupuesto_automatico", "roas_objetivo", "costo", "ventas", "monto", "anuncios"],
  filas: async (ctx, sp) => campanas(ctx.org, Number(sp.dias) || 14),
};

export async function campanas(org: string, dias: number): Promise<Fila[]> {
  return consulta(`
    select c.campana_id::text id, c.canal_id::int, ca.nombre canal, c.anunciante_id::text, c.nombre, c.estado, c.presupuesto::float, c.presupuesto_diario::float,
           c.presupuesto_automatico, c.roas_objetivo::float, c.acos_objetivo::float, c.leido_ts,
           coalesce(d.costo, 0)::float costo, coalesce(d.ventas, 0)::int ventas, coalesce(d.monto, 0)::float monto,
           (select count(*) from pub_anuncio a where a.organizacion_id = c.organizacion_id and a.campana_id = c.campana_id)::int anuncios
      from pub_campana c join canal ca on ca.id = c.canal_id
      left join lateral (select sum(costo) costo, sum(unidades_directas) ventas, sum(monto_directo) monto from pub_campana_dia
                          where organizacion_id = c.organizacion_id and campana_id = c.campana_id and fecha > current_date - $2::int) d on true
     where c.organizacion_id = $1
     order by (c.estado = 'active') desc, ca.nombre, c.nombre`, [org, dias]);
}
