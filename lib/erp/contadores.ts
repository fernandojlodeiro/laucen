// Los contadores de la barra de estado (lo que hay para atender en los mensajes,
// pedidos a preparar, facturas retenidas). Cada sesión que tenga algo para contar agrega acá su entrada:
// una clave, un texto, un número, adónde lleva y su «marca» (un número que
// crece cuando entra algo nuevo: con eso se sabe si el usuario ya lo vio).
// Cada uno sale sólo si el usuario puede abrir su pantalla.

import { una } from "@/lib/erp/base";
import { sqlPedidoPendiente } from "@/lib/pedidos";
import { SQL_CHAT_ATENDER, SQL_ML_ATENDER, SQL_PREGUNTA_ATENDER, SQL_RECLAMO_A_ATENDER } from "@/lib/mensajes/sql-atender";
import type { ClaveBarra, Contador } from "@/lib/avisos-tipos";
import type { PermisoKey } from "@/lib/permisos";

export type { Contador };

type Cuenta = { n: number; marca: number | null; persona?: number | null };
type Puede = (p: PermisoKey) => boolean;

export { SQL_RECLAMO_A_ATENDER };

/** «Para atender» (Fer, 27/10): lo mismo que la pestaña de la bandeja de Mensajes (lib/mensajes/sql-atender.ts), de los
 *  canales que esta persona puede ver. La marca (en milisegundos) crece con cada cosa nueva que entra. */
function sqlParaAtender(puede: Puede): string {
  const nada = "(select 0 n, 0::float8 m)";
  const ms = (x: string) => `coalesce(floor(extract(epoch from max(${x})) * 1000), 0)::float8`;
  const partes = [
    puede("mensajes_ver") ? `(select count(*) n, ${ms(`greatest(ch.ultimo_entrante_ts, (select max(k.abierto_ts) from chat_caso k where k.chat_id = ch.id and k.resuelto_ts is null))`)} m
                               from chat ch where ch.organizacion_id = $1 and ${SQL_CHAT_ATENDER("ch")})` : nada,
    puede("preguntas_ver") ? `(select count(*) n, ${ms("c.ultimo_ts")} m from meli_conversacion c where c.organizacion_id = $1 and ${SQL_ML_ATENDER("c")})` : nada,
    puede("preguntas_ver") ? `(select count(*) n, ${ms("q.fecha")} m from meli_pregunta q where q.organizacion_id = $1 and ${SQL_PREGUNTA_ATENDER("q")})` : nada,
    puede("reclamos_ver") ? `(select count(*) n, ${ms(`greatest(r.creado_ts, coalesce((select max(m.fecha) from reclamo_mensaje m where m.reclamo_id = r.id and m.de in ('comprador', 'ml')), r.creado_ts))`)} m
                               from reclamo r where r.organizacion_id = $1 and ${SQL_RECLAMO_A_ATENDER})` : nada,
  ];
  return `select (a.n + b.n + c.n + d.n)::int n, greatest(a.m, b.m, c.m, d.m) marca from ${partes[0]} a, ${partes[1]} b, ${partes[2]} c, ${partes[3]} d`;
}

/** Cuántas conversaciones hay para atender (la cuenta de la pestaña de Mensajes). */
export async function cuentaParaAtender(org: string, puede: Puede): Promise<number> {
  return (await una<Cuenta>(sqlParaAtender(puede), [org]).catch(() => null))?.n ?? 0;
}

// En el orden de la barra: para atender (los mensajes de todos los canales), pedidos y facturas.
const CONTADORES: { clave: ClaveBarra; texto: string; href: string; permiso: PermisoKey | ((puede: Puede) => boolean); sql: string | ((puede: Puede) => string) }[] = [
  {
    // Todo lo de los mensajes en uno (Fer, 27/10): antes eran Reclamos, Mensajes, Preguntas y WhatsApp por separado.
    clave: "atender", texto: "Para atender", href: "/ventas/mensajes?filtro=atender",
    permiso: (puede) => puede("mensajes_ver") || puede("preguntas_ver") || puede("reclamos_ver"), sql: sqlParaAtender,
  },
  {
    clave: "pedidos", texto: "Pedidos", href: "/ventas/pedidos?estado=pendientes", permiso: "pedidos_ver",
    sql: `select count(*)::int n, max(p.id)::float8 marca from pedido p where p.organizacion_id = $1 and ${sqlPedidoPendiente("p")}`,
  },
  {
    // Facturas que no salieron solas (o que el comprador pide cambiar): lib/facturacion/revision.ts.
    clave: "facturas", texto: "Facturas", href: "/ventas/pedidos?estado=retenidas&ver=facturas", permiso: "facturacion_ver",
    sql: `select count(*)::int n, floor(extract(epoch from max(factura_retenida_ts)) * 1000)::float8 marca
            from pedido where organizacion_id = $1 and factura_retenida is not null`,
  },
];

/** Los contadores, con `nuevo` según hasta dónde vio cada uno el usuario (`visto`: {clave: marca}). */
const sqlDe = (c: (typeof CONTADORES)[number], puede: Puede) => (typeof c.sql === "string" ? c.sql : c.sql(puede));

export async function contadoresEstado(org: string, puede: Puede, visto: Record<string, number> = {}): Promise<Contador[]> {
  const mios = CONTADORES.filter((c) => (typeof c.permiso === "string" ? puede(c.permiso) : c.permiso(puede)));
  const cuentas = await Promise.all(mios.map((c) => una<Cuenta>(sqlDe(c, puede), [org]).catch(() => null)));
  return mios.map((c, i) => {
    const r = cuentas[i];
    const marca = Number(r?.marca ?? 0);
    const n = r?.n ?? 0;
    return { clave: c.clave, texto: c.texto, href: c.href, n, marca, nuevo: n > 0 && marca > Number(visto[c.clave] ?? 0), ...(r?.persona ? { persona: r.persona } : {}) };
  });
}

/** La marca actual de un contador (para guardar «hasta acá lo vio»). */
export async function marcaDe(org: string, clave: ClaveBarra, puede: Puede): Promise<number> {
  const c = CONTADORES.find((x) => x.clave === clave);
  if (!c) return 0;
  const r = await una<Cuenta>(sqlDe(c, puede), [org]);
  return Number(r?.marca ?? 0);
}
