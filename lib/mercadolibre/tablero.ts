// Los números del tablero de Mercado Libre (/mercadolibre): por cada cuenta
// conectada a un canal, la reputación guardada y lo que hay para atender
// (preguntas, mensajes, reclamos, devoluciones, envíos, pedidos) y el estado
// de sus publicaciones; más dos alertas del catálogo que no son de ninguna
// cuenta. Todo sale de lo que Laucen ya tiene guardado (nada llama a ML acá,
// salvo la reputación que se actualiza aparte).
//
// Cada número usa la MISMA condición que la pantalla a la que lleva su
// enlace (Envíos, Pedidos, Reclamos, Preguntas, Vincular con ML), para que la
// cuenta del tablero y la de la lista coincidan.

import { consulta } from "@/lib/erp/base";
import { CONDICION_ENVIOS } from "@/app/ventas/envios/lista";
import { CONDICION_RECLAMOS } from "@/lib/reclamos";
import { sqlPedidoPendiente, sqlCarritoEnEspera } from "@/lib/pedidos";
import { estadoColaCanal } from "@/lib/mercadolibre/cola";
import { ESTADOS_ML_CON_PROBLEMAS } from "@/app/catalogo/publicaciones/ml/lista";
import { SQL_SIN_PUBLICAR, SQL_SIN_FOTOS } from "@/lib/catalogo-alertas";
import type { Reputacion } from "@/lib/mercadolibre/reputacion";

const ZONA = "America/Argentina/Buenos_Aires";

export type CuentaTablero = {
  cuentaId: number; canalId: number; canal: string; apodo: string | null; estado: string; ultimoError: string | null;
  razonSocial: string | null; reputacion: Reputacion | null; reputacionTs: Date | null;
};

/** Lo que hay para atender de una cuenta. `de` = el total de esa clase (para mostrar "5 de 120"). */
export type Metricas = {
  publicaciones: { total: number; activas: number; pausadas: number; conCuestiones: number; sinProducto: number; sinProductoActivas: number };
  etiquetas: { sinImprimir: number; porDespachar: number; vencidos: number };
  pedidosParaPreparar: number;
  enCamino: number;
  preguntas: { sinResponder: number; total: number; masVieja: Date | null };
  mensajes: { sinLeer: number; total: number };
  reclamos: { abiertos: number; esperanRespuesta: number; urgentes: number; enMediacion: number; total: number };
  devoluciones: { abiertas: number; enCamino: number; total: number };
  ventas: { hoy: number; hoyArs: number; sieteDias: number; sieteDiasArs: number };
  cola: { pendientes: number; errores: number; preparados: number };
};

const vacio = (): Metricas => ({
  publicaciones: { total: 0, activas: 0, pausadas: 0, conCuestiones: 0, sinProducto: 0, sinProductoActivas: 0 },
  etiquetas: { sinImprimir: 0, porDespachar: 0, vencidos: 0 },
  pedidosParaPreparar: 0, enCamino: 0,
  preguntas: { sinResponder: 0, total: 0, masVieja: null },
  mensajes: { sinLeer: 0, total: 0 },
  reclamos: { abiertos: 0, esperanRespuesta: 0, urgentes: 0, enMediacion: 0, total: 0 },
  devoluciones: { abiertas: 0, enCamino: 0, total: 0 },
  ventas: { hoy: 0, hoyArs: 0, sieteDias: 0, sieteDiasArs: 0 },
  cola: { pendientes: 0, errores: 0, preparados: 0 },
});

/** Las cuentas de ML conectadas a un canal, con su reputación guardada. */
export async function cuentasTablero(org: string): Promise<CuentaTablero[]> {
  const f = await consulta<{ id: number; canal_id: number; canal: string; nickname: string | null; estado: string; ultimo_error: string | null;
    razon: string | null; reputacion: Reputacion | null; reputacion_ts: Date | null }>(`
    select mc.id::int, mc.canal_id::int, ca.nombre canal, mc.nickname, mc.estado, mc.ultimo_error,
           (select coalesce(e.nombre, e.razon_social) from emisor e where e.id = coalesce(ca.emisor_id, emisor_principal(ca.organizacion_id))) razon,
           mc.reputacion, mc.reputacion_ts
      from meli_cuenta mc join canal ca on ca.id = mc.canal_id
     where mc.organizacion_id = $1 order by ca.nombre, mc.id`, [org]);
  return f.map((x) => ({ cuentaId: x.id, canalId: x.canal_id, canal: x.canal, apodo: x.nickname, estado: x.estado, ultimoError: x.ultimo_error,
    razonSocial: x.razon, reputacion: x.reputacion, reputacionTs: x.reputacion_ts }));
}

