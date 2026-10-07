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

import { sqlReservaSinPagar } from "@/lib/pedidos/reserva";
import { consulta } from "@/lib/erp/base";
import { CONDICION_ENVIOS } from "@/app/ventas/envios/lista";
import { CONDICION_RECLAMOS } from "@/lib/reclamos";
import { sqlPedidoPendiente, sqlCarritoEnEspera } from "@/lib/pedidos";
import { estadoColaCanal } from "@/lib/mercadolibre/cola";
import { ESTADOS_ML_CON_PROBLEMAS } from "@/app/catalogo/publicaciones/ml/lista";
import { SQL_SIN_PUBLICAR, SQL_SIN_FOTOS, SQL_DISPONIBLE } from "@/lib/catalogo-alertas";
import { sqlPublicadoEnWeb } from "@/lib/catalogo/web";
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
  /** Sin pagar que guardan stock (lib/pedidos/reserva.ts) y cuántos vencen hoy o mañana. */
  reservados: number; reservadosVencen: number;
  /** Sin terminar de preparar (nuevos + en preparación) y en preparación. */
  pedidosSinDespachar: number; enPreparacion: number;
  /** Preparados que falta despachar, y el plazo más cercano ("despachar antes de" de ML). */
  paraDespachar: number; despacharAntes: Date | null; despacharVencidos: number;
  enCamino: number;
  preguntas: { sinResponder: number; total: number; masVieja: Date | null };
  mensajes: { sinLeer: number; total: number };
  reclamos: { abiertos: number; esperanRespuesta: number; urgentes: number; enMediacion: number; total: number };
  devoluciones: { abiertas: number; enCamino: number; total: number };
  ventas: { hoy: number; hoyArs: number; hoyUsd: number; sieteDias: number; sieteDiasArs: number; sieteDiasUsd: number };
  cola: { pendientes: number; errores: number; preparados: number };
};

