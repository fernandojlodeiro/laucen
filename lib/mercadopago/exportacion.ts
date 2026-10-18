// Exportación histórica y mensual de Mercado Pago (orden de Fer del 17/10,
// bitácora #681). Primer paso: el inventario. Para cada cuenta conectada se
// pregunta a Mercado Pago qué fuentes da y desde cuándo, sin generar nada:
//   · quién es la cuenta (/users/me);
//   · Reporte de Todas las transacciones (settlement_report): configuración y
//     reportes ya armados (fechas que cubren);
//   · Reporte de Liquidaciones (release_report): ídem;
//   · Pagos que COBRÓ la cuenta (/v1/payments/search): cuántos y el más viejo;
//   · Pagos que HIZO la cuenta (payer.id): si Mercado Pago los deja ver;
//   · Reportes de Otras operaciones (/v1/reporting/operations/…): qué contesta.
// Todo queda en mp_export_sonda tal cual, para decidir con datos qué fuente
// cubre cada clase de movimiento. Sólo lectura (todo GET).

import { consulta, una } from "@/lib/erp/base";
import { tokenDeConexion, mpPedir } from "@/lib/mercadopago/conexion";

type Resp = { status: number; datos: unknown };
const corto = (d: unknown, n = 600) => (typeof d === "string" ? d : JSON.stringify(d ?? null)).slice(0, n);
const ok = (r: Resp) => r.status >= 200 && r.status < 300;

type Pago = {
  id: number; date_created?: string; date_approved?: string; status?: string; operation_type?: string; currency_id?: string;
  transaction_amount?: number; payment_method_id?: string; payment_type_id?: string; description?: string | null;
  collector_id?: number; payer?: { id?: number | string };
};
const resumenPago = (p: Pago) => ({
  id: p.id, creado: p.date_created, aprobado: p.date_approved, estado: p.status, tipo: p.operation_type, moneda: p.currency_id,
  monto: p.transaction_amount, medio: p.payment_method_id, tipoMedio: p.payment_type_id, descripcion: p.description?.slice(0, 60) ?? null,
  cobrador: p.collector_id, pagador: p.payer?.id ?? null,
});

/** Una búsqueda de pagos: total, el más viejo y el más nuevo (con sus campos principales). */
async function busqueda(token: string, filtros: string) {
  const viejo = await mpPedir<{ results?: Pago[]; paging?: { total?: number } }>(token, "GET", `/v1/payments/search?${filtros}&sort=date_created&criteria=asc&limit=3`);
  if (!ok(viejo)) return { status: viejo.status, respuesta: corto(viejo.datos) };
  const nuevo = await mpPedir<{ results?: Pago[] }>(token, "GET", `/v1/payments/search?${filtros}&sort=date_created&criteria=desc&limit=5`);
  return {
    status: 200, total: viejo.datos.paging?.total ?? null,
    masViejos: (viejo.datos.results ?? []).map(resumenPago),
    masNuevos: ok(nuevo) ? ((nuevo.datos as { results?: Pago[] }).results ?? []).map(resumenPago) : corto(nuevo.datos),
  };
}

/** La lista de reportes armados de una familia (settlement_report / release_report). */
async function reportes(token: string, familia: string) {
  const conf = await mpPedir(token, "GET", `/v1/account/${familia}/config`);
  const lista = await mpPedir<Record<string, unknown>[]>(token, "GET", `/v1/account/${familia}/list`);
  const archivos = Array.isArray(lista.datos) ? lista.datos : [];
  const fechas = (k: string) => archivos.map((a) => String(a[k] ?? "")).filter(Boolean).sort();
  const desde = fechas("begin_date"), hasta = fechas("end_date");
  return {
    config: { status: conf.status, datos: ok(conf) ? conf.datos : corto(conf.datos) },
    lista: {
      status: lista.status, cantidad: archivos.length,
      ...(ok(lista) ? {} : { respuesta: corto(lista.datos) }),
      inicioMasViejo: desde[0] ?? null, finMasNuevo: hasta.at(-1) ?? null,
      campos: archivos[0] ? Object.keys(archivos[0]) : [],
      ejemplos: archivos.slice(0, 3).concat(archivos.length > 3 ? archivos.slice(-3) : []),
    },
  };
}

export type Sonda = Record<string, unknown>;

/** El inventario de una cuenta conectada. Nunca tira: lo que falla queda anotado. */
export async function sondearCuenta(conexionId: number): Promise<Sonda> {
  const token = await tokenDeConexion(conexionId);
  if (!token) return { conexion: "sin llave vigente (desconectada)" };
  const yo = await mpPedir<Record<string, unknown>>(token, "GET", "/users/me");
  const u = (ok(yo) ? yo.datos : {}) as Record<string, unknown> & { identification?: { type?: string; number?: string } };
  const uid = Number(u.id ?? 0);
  const salida: Sonda = {
    usuario: ok(yo)
      ? { id: u.id, nickname: u.nickname, nombre: [u.first_name, u.last_name].filter(Boolean).join(" ") || null, tipoDoc: u.identification?.type ?? null,
          documento: u.identification?.number ?? null, tipoUsuario: u.user_type ?? null, sitio: u.site_id ?? null, alta: u.registration_date ?? u.date_created ?? null,
          estado: u.status ?? null, empresa: u.company ?? null }
      : { status: yo.status, respuesta: corto(yo.datos) },
  };
  salida.todasLasTransacciones = await reportes(token, "settlement_report");
  salida.liquidaciones = await reportes(token, "release_report");
  salida.pagosCobrados = await busqueda(token, "range=date_created&begin_date=NOW-20YEARS&end_date=NOW");
  salida.pagosCobradosSinRango = await busqueda(token, "");
  if (uid) {
    salida.pagosHechos = await busqueda(token, `payer.id=${uid}`);
    salida.pagosHechosRango = await busqueda(token, `payer.id=${uid}&range=date_created&begin_date=NOW-20YEARS&end_date=NOW`);
  }
  const otras: Record<string, unknown> = {};
  for (const r of ["activities_collection", "activities_after_collection", "activities_withdraw"]) {
    for (const ruta of [`/v1/reporting/operations/${r}/config`, `/v1/reporting/operations/${r}/statements`, `/v1/reporting/operations/${r}`]) {
      const x = await mpPedir(token, "GET", ruta);
      otras[ruta] = { status: x.status, respuesta: corto(x.datos, 400) };
    }
  }
  salida.otrasOperaciones = otras;
  return salida;
}

/** El inventario de todas las cuentas conectadas de una organización (o de todas, si no se dice cuál). */
export async function sondearTodas(org?: string): Promise<{ conexion: number; nombre: string | null }[]> {
  const cuentas = await consulta<{ id: number; organizacion_id: string; nombre: string | null }>(
    `select id::int, organizacion_id, nombre from mp_conexion where ($1::text is null or organizacion_id = $1) order by id`, [org ?? null]);
  const hechas = await Promise.all(cuentas.map(async (c) => {
    let datos: Sonda;
    try { datos = await sondearCuenta(c.id); } catch (e) { datos = { error: String(e).slice(0, 300) }; }
    await una("insert into mp_export_sonda (organizacion_id, conexion_id, datos) values ($1, $2, $3) returning id", [c.organizacion_id, c.id, JSON.stringify(datos)]);
    return { conexion: c.id, nombre: c.nombre };
  }));
  return hechas;
}