/** Las métricas de cada canal de ML (clave: id del canal). */
export async function metricasPorCanal(org: string, canales: number[]): Promise<Map<number, Metricas>> {
  const m = new Map<number, Metricas>(canales.map((c) => [c, vacio()]));
  if (!canales.length) return m;
  const poner = (canal: number, f: (x: Metricas) => void) => { const x = m.get(canal); if (x) f(x); };
  const q = <T extends Record<string, unknown>>(sql: string) => consulta<T & { canal: number }>(sql, [org, canales]);

  const [pubs, envios, pedidos, preguntas, mensajes, reclamos, ventas] = await Promise.all([
    q<{ total: number; activas: number; pausadas: number; con_cuestiones: number; sin_producto: number; sin_producto_activas: number }>(`
      select canal_id::int canal, count(distinct item_id)::int total,
             count(distinct item_id) filter (where estado = 'active')::int activas,
             count(distinct item_id) filter (where estado = 'paused')::int pausadas,
             count(distinct item_id) filter (where estado in ${ESTADOS_ML_CON_PROBLEMAS})::int con_cuestiones,
             count(*) filter (where publicacion_id is null)::int sin_producto,
             count(*) filter (where publicacion_id is null and estado = 'active')::int sin_producto_activas
        from meli_item where organizacion_id = $1 and canal_id = any($2::bigint[]) group by canal_id`),
    q<{ sin_imprimir: number; por_despachar: number; vencidos: number; en_camino: number }>(`
      select e.canal_id::int canal,
             count(*) filter (where ${CONDICION_ENVIOS.despachar} and e.etiqueta_impresa_ts is null and e.id_externo is not null)::int sin_imprimir,
             count(*) filter (where ${CONDICION_ENVIOS.despachar})::int por_despachar,
             count(*) filter (where ${CONDICION_ENVIOS.despachar} and e.despachar_antes is not null
                               and (e.despachar_antes at time zone '${ZONA}')::date <= (now() at time zone '${ZONA}')::date)::int vencidos,
             count(*) filter (where ${CONDICION_ENVIOS.camino})::int en_camino
        from envio e where e.organizacion_id = $1 and e.canal_id = any($2::bigint[]) group by e.canal_id`),
    q<{ para_preparar: number }>(`
      select p.canal_id::int canal, count(*)::int para_preparar
        from pedido p where p.organizacion_id = $1 and p.canal_id = any($2::bigint[])
         and ${sqlPedidoPendiente("p")} and not ${sqlCarritoEnEspera("p")} group by p.canal_id`),
    q<{ sin_responder: number; total: number; mas_vieja: Date | null }>(`
      select canal_id::int canal, count(*) filter (where estado = 'UNANSWERED')::int sin_responder, count(*)::int total,
             min(fecha) filter (where estado = 'UNANSWERED') mas_vieja
        from meli_pregunta where organizacion_id = $1 and canal_id = any($2::bigint[]) group by canal_id`),
    q<{ sin_leer: number; total: number }>(`
      select canal_id::int canal, count(*) filter (where sin_leer > 0)::int sin_leer, count(*)::int total
        from meli_conversacion where organizacion_id = $1 and canal_id = any($2::bigint[]) group by canal_id`),
    q<{ abiertos: number; esperan: number; urgentes: number; mediacion: number; total: number; dev_abiertas: number; dev_camino: number; dev_total: number }>(`
      select r.canal_id::int canal,
             count(*) filter (where r.estado <> 'resuelto')::int abiertos,
             count(*) filter (where r.estado <> 'resuelto' and r.espera_respuesta)::int esperan,
             count(*) filter (where r.estado <> 'resuelto' and r.espera_respuesta and r.vence_ts < now() + interval '24 hours')::int urgentes,
             count(*) filter (where ${CONDICION_RECLAMOS.mediacion})::int mediacion,
             count(*)::int total,
             count(*) filter (where r.tipo = 'devolucion' and r.estado <> 'resuelto')::int dev_abiertas,
             count(*) filter (where r.tipo = 'devolucion' and ${CONDICION_RECLAMOS.camino})::int dev_camino,
             count(*) filter (where r.tipo = 'devolucion')::int dev_total
        from reclamo r where r.organizacion_id = $1 and r.canal_id = any($2::bigint[]) and r.origen = 'mercadolibre' group by r.canal_id`),
    q<{ hoy: number; hoy_ars: string; siete: number; siete_ars: string }>(`
      select p.canal_id::int canal,
             count(*) filter (where (p.fecha at time zone '${ZONA}')::date = (now() at time zone '${ZONA}')::date)::int hoy,
             coalesce(sum(p.total_ars) filter (where (p.fecha at time zone '${ZONA}')::date = (now() at time zone '${ZONA}')::date), 0) hoy_ars,
             count(*)::int siete, coalesce(sum(p.total_ars), 0) siete_ars
        from pedido p where p.organizacion_id = $1 and p.canal_id = any($2::bigint[]) and p.estado <> 'cancelado'
         and p.fecha > now() - interval '7 days' group by p.canal_id`),
  ]);
  for (const f of pubs) poner(f.canal, (x) => { x.publicaciones = { total: f.total, activas: f.activas, pausadas: f.pausadas, conCuestiones: f.con_cuestiones, sinProducto: f.sin_producto, sinProductoActivas: f.sin_producto_activas }; });
  for (const f of envios) poner(f.canal, (x) => { x.etiquetas = { sinImprimir: f.sin_imprimir, porDespachar: f.por_despachar, vencidos: f.vencidos }; x.enCamino = f.en_camino; });
  for (const f of pedidos) poner(f.canal, (x) => { x.pedidosParaPreparar = f.para_preparar; });
  for (const f of preguntas) poner(f.canal, (x) => { x.preguntas = { sinResponder: f.sin_responder, total: f.total, masVieja: f.mas_vieja }; });
  for (const f of mensajes) poner(f.canal, (x) => { x.mensajes = { sinLeer: f.sin_leer, total: f.total }; });
  for (const f of reclamos) poner(f.canal, (x) => {
    x.reclamos = { abiertos: f.abiertos, esperanRespuesta: f.esperan, urgentes: f.urgentes, enMediacion: f.mediacion, total: f.total };
    x.devoluciones = { abiertas: f.dev_abiertas, enCamino: f.dev_camino, total: f.dev_total };
  });
  for (const f of ventas) poner(f.canal, (x) => { x.ventas = { hoy: f.hoy, hoyArs: Number(f.hoy_ars), sieteDias: f.siete, sieteDiasArs: Number(f.siete_ars) }; });
  await Promise.all(canales.map(async (c) => {
    const e = await estadoColaCanal(c);
    if (e) poner(c, (x) => { x.cola = { pendientes: e.pendientes, errores: e.errores, preparados: e.preparados }; });
  }));
  return m;
}

