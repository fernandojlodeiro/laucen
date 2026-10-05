// Clientes como lista configurable (lib/listas/tipos.ts): catálogo de campos y
// la consulta con los filtros de la pantalla (la comparten la pantalla y su Excel).

import Link from "next/link";
import { url, patronBusqueda } from "@/app/componentes/erp";
import { campoFecha, traducido, type Campo, type Lista, type SP } from "@/lib/listas/tipos";
import { TIPOS_CLIENTE, CONDICIONES_IVA, etiqueta } from "@/app/ventas/formato";

export function filtrosClientes(sp: SP) {
  return {
    q: sp.q?.trim() ?? "",
    comienza: sp.contiene !== "1",
    tipo: sp.tipo === "mayorista" || sp.tipo === "consumidor_final" ? sp.tipo : "",
  };
}

const PEDIDOS = "(select count(*) from pedido p where p.cliente_id = c.id)";
const ULTIMO = "(select max(p.fecha) from pedido p where p.cliente_id = c.id)";
const deDireccion = (col: string) => `(select d.${col} from cliente_direccion d where d.cliente_id = c.id order by d.principal desc, d.id limit 1)`;

const CAMPOS: Campo[] = [
  { clave: "id", titulo: "N.º", sql: "c.id::int", formato: "entero", desc: false, celda: (f) => <Link href={`/ventas/clientes/${f.id}`} className="hover:underline text-[#5C6B76]">{f.id}</Link> },
  { clave: "nombre", titulo: "Nombre", sql: "c.nombre", ancho: 30, celda: (f) => <Link href={`/ventas/clientes/${f.id}`} className="font-semibold text-[#16577F] hover:underline">{f.nombre}</Link> },
  { clave: "razon_social", titulo: "Razón social", sql: "c.razon_social", ancho: 30 },
  { clave: "nombre_pila", titulo: "Nombre de pila", sql: "c.nombre_pila" },
  { clave: "apellido", titulo: "Apellido", sql: "c.apellido" },
  {
    clave: "tipo", titulo: "Tipo", sql: "c.tipo", valor: traducido("tipo", TIPOS_CLIENTE),
    celda: (f) => <Link href={url("/ventas/clientes", { tipo: f.tipo })} className="hover:text-[#16577F] hover:underline">{etiqueta(TIPOS_CLIENTE, f.tipo)}</Link>,
  },
  { clave: "documento", titulo: "Documento", sql: "nullif(concat_ws(' ', c.documento_tipo, c.documento_numero), '')", orden: "c.documento_numero", celda: (f) => <span className="whitespace-nowrap">{f.documento ?? "—"}</span> },
  { clave: "documento_numero", titulo: "Número de documento", sql: "c.documento_numero" },
  { clave: "cuit", titulo: "CUIT", sql: "c.cuit" },
  { clave: "iva", titulo: "Condición IVA", sql: "c.condicion_iva", valor: traducido("iva", CONDICIONES_IVA) },
  { clave: "email", titulo: "Mail", sql: "c.email", ancho: 28, celda: (f) => f.email ? <a href={`mailto:${f.email}`} className="hover:text-[#16577F] hover:underline">{f.email}</a> : "—" },
  { clave: "telefono", titulo: "Teléfono", sql: "c.telefono", celda: (f) => <span className="whitespace-nowrap">{f.telefono ?? "—"}</span> },
  { clave: "telefono_movil", titulo: "Celular", sql: "c.telefono_movil" },
  { clave: "apodo_ml", titulo: "Apodo en Mercado Libre", sql: "c.apodo_ml" },
  { clave: "lista", titulo: "Lista de precios", sql: "(select l.nombre from lista_precios l where l.id = c.lista_precios_id)" },
  { clave: "cuenta_corriente", titulo: "Cuenta corriente", sql: "c.cuenta_corriente", formato: "sino" },
  { clave: "calle", titulo: "Dirección", sql: `nullif(concat_ws(' ', ${deDireccion("calle")}, ${deDireccion("numero")}, ${deDireccion("piso_depto")}), '')`, orden: false, ancho: 30 },
  { clave: "localidad", titulo: "Localidad", sql: deDireccion("localidad") },
  { clave: "provincia", titulo: "Provincia", sql: deDireccion("provincia") },
  { clave: "codigo_postal", titulo: "Código postal", sql: deDireccion("codigo_postal") },
  {
    clave: "pedidos", titulo: "Pedidos", sql: `${PEDIDOS}::int`, orden: PEDIDOS, formato: "entero",
    celda: (f) => f.pedidos ? <Link href={url("/ventas/pedidos", { cliente: f.id })} className="text-[#16577F] hover:underline">{f.pedidos}</Link> : "0",
  },
  {
    clave: "comprado", titulo: "Total comprado", formato: "pesos",
    sql: "(select coalesce(sum(p.total_ars), 0)::float from pedido p where p.cliente_id = c.id and p.estado not in ('cancelado', 'devuelto'))",
    sqlUsd: "(select coalesce(sum(p.total_usd), 0)::float from pedido p where p.cliente_id = c.id and p.estado not in ('cancelado', 'devuelto'))",
  },
  campoFecha("ultimo", "Último pedido", ULTIMO),
  campoFecha("creado", "Alta", "c.creado_ts"),
  { clave: "notas", titulo: "Notas", sql: "c.notas", orden: false, ancho: 40 },
];

export const LISTA_CLIENTES: Lista = {
  pantalla: "clientes",
  titulo: "Clientes",
  ruta: "/ventas/clientes",
  permiso: "clientes_ver",
  vistas: true,
  porDefecto: "nombre",
  campos: CAMPOS,
  enPantalla: ["id", "nombre", "tipo", "documento", "iva", "email", "telefono", "pedidos", "ultimo"],
  siempre: "c.id::int id",
  consulta: async (ctx, sp) => {
    const { q, comienza, tipo } = filtrosClientes(sp);
    const valores: unknown[] = [ctx.org];
    const donde = ["c.organizacion_id = $1"];
    if (tipo) { valores.push(tipo); donde.push(`c.tipo = $${valores.length}`); }
    if (q) {
      valores.push(patronBusqueda(q, comienza));
      const p = `$${valores.length}`;
      const digitos = q.replace(/\D/g, "");
      let doc = "";
      if (digitos.length >= 3) {
        valores.push(patronBusqueda(digitos, comienza));
        doc = ` or regexp_replace(coalesce(c.documento_numero, ''), '\\D', '', 'g') like $${valores.length} or regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g') like $${valores.length}`;
      }
      donde.push(`(c.nombre ilike ${p} or c.email ilike ${p} or c.documento_numero ilike ${p} or c.telefono ilike ${p}${doc})`);
    }
    return { desde: "cliente c", donde: donde.join(" and "), valores, orden: "c.nombre, c.id" };
  },
};
