// Listas de precios como listas configurables (lib/listas/tipos.ts):
//   · "listas_precios": el ABM de listas (arriba), con su buscador (?ql=);
//   · "precios": la grilla de precios de la lista elegida (?lista=), con la
//     misma búsqueda (?q=) que la pantalla. Los precios salen de precio_de().

import { patronBusqueda, coincideBusqueda } from "@/app/componentes/erp";
import { verInactivos } from "@/app/componentes/Inactivos";
import { consulta } from "@/lib/erp/base";
import { hoyAR } from "@/lib/moneda";
import { campoFecha, type Lista, type SP } from "@/lib/listas/tipos";

/** La grilla: variaciones activas (los productos inactivos, sólo si se piden). */
export const DONDE_PRECIOS = `v.organizacion_id = $1 and v.estado = 'activa' and ($6 or p.estado <> 'archivado')
     and ($4::text is null or v.sku ilike $4 or p.titulo ilike $4 or v.titulo ilike $4 or v.codigo_barras = $5)`;

/** Los valores de DONDE_PRECIOS ($1…$6): organización, lista, hoy, búsqueda e inactivos. */
export function valoresPrecios(org: string, lista: number, sp: SP): unknown[] {
  const q = sp.q?.trim() || "";
  return [org, lista, hoyAR(), patronBusqueda(q, sp.contiene !== "1"), q, verInactivos(sp)];
}

export const LISTA_PRECIOS: Lista = {
  pantalla: "precios",
  titulo: "Precios",
  ruta: "/catalogo/precios",
  permiso: "precios_ver",
  campos: [
    { clave: "lista_nombre", titulo: "Lista", sql: "(select l.nombre from lista_precios l where l.id = $2)", orden: false },
    { clave: "sku", titulo: "SKU", sql: "v.sku", ancho: 18 },
    { clave: "titulo", titulo: "Variación", sql: "titulo_variacion(v.id)", orden: "coalesce(v.titulo, p.titulo)", ancho: 50 },
    { clave: "codigo_barras", titulo: "Código de barras", sql: "v.codigo_barras" },
    { clave: "lista", titulo: "Precio de lista $", sql: "pr.lista_ars::float", orden: "pr.lista_ars", formato: "pesos" },
    { clave: "lista_usd", titulo: "Precio de lista US$", sql: "pr.lista_usd::float", orden: "pr.lista_usd", formato: "usd" },
    { clave: "moneda_origen", titulo: "Cargado en", sql: "pr.moneda_origen" },
    { clave: "descuento", titulo: "Descuento %", sql: "descuento_efectivo($1, v.id)::float", orden: "descuento_efectivo($1, v.id)", formato: "pct" },
    { clave: "venta", titulo: "Precio de venta $", sql: "pr.venta_ars::float", orden: "pr.venta_ars", formato: "pesos" },
    { clave: "venta_usd", titulo: "Precio de venta US$", sql: "pr.venta_usd::float", orden: "pr.venta_usd", formato: "usd" },
    campoFecha("vigente", "Vigente desde", "pr.vigente_desde", { dia: true }),
    { clave: "propio", titulo: "Precio propio de esta lista", sql: "coalesce((select x.lista_id = $2 from precio x where x.id = pr.precio_id), false)", formato: "sino" },
  ],
  enPantalla: ["sku", "titulo", "lista", "descuento", "venta", "vigente"],
  consulta: async (ctx, sp) => {
    const listas = await consulta<{ id: number; estado: string }>(
      "select id::int, estado from lista_precios where organizacion_id = $1 order by orden, nombre", [ctx.org]);
    const lista = listas.find((l) => l.id === Number(sp.lista)) ?? listas.find((l) => l.estado === "activa") ?? listas[0];
    return {
      desde: `variacion v join producto p on p.id = v.producto_id
        left join lateral precio_de($1, v.id, $2, $3::date) pr on true`,
      donde: DONDE_PRECIOS,
      valores: valoresPrecios(ctx.org, lista?.id ?? 0, sp),
      orden: "v.sku, v.id",
    };
  },
};

export const LISTA_LISTAS_PRECIOS: Lista = {
  pantalla: "listas_precios",
  titulo: "Listas de precios",
  ruta: "/catalogo/precios",
  permiso: "precios_ver",
  campos: [
    { clave: "l_nombre", titulo: "Lista", valor: (f) => f.nombre, ancho: 24 },
    { clave: "l_moneda", titulo: "Moneda base", valor: (f) => f.moneda_base },
    { clave: "l_formula", titulo: "Se calcula desde", valor: (f) => f.formula, ancho: 30 },
    { clave: "l_orden", titulo: "Orden", valor: (f) => f.orden, formato: "entero" },
    { clave: "l_estado", titulo: "Estado", valor: (f) => (f.estado === "activa" ? "Activa" : "Archivada") },
    { clave: "l_precios", titulo: "Variaciones con precio", valor: (f) => f.precios, formato: "entero" },
  ],
  enPantalla: ["l_nombre", "l_moneda", "l_formula", "l_orden", "l_estado", "l_precios"],
  filas: async (ctx, sp) => {
    const filas = await consulta<{ id: number; nombre: string; moneda_base: string; estado: string; orden: number; base: string | null; coeficiente: number | null; precios: number }>(`
      select l.id::int, l.nombre, l.moneda_base, l.estado, l.orden, b.nombre base, l.coeficiente::float8,
             (select count(distinct variacion_id) from precio x where x.lista_id = l.id)::int precios
        from lista_precios l left join lista_precios b on b.id = l.base_lista_id
       where l.organizacion_id = $1 order by l.orden, l.nombre`, [ctx.org]);
    const ql = sp.ql?.trim() ?? "";
    const comienza = sp.qlcontiene !== "1";
    return filas.filter((l) => coincideBusqueda(l.nombre, ql, comienza)).map((l) => ({
      ...l, formula: l.base ? `= ${l.base} × ${(l.coeficiente ?? 1).toLocaleString("es-AR", { maximumFractionDigits: 4 })}` : null,
    }));
  },
};