/** Las alertas del catálogo (no son de ninguna cuenta): con stock y sin publicación activa en ML, y de la web sin fotos. */
export async function alertasCatalogo(org: string) {
  const [x] = await consulta<{ sin_publicar: number; sin_fotos: number; con_stock: number }>(`
    select count(*) filter (where ${SQL_SIN_PUBLICAR})::int sin_publicar,
           count(*) filter (where ${SQL_SIN_FOTOS})::int sin_fotos,
           count(*) filter (where p.estado = 'activo')::int con_stock
      from producto p where p.organizacion_id = $1`, [org]);
  return { sinPublicar: x?.sin_publicar ?? 0, sinFotos: x?.sin_fotos ?? 0, productosActivos: x?.con_stock ?? 0 };
}

export const sumar = (ms: Metricas[]): Metricas => {
  const t = vacio();
  for (const m of ms) {
    for (const k of Object.keys(t.publicaciones) as (keyof Metricas["publicaciones"])[]) t.publicaciones[k] += m.publicaciones[k];
    for (const k of Object.keys(t.etiquetas) as (keyof Metricas["etiquetas"])[]) t.etiquetas[k] += m.etiquetas[k];
    t.pedidosParaPreparar += m.pedidosParaPreparar; t.enCamino += m.enCamino;
    t.preguntas.sinResponder += m.preguntas.sinResponder; t.preguntas.total += m.preguntas.total;
    if (m.preguntas.masVieja && (!t.preguntas.masVieja || m.preguntas.masVieja < t.preguntas.masVieja)) t.preguntas.masVieja = m.preguntas.masVieja;
    t.mensajes.sinLeer += m.mensajes.sinLeer; t.mensajes.total += m.mensajes.total;
    for (const k of Object.keys(t.reclamos) as (keyof Metricas["reclamos"])[]) t.reclamos[k] += m.reclamos[k];
    for (const k of Object.keys(t.devoluciones) as (keyof Metricas["devoluciones"])[]) t.devoluciones[k] += m.devoluciones[k];
    for (const k of Object.keys(t.ventas) as (keyof Metricas["ventas"])[]) t.ventas[k] += m.ventas[k];
    for (const k of Object.keys(t.cola) as (keyof Metricas["cola"])[]) t.cola[k] += m.cola[k];
  }
  return t;
};
