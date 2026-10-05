// Despachos de importación como lista configurable (lib/listas/tipos.ts):
// "Descargar Excel" con los mismos filtros que la pantalla.

import { campoFecha, type Lista } from "@/lib/listas/tipos";
import { ESTADO_DESPACHO } from "../comun";

export const GASTOS_DESPACHO = "coalesce((select sum((g->>'importe_ars')::numeric) from jsonb_array_elements(d.gastos) g), 0)";
export const LINEAS_DESPACHO = "(select count(*) from despacho_linea l where l.despacho_id = d.id)";
export const COSTO_DESPACHO = `((d.fob_usd + d.flete_usd + d.seguro_usd) * d.cotizacion + ${GASTOS_DESPACHO})`;
const IMPUESTOS = "coalesce((select sum((g->>'importe_ars')::numeric) from jsonb_array_elements(d.impuestos) g), 0)";

export const LISTA_DESPACHOS: Lista = {
  pantalla: "despachos",
  titulo: "Despachos de importación",
  ruta: "/compras/despachos",
  permiso: "despachos_ver",
  campos: [
    campoFecha("fecha", "Fecha", "d.fecha", { dia: true }),
    { clave: "numero", titulo: "Despacho", sql: "d.numero", ancho: 20 },
    { clave: "proveedor", titulo: "Proveedor", sql: "p.nombre", ancho: 28 },
    { clave: "lineas", titulo: "Líneas", sql: `${LINEAS_DESPACHO}::int`, orden: LINEAS_DESPACHO, formato: "entero" },
    { clave: "unidades", titulo: "Unidades", sql: "(select coalesce(sum(l.cantidad), 0) from despacho_linea l where l.despacho_id = d.id)::float", formato: "entero" },
    { clave: "fob", titulo: "FOB US$", sql: "d.fob_usd::float", orden: "d.fob_usd", formato: "usd" },
    { clave: "flete_usd", titulo: "Flete US$", sql: "d.flete_usd::float", formato: "usd" },
    { clave: "seguro_usd", titulo: "Seguro US$", sql: "d.seguro_usd::float", formato: "usd" },
    { clave: "flete", titulo: "Flete + seguro US$", sql: "(d.flete_usd + d.seguro_usd)::float", orden: "(d.flete_usd + d.seguro_usd)", formato: "usd" },
    { clave: "cotizacion", titulo: "Cotización", sql: "d.cotizacion::float", formato: "decimal" },
    { clave: "gastos", titulo: "Gastos $", sql: `${GASTOS_DESPACHO}::float`, orden: GASTOS_DESPACHO, formato: "pesos", fiscal: true },
    { clave: "costo", titulo: "Costo total $", sql: `${COSTO_DESPACHO}::float`, orden: COSTO_DESPACHO, formato: "pesos", fiscal: true },
    { clave: "impuestos", titulo: "Impuestos (crédito fiscal) $", sql: `${IMPUESTOS}::float`, orden: IMPUESTOS, formato: "pesos", fiscal: true },
    { clave: "deposito", titulo: "Depósito", sql: "(select x.nombre from deposito x where x.id = d.deposito_id)" },
    { clave: "estado", titulo: "Estado", sql: "d.estado", valor: (f) => ESTADO_DESPACHO[f.estado]?.texto ?? f.estado },
    campoFecha("registrado", "Registrado el", "d.registrado_ts", { hora: true }),
    { clave: "emisor", titulo: "Razón social", sql: "(select coalesce(e.nombre, e.razon_social) from emisor e where e.id = d.emisor_id)", ancho: 24 },
    { clave: "notas", titulo: "Notas", sql: "d.notas", orden: false, ancho: 40 },
  ],
  enPantalla: ["fecha", "numero", "proveedor", "lineas", "fob", "flete", "gastos", "costo", "estado"],
  consulta: async (ctx, sp) => ({
    desde: "despacho_importacion d left join proveedor p on p.id = d.proveedor_id",
    donde: "d.organizacion_id = $1 and ($2 = 0 or d.proveedor_id = $2) and ($3 = '' or d.estado = $3) and ($4::bigint is null or d.emisor_id = $4)",
    valores: [ctx.org, Number(sp.proveedor) || 0, sp.estado && Object.hasOwn(ESTADO_DESPACHO, sp.estado) ? sp.estado : "", Number(sp.rs) || null],
    orden: "d.fecha desc, d.id desc",
  }),
};
