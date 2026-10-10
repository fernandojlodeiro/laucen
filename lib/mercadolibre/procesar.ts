// Lo que llega de Mercado Libre (notificaciones) y el barrido de seguridad
// que corre cada 30 minutos (pg_cron → /api/meli/barrido): procesa las
// notificaciones pendientes, trae las órdenes y preguntas que se hayan
// perdido (y los reclamos) y encola los ajustes de stock en ML (lib/mercadolibre/cola.ts).

import { consulta, una } from "@/lib/erp/base";
import { cuentaPorUsuario, cuentasActivas, ml, type CuentaMl } from "@/lib/mercadolibre/api";
import { importarOrden, barrerOrdenes } from "@/lib/mercadolibre/pedidos";
import { leerEnvio, guardarEnvio } from "@/lib/mercadolibre/envios";
import { importarPregunta, barrerPreguntas, sugerirPendientes } from "@/lib/mercadolibre/preguntas";
import { importarMensaje, sugerirMensajesPendientes } from "@/lib/mercadolibre/mensajes";
import { completarPlazosDespacho } from "@/lib/mercadolibre/envios";
import { importarReclamoDeNotificacion, barrerReclamos } from "@/lib/mercadolibre/reclamos";
import { guardarItem, type ItemMl } from "@/lib/mercadolibre/publicaciones";
import { sincronizarStockMl, variacionesConEventos } from "@/lib/mercadolibre/stock";

export type Notificacion = { resource?: string; user_id?: number | string; topic?: string; application_id?: number | string };

/** Guarda la notificación tal como llegó. Devuelve su id. */
export async function guardarNotificacion(n: Notificacion): Promise<number | null> {
  if (!n.topic || !n.resource) return null;
  const cuenta = n.user_id ? await cuentaPorUsuario(Number(n.user_id)) : null;
  const r = await una<{ id: string }>(`
    insert into meli_notificacion (organizacion_id, meli_user_id, topic, resource, payload) values ($1, $2, $3, $4, $5::jsonb) returning id`,
    [cuenta?.organizacionId ?? null, n.user_id ? Number(n.user_id) : null, n.topic, n.resource, JSON.stringify(n)]);
  return r ? Number(r.id) : null;
}

const ultimo = (recurso: string) => recurso.split("?")[0].split("/").filter(Boolean).pop()!;

/** Hace lo que corresponde según el tópico. */
async function procesarUna(cuenta: CuentaMl, topic: string, recurso: string) {
  switch (topic) {
    case "orders_v2":
    case "orders": {
      const pedidoId = await importarOrden(cuenta, ultimo(recurso));
      if (pedidoId) await sincronizarStockDelPedido(cuenta.organizacionId, pedidoId);
      return;
    }
    case "shipments": {
      const e = await leerEnvio(cuenta, ultimo(recurso));
      if (!e) return;
      if (e.orderId) {
        const pedidoId = await importarOrden(cuenta, e.orderId);
        if (pedidoId) await sincronizarStockDelPedido(cuenta.organizacionId, pedidoId);
      } else if (cuenta.canalId) await guardarEnvio(cuenta.organizacionId, cuenta.canalId, null, e);
      return;
    }
    case "questions":
      await importarPregunta(cuenta, ultimo(recurso));
      await sugerirPendientes({ org: cuenta.organizacionId, max: 3 }); // la IA propone sola la respuesta
      return;
    case "messages":
      await importarMensaje(cuenta, recurso);
      await sugerirMensajesPendientes({ org: cuenta.organizacionId, max: 3 });
      return;
    case "items": {
      const r = await ml<ItemMl>(cuenta, "GET", `/items/${ultimo(recurso)}?include_attributes=all`);
      if (r.status === 200) await guardarItem(cuenta, r.datos);
      return;
    }
    // Cambió el precio de venta o una oferta (campaña) de una publicación: se relee ya, así las pantallas
    // muestran lo que ve el comprador con segundos de atraso (Fer, 10/10).
    case "items_prices":
    case "public_offers": {
      const item = recurso.match(/MLA\d+/)?.[0];
      if (item) await (await import("@/lib/precios-ml/lectura")).releerPublicacion(cuenta, item);
      return;
    }
    case "claims":
    case "claims_actions":
      return importarReclamoDeNotificacion(cuenta, recurso);
    default:
      return; // otros tópicos (pagos…) quedan guardados para cuando se usen
  }
}