const vacio = (): Metricas => ({
  publicaciones: { total: 0, activas: 0, pausadas: 0, conCuestiones: 0, sinProducto: 0, sinProductoActivas: 0 },
  etiquetas: { sinImprimir: 0, porDespachar: 0, vencidos: 0 },
  pedidosParaPreparar: 0, reservados: 0, reservadosVencen: 0, enCamino: 0, pedidosSinDespachar: 0, enPreparacion: 0, paraDespachar: 0, despacharAntes: null, despacharVencidos: 0,
  preguntas: { sinResponder: 0, total: 0, masVieja: null },
  mensajes: { sinLeer: 0, total: 0 },
  reclamos: { abiertos: 0, esperanRespuesta: 0, urgentes: 0, enMediacion: 0, total: 0 },
  devoluciones: { abiertas: 0, enCamino: 0, total: 0 },
  ventas: { hoy: 0, hoyArs: 0, hoyUsd: 0, sieteDias: 0, sieteDiasArs: 0, sieteDiasUsd: 0 },
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
export async function metricasPorCanal(org: string, canales: number[], { soloMl = true }: { soloMl?: boolean } = {}): Promise<Map<number, Metricas>> {
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
    q<{ reservados: number; reservados_vencen: number; para_preparar: number; en_preparacion: number; sin_despachar: number; para_despachar: number; antes: Date | null; vencidos: number }>(`
      select p.canal_id::int canal,
             count(*) filter (where ${sqlPedidoPendiente("p")} and not ${sqlCarritoEnEspera("p")})::int para_preparar,
             count(*) filter (where p.estado = 'en_preparacion')::int en_preparacion,
             count(*) filter (where ${sqlReservaSinPagar("p")})::int reservados,
             count(*) filter (where ${sqlReservaSinPagar("p")} and p.reserva_hasta <= (now() at time zone '${ZONA}')::date + 1)::int reservados_vencen,
             count(*) filter (where p.estado in ('nuevo', 'pagado', 'en_preparacion', 'preparado'))::int sin_despachar,
             count(*) filter (where p.estado = 'preparado')::int para_despachar,
             min(e.despachar_antes) filter (where p.estado = 'preparado') antes,
             count(*) filter (where p.estado = 'preparado' and e.despachar_antes < now())::int vencidos
        from pedido p
        left join lateral (select despachar_antes from envio e where e.pedido_id = p.id and coalesce(e.logistica, '') <> 'fulfillment'
                            order by e.id desc limit 1) e on true
       where p.organizacion_id = $1 and p.canal_id = any($2::bigint[])
         and p.estado in ('nuevo', 'pagado', 'en_preparacion', 'preparado', 'despachado')
       group by p.canal_id`),
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
             -- Los totales, de los últimos 60 días (la ventana de la reputación de ML).
             count(*) filter (where r.fecha > now() - interval '60 days')::int total,
             count(*) filter (where r.tipo = 'devolucion' and r.estado <> 'resuelto')::int dev_abiertas,
             count(*) filter (where r.tipo = 'devolucion' and ${CONDICION_RECLAMOS.camino})::int dev_camino,
             count(*) filter (where r.tipo = 'devolucion' and r.fecha > now() - interval '60 days')::int dev_total
        from reclamo r where r.organizacion_id = $1 and r.canal_id = any($2::bigint[]) ${soloMl ? "and r.origen = 'mercadolibre'" : ""} group by r.canal_id`),
    q<{ hoy: number; hoy_ars: string; hoy_usd: string; siete: number; siete_ars: string; siete_usd: string }>(`
      select p.canal_id::int canal,
             count(*) filter (where (p.fecha at time zone '${ZONA}')::date = (now() at time zone '${ZONA}')::date)::int hoy,
             coalesce(sum(p.total_ars) filter (where (p.fecha at time zone '${ZONA}')::date = (now() at time zone '${ZONA}')::date), 0) hoy_ars,
             coalesce(sum(p.total_usd) filter (where (p.fecha at time zone '${ZONA}')::date = (now() at time zone '${ZONA}')::date), 0) hoy_usd,
             count(*)::int siete, coalesce(sum(p.total_ars), 0) siete_ars, coalesce(sum(p.total_usd), 0) siete_usd
        from pedido p where p.organizacion_id = $1 and p.canal_id = any($2::bigint[]) and p.estado not in ('cancelado', 'presupuesto')
         and p.fecha > now() - interval '7 days' group by p.canal_id`),
  ]);
  for (const f of pubs) poner(f.canal, (x) => { x.publicaciones = { total: f.total, activas: f.activas, pausadas: f.pausadas, conCuestiones: f.con_cuestiones, sinProducto: f.sin_producto, sinProductoActivas: f.sin_producto_activas }; });
  for (const f of envios) poner(f.canal, (x) => { x.etiquetas = { sinImprimir: f.sin_imprimir, porDespachar: f.por_despachar, vencidos: f.vencidos }; x.enCamino = f.en_camino; });
  for (const f of pedidos) poner(f.canal, (x) => {
    x.reservados = f.reservados; x.reservadosVencen = f.reservados_vencen;
    x.pedidosParaPreparar = f.para_preparar; x.enPreparacion = f.en_preparacion; x.pedidosSinDespachar = f.sin_despachar;
    x.paraDespachar = f.para_despachar; x.despacharAntes = f.antes; x.despacharVencidos = f.vencidos;
  });
  for (const f of preguntas) poner(f.canal, (x) => { x.preguntas = { sinResponder: f.sin_responder, total: f.total, masVieja: f.mas_vieja }; });
  for (const f of mensajes) poner(f.canal, (x) => { x.mensajes = { sinLeer: f.sin_leer, total: f.total }; });
  for (const f of reclamos) poner(f.canal, (x) => {
    x.reclamos = { abiertos: f.abiertos, esperanRespuesta: f.esperan, urgentes: f.urgentes, enMediacion: f.mediacion, total: f.total };
    x.devoluciones = { abiertas: f.dev_abiertas, enCamino: f.dev_camino, total: f.dev_total };
  });
  for (const f of ventas) poner(f.canal, (x) => { x.ventas = { hoy: f.hoy, hoyArs: Number(f.hoy_ars), hoyUsd: Number(f.hoy_usd), sieteDias: f.siete, sieteDiasArs: Number(f.siete_ars), sieteDiasUsd: Number(f.siete_usd) }; });
  await Promise.all(canales.map(async (c) => {
    const e = await estadoColaCanal(c);
    if (e) poner(c, (x) => { x.cola = { pendientes: e.pendientes, errores: e.errores, preparados: e.preparados }; });
  }));
  return m;
}

/** Las alertas del catálogo (no son de ninguna cuenta): con stock y sin publicación activa en ML, y de la web sin fotos.
 *  `productosActivos` = todos los productos activos (tengan o no stock); `conStock` = los activos con stock disponible;
 *  `publicadosWeb` = los activos con el interruptor "Publicado en Web" prendido en alguna tienda. */
export async function alertasCatalogo(org: string) {
  const [x] = await consulta<{ sin_publicar: number; sin_fotos: number; activos: number; con_stock: number; publicados_web: number }>(`
    select count(*) filter (where ${SQL_SIN_PUBLICAR})::int sin_publicar,
           count(*) filter (where ${SQL_SIN_FOTOS})::int sin_fotos,
           count(*) filter (where p.estado = 'activo')::int activos,
           count(*) filter (where p.estado = 'activo' and not p.no_publicable and ${SQL_DISPONIBLE} > 0)::int con_stock,
           count(*) filter (where p.estado = 'activo' and exists (
             select 1 from publicacion pw join variacion vw on vw.id = pw.variacion_id join canal cw on cw.id = pw.canal_id
              where vw.producto_id = p.id and pw.estado = 'activa' and pw.id_externo is null
                and cw.tipo in ('web_minorista', 'web_mayorista') and cw.estado = 'activo'))::int publicados_web
      from producto p where p.organizacion_id = $1`, [org]);
  return { sinPublicar: x?.sin_publicar ?? 0, sinFotos: x?.sin_fotos ?? 0, productosActivos: x?.activos ?? 0, conStock: x?.con_stock ?? 0, publicadosWeb: x?.publicados_web ?? 0 };
}

/** La web como canal (interruptor "Publicado en Web" de cada producto), por tienda (clave: id del canal):
 *  productos activos publicados, con el interruptor apagado (pausados o nunca publicados) y, de éstos, los que tienen stock. */
export type EstadoWeb = { publicados: number; apagados: number; apagadosConStock: number };
export async function estadoWebPorCanal(org: string, canales: number[]): Promise<Map<number, EstadoWeb>> {
  const m = new Map<number, EstadoWeb>(canales.map((c) => [c, { publicados: 0, apagados: 0, apagadosConStock: 0 }]));
  if (!canales.length) return m;
  const f = await consulta<{ canal: number; publicados: number; apagados: number; apagados_stock: number }>(`
    select c.id::int canal,
           count(*) filter (where ${sqlPublicadoEnWeb("p", "c.id")})::int publicados,
           count(*) filter (where not ${sqlPublicadoEnWeb("p", "c.id")})::int apagados,
           count(*) filter (where not ${sqlPublicadoEnWeb("p", "c.id")} and ${SQL_DISPONIBLE} > 0)::int apagados_stock
      from unnest($2::bigint[]) c(id) cross join producto p
     where p.organizacion_id = $1 and p.estado = 'activo' and not p.no_publicable group by c.id`, [org, canales]);
  for (const x of f) m.set(x.canal, { publicados: x.publicados, apagados: x.apagados, apagadosConStock: x.apagados_stock });
  return m;
}

/** Por cada cuenta de ML (clave: id del canal): productos activos con stock que no tienen publicación activa en ESA cuenta. */
export async function sinPublicarPorCanal(org: string, canales: number[]): Promise<Map<number, number>> {
  const m = new Map<number, number>(canales.map((c) => [c, 0]));
  if (!canales.length) return m;
  const f = await consulta<{ canal: number; n: number }>(`
    with con_stock as (select p.id from producto p where p.organizacion_id = $1 and p.estado = 'activo' and not p.no_publicable and ${SQL_DISPONIBLE} > 0)
    select c.id::int canal, count(*)::int n
      from unnest($2::bigint[]) c(id) cross join con_stock s
     where not exists (select 1 from publicacion pu join variacion v on v.id = pu.variacion_id
                        where v.producto_id = s.id and pu.estado = 'activa' and pu.canal_id = c.id)
     group by c.id`, [org, canales]);
  for (const x of f) m.set(x.canal, x.n);
  return m;
}

export const sumar = (ms: Metricas[]): Metricas => {
  const t = vacio();
  for (const m of ms) {
    for (const k of Object.keys(t.publicaciones) as (keyof Metricas["publicaciones"])[]) t.publicaciones[k] += m.publicaciones[k];
    for (const k of Object.keys(t.etiquetas) as (keyof Metricas["etiquetas"])[]) t.etiquetas[k] += m.etiquetas[k];
    t.pedidosParaPreparar += m.pedidosParaPreparar; t.enCamino += m.enCamino;
    t.reservados += m.reservados; t.reservadosVencen += m.reservadosVencen;
    t.enPreparacion += m.enPreparacion; t.pedidosSinDespachar += m.pedidosSinDespachar;
    t.paraDespachar += m.paraDespachar; t.despacharVencidos += m.despacharVencidos;
    if (m.despacharAntes && (!t.despacharAntes || m.despacharAntes < t.despacharAntes)) t.despacharAntes = m.despacharAntes;
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

/** Los canales que no son de Mercado Libre, en tres grupos: la tienda web minorista, la web mayorista (aunque todavía no exista) y el resto (local, pedidos manuales, histórico, otros…). */
export async function gruposNoMl(org: string) {
  const f = await consulta<{ id: number; tipo: string }>("select id::int, tipo from canal where organizacion_id = $1 and tipo <> 'mercadolibre' order by id", [org]);
  return {
    minorista: f.filter((x) => x.tipo === "web_minorista").map((x) => x.id),
    mayorista: f.filter((x) => x.tipo === "web_mayorista").map((x) => x.id),
    otros: f.filter((x) => x.tipo !== "web_minorista" && x.tipo !== "web_mayorista").map((x) => x.id),
  };
}
