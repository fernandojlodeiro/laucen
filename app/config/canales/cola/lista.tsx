// La cola de Mercado Libre como lista configurable (lib/listas/tipos.ts):
// "Descargar Excel" con la misma pestaña, filtros y orden que la pantalla.

import { patronBusqueda } from "@/app/componentes/erp";
import { campoFecha, traducido, type Lista, type SP } from "@/lib/listas/tipos";
import { TIPOS_COLA, ORIGENES_COLA, ESTADOS_COLA, describirCambio, describirAntes } from "./formato";

export const PESTANAS_COLA = [
  ["pendientes", "Pendientes"], ["enviados", "Enviados"], ["errores", "Con error"], ["descartados", "Descartados"],
] as const;
export type PestanaCola = (typeof PESTANAS_COLA)[number][0];
export const esPestanaCola = (v: unknown): v is PestanaCola => PESTANAS_COLA.some(([k]) => k === v);

/** La condición de cada pestaña (sobre ml_cola, alias q). */
export const CONDICION_COLA: Record<PestanaCola, string> = {
  pendientes: "q.estado in ('pendiente', 'enviando')",
  enviados: "q.estado = 'ok'",
  errores: "q.estado = 'error'",
  descartados: "q.estado = 'descartado'",
};

export function filtrosCola(sp: SP) {
  return {
    ver: (esPestanaCola(sp.ver) ? sp.ver : "pendientes") as PestanaCola,
    canal: Number(sp.canal) || 0,
    tipo: sp.tipo && Object.hasOwn(TIPOS_COLA, sp.tipo) ? sp.tipo : "",
    origen: sp.origen && Object.hasOwn(ORIGENES_COLA, sp.origen) ? sp.origen : "",
    q: sp.q?.trim() ?? "",
    comienza: sp.contiene !== "1",
  };
}

export const LISTA_COLA: Lista = {
  pantalla: "cola-ml",
  titulo: "Cola de Mercado Libre",
  ruta: "/config/canales/cola",
  permiso: "canales_ver",
  campos: [
    { clave: "id", titulo: "N.º", sql: "q.id::int", orden: "q.id", formato: "entero" },
    campoFecha("creado", "Creado", "q.creado_ts", { hora: true }),
    { clave: "canal", titulo: "Canal", sql: "ca.nombre" },
    { clave: "item", titulo: "Publicación", sql: "q.item_id", ancho: 16 },
    { clave: "variacion", titulo: "Variación", sql: "nullif(q.variation_id, '')" },
    { clave: "sku", titulo: "SKU", sql: "v.sku" },
    { clave: "tipo", titulo: "Tipo", sql: "q.tipo", valor: traducido("tipo", TIPOS_COLA) },
    { clave: "antes", titulo: "Antes", sql: "q.antes", orden: false, valor: (f) => describirAntes(f.antes), ancho: 18 },
    { clave: "cambio", titulo: "Después", sql: "q.payload", orden: false, usa: ["tipo"], valor: (f) => describirCambio(f.tipo, f.cambio), ancho: 24 },
    { clave: "prioridad", titulo: "Prioridad", sql: "q.prioridad", formato: "entero" },
    { clave: "origen", titulo: "Origen", sql: "q.origen", valor: traducido("origen", ORIGENES_COLA) },
    { clave: "estado", titulo: "Estado", sql: "q.estado", valor: traducido("estado", ESTADOS_COLA) },
    { clave: "intentos", titulo: "Intentos", sql: "q.intentos", formato: "entero" },
    { clave: "reemplazos", titulo: "Reemplazos", sql: "q.reemplazos", formato: "entero" },
    campoFecha("proximo", "Próximo intento", "q.proximo_intento_ts", { hora: true }),
    campoFecha("enviado", "Enviado", "q.enviado_ts", { hora: true }),
    { clave: "error", titulo: "Problema", sql: "q.ultimo_error", ancho: 40 },
    { clave: "lote", titulo: "Lote", sql: "q.lote_id::int", orden: "q.lote_id", formato: "entero" },
  ],
  enPantalla: ["id", "creado", "canal", "item", "sku", "tipo", "antes", "cambio", "origen", "estado", "intentos", "enviado", "error"],
  consulta: async (ctx, sp) => {
    const f = filtrosCola(sp);
    const valores: unknown[] = [ctx.org];
    const donde = ["q.organizacion_id = $1", CONDICION_COLA[f.ver]];
    if (f.canal) { valores.push(f.canal); donde.push(`q.canal_id = $${valores.length}`); }
    if (f.tipo) { valores.push(f.tipo); donde.push(`q.tipo = $${valores.length}`); }
    if (f.origen) { valores.push(f.origen); donde.push(`q.origen = $${valores.length}`); }
    if (f.q) {
      valores.push(patronBusqueda(f.q, f.comienza));
      donde.push(`(q.item_id ilike $${valores.length} or v.sku ilike $${valores.length})`);
    }
    return {
      desde: `ml_cola q
        join canal ca on ca.id = q.canal_id
        left join publicacion pu on pu.id = q.publicacion_id
        left join variacion v on v.id = pu.variacion_id`,
      donde: donde.join(" and "),
      valores,
      // Pendientes: en el orden en que van a salir. El resto: lo más nuevo primero.
      orden: f.ver === "pendientes" ? "q.prioridad desc, q.creado_ts, q.id" : "coalesce(q.enviado_ts, q.creado_ts) desc, q.id desc",
    };
  },
};