/** Después de que entra o cambia un pedido: el stock de sus variaciones en
 *  todas las cuentas (si una venta lo dejó en el umbral, se pausa ya). */
async function sincronizarStockDelPedido(org: string, pedidoId: number) {
  const vars = await consulta<{ v: number }>("select distinct variacion_id::int v from pedido_linea where pedido_id = $1 and variacion_id is not null", [pedidoId]);
  if (vars.length) await sincronizarStockMl(org, vars.map((x) => x.v));
}

/** Procesa una notificación guardada (o las pendientes, si no se pasa id). */
export async function procesarNotificaciones(hastaMs: number, id?: number): Promise<{ ok: number; error: number }> {
  const res = { ok: 0, error: 0 };
  const filas = await consulta<{ id: string; meli_user_id: string | null; topic: string; resource: string }>(`
    select id, meli_user_id, topic, resource from meli_notificacion
     where procesada_ts is null and intentos < 5 ${id ? "and id = $1" : ""}
     order by recibida_ts limit 300`, id ? [id] : []);
  // La misma orden avisa varias veces seguidas: se procesa una sola vez por tanda.
  const hechas = new Set<string>();
  for (const f of filas) {
    if (Date.now() > hastaMs) break;
    const clave = `${f.meli_user_id}|${f.topic}|${f.resource}`;
    try {
      if (!hechas.has(clave)) {
        const cuenta = f.meli_user_id ? await cuentaPorUsuario(Number(f.meli_user_id)) : null;
        if (cuenta) await procesarUna(cuenta, f.topic, f.resource);
        hechas.add(clave);
      }
      await consulta("update meli_notificacion set procesada_ts = now(), intentos = intentos + 1, error = null where id = $1", [f.id]);
      res.ok++;
    } catch (e) {
      await consulta("update meli_notificacion set intentos = intentos + 1, error = $2 where id = $1", [f.id, String((e as Error).message ?? e).slice(0, 500)]);
      res.error++;
    }
  }
  return res;
}

/** El barrido completo. */
export async function barrido(hastaMs: number) {
  const informe: Record<string, unknown> = {};
  informe.notificaciones = await procesarNotificaciones(hastaMs);
  const cuentas = await cuentasActivas();
  for (const c of cuentas) {
    const r: Record<string, unknown> = {};
    try { r.ordenes = await barrerOrdenes(c, hastaMs); } catch (e) { r.ordenes_error = (e as Error).message; }
    try { r.preguntas = await barrerPreguntas(c); } catch (e) { r.preguntas_error = (e as Error).message; }
    // Las que no alcanzaron a tener su respuesta propuesta (notificación perdida, la IA no contestó): se completan acá.
    if (Date.now() < hastaMs) { try { r.sugerencias = await sugerirPendientes({ org: c.organizacionId, max: 5, hastaMs }); r.sugerencias_mensajes = await sugerirMensajesPendientes({ org: c.organizacionId, max: 5, hastaMs }); } catch { /* no frena el barrido */ } }
    // Los reclamos no frenan lo demás ni marcan la cuenta con error (ML puede no dar permiso de posventa).
    if (Date.now() < hastaMs) { try { r.plazos = await completarPlazosDespacho(c); } catch (e) { r.plazos_error = (e as Error).message; } }
    if (Date.now() < hastaMs) { try { r.reclamos = await barrerReclamos(c, hastaMs); } catch (e) { r.reclamos_error = (e as Error).message; } }
    if (r.ordenes_error || r.preguntas_error) {
      await consulta("update meli_cuenta set ultimo_error = $2 where id = $1", [c.id, String(r.ordenes_error ?? r.preguntas_error).slice(0, 300)]);
    }
    informe[`cuenta_${c.nickname ?? c.id}`] = r;
  }
  for (const org of new Set(cuentas.map((c) => c.organizacionId))) {
    if (Date.now() > hastaMs) break;
    await variacionesConEventos(org); // los eventos de stock quedan atendidos por la revisión completa
    informe[`stock_${org}`] = await sincronizarStockMl(org, undefined, hastaMs);
  }
  return informe;
}
