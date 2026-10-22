// Exportación de Mercado Pago (lib/mercadopago/exportacion.ts). La llama la base
// (pg_net) con ?clave= (tabla erp_llave): por ahora sólo el inventario de las
// cuentas conectadas (?accion=sonda), la muestra de un mes de una cuenta
// (?accion=muestra&conexion=&mes=AAAA-MM: pide los reportes del mes y baja los
// pagos), bajar esos reportes ya armados (?accion=bajar&conexion=&mes=), poner
// meses en la cola (?accion=encolar) y la vuelta que la avanza (?accion=vuelta).
// Sólo lee de Mercado Pago y pide reportes; nunca mueve plata.

import { pool } from "@/db";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { sondearTodas, muestraMes, bajarReportes, destinoEmpresa } from "@/lib/mercadopago/exportacion";
import { encolar, vuelta } from "@/lib/mercadopago/cola-export";
import { datosExportacionEmpresa } from "@/lib/mercadopago/exportacion";
import { normalizar } from "@/lib/mercadopago/normalizar";
import { mpPedir } from "@/lib/mercadopago/conexion";
import { destinoPersonal } from "@/lib/personal/mercadopago";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  await asegurarEsquemaErp();
  const q = new URL(req.url).searchParams;
  const clave = q.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  try {
    return await correr(q);
  } catch (e) {
    // Lo que falló, para leerlo desde la base (net._http_response): sin llaves, sólo el mensaje.
    return Response.json({ error: e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 4).join("\n")}` : String(e) }, { status: 500 });
  }
}

async function correr(q: URLSearchParams) {
  const accion = q.get("accion"), conexion = Number(q.get("conexion")), mes = q.get("mes") ?? "";
  if (accion === "sonda") return Response.json(await sondearTodas(q.get("org") ?? undefined));
  // ¿Qué dice Mercado Pago de un movimiento suelto (un retiro, una transferencia) y de quien lo recibió?
  // Sólo lectura (GET) de una lista fija de caminos, con una cuenta personal (?personal=<conexión>&id=&usuario=).
  if (accion === "detalle" && q.get("personal")) {
    const c = (await pool.query("select mp_user_id::bigint id from personal.mp_conexion where id = $1", [Number(q.get("personal"))])).rows[0];
    if (!c) return new Response("No", { status: 404 });
    const token = await destinoPersonal(Number(q.get("personal")), Number(c.id)).token();
    if (!token) return new Response("Sin llave", { status: 409 });
    const id = (q.get("id") ?? "").replace(/\D/g, ""), usuario = (q.get("usuario") ?? "").replace(/\D/g, "");
    const caminos = [
      ...(id ? [`/v1/payments/${id}`, `/v1/payouts/${id}`, `/v1/transfers/${id}`, `/v1/bank_transfers/${id}`, `/v1/money_transfers/${id}`, `/v1/account/movements/search?id=${id}`] : []),
      ...(usuario ? [`/users/${usuario}`] : []),
    ];
    const salida: Record<string, unknown> = {};
    for (const ruta of caminos) {
      const r = await mpPedir(token, "GET", ruta);
      salida[ruta] = { status: r.status, datos: JSON.stringify(r.datos).slice(0, 4000) };
    }
    return Response.json(salida);
  }
  // Para revisar la exportación de la empresa sin bajar el .zip: el control de saldo por cuenta y mes, y los problemas.
  if (accion === "resumen" && q.get("org")) {
    const { movimientos, controles, problemas } = await normalizar(await datosExportacionEmpresa(q.get("org")!));
    return Response.json({ movimientos: movimientos.length, problemas: problemas.length, controles: controles.map((c) => [c.cuenta_alias, c.mes, c.filas, c.neto, c.saldo_inicial, c.saldo_final, c.retiros_liquidaciones, c.diferencia]) });
  }
  // La vuelta de la cola (pg_cron 'mp-export', db/personal.sql): empresa y espacios personales.
  if (accion === "vuelta") return Response.json(await vuelta());
  // Poner en la cola los meses de una cuenta de la empresa (?desde=AAAA-MM&hasta=AAAA-MM&parcial=1).
  if (accion === "encolar" && conexion) {
    const de = await destinoEmpresa(conexion);
    const desde = q.get("desde") ?? "", hasta = q.get("hasta") ?? "";
    if (!de || !/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) return new Response("Faltan datos", { status: 400 });
    return Response.json({ encolados: await encolar(de, desde, hasta, q.get("parcial") === "1") });
  }
  const d = conexion && /^\d{4}-\d{2}$/.test(mes) ? await destinoEmpresa(conexion) : null;
  if (accion === "muestra" && d) return Response.json(await muestraMes(d, mes));
  if (accion === "bajar" && d) return Response.json(await bajarReportes(d, mes));
  return new Response("Acción desconocida", { status: 400 });
}
