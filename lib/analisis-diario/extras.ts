// El análisis y el asistente (Fer, 7/11, bitácora #1136): lo que se agregó al análisis de un día desde el asistente
// («Agregar al informe» debajo de cada respuesta; app/api/asistente/agregar) y el diccionario de datos que el asistente
// lee en esta pantalla para investigar con consultas (lib/asistente/pantallas.ts). Sin dependencias del asistente.

import { consulta } from "@/lib/erp/base";

export type ExtraAnalisis = { id: number; pregunta: string | null; texto: string; creado_ts: string; usuario: string | null };

export async function extrasAnalisis(org: string, fecha: string): Promise<ExtraAnalisis[]> {
  return consulta<ExtraAnalisis>(`
    select e.id::int, e.pregunta, e.texto, to_char(e.creado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') creado_ts,
           coalesce(u.nombre, u.email) usuario
      from analisis_extra e left join usuarios u on u.id = e.usuario_id
     where e.organizacion_id = $1 and e.fecha = $2::date order by e.id`, [org, fecha]).catch(() => []);
}

/** Agrega una sección al análisis de `fecha` (o al último, si no viene). */
export async function agregarExtraAnalisis(org: string, fecha: string | null, pregunta: string | null, texto: string, usuarioId: string): Promise<boolean> {
  const r = await consulta(`
    insert into analisis_extra (organizacion_id, fecha, pregunta, texto, usuario_id)
    select $1, a.fecha, $3, $4, $5 from analisis_diario a
     where a.organizacion_id = $1 and ($2::date is null or a.fecha = $2::date) order by a.fecha desc limit 1 returning id`,
    [org, fecha, pregunta?.slice(0, 2000) || null, texto.slice(0, 60_000), usuarioId]);
  return r.length > 0;
}

export async function borrarExtraAnalisis(org: string, id: number) {
  await consulta("delete from analisis_extra where organizacion_id = $1 and id = $2", [org, id]);
}

/** Qué hay en las tablas que usa el análisis: lo lee el asistente cuando se está en esta pantalla. */
export const DICCIONARIO_ANALISIS = `Datos del análisis de campañas y publicidad (tablas de Laucen; las políticas de fila ya filtran la organización, no hace falta poner organizacion_id). Montos en pesos. Fechas de un día en hora argentina: (ts at time zone 'America/Argentina/Buenos_Aires')::date.
- canal: cada canal de venta (id, nombre, tipo: 'mercadolibre' = una cuenta de ML como DAITOM, DAITOM_CBA, DEIROLAB SA, DEIROLAB SAS, TIENDAVIRTUAL…; 'web_minorista' = la tienda web).
- Publicidad de Mercado Libre (Product Ads): pub_campana (campana_id, canal_id, nombre, estado, estrategia, roas_objetivo, acos_objetivo, presupuesto_diario, presupuesto_automatico); pub_campana_dia (campana_id, fecha, clics, impresiones, costo, monto_directo, monto_indirecto, unidades_directas, unidades_indirectas: lo que ML atribuye a la publicidad, directas = compró lo del anuncio, indirectas = otra cosa del vendedor); pub_anuncio (item_id = publicación MLA…, canal_id, campana_id, estado, titulo, precio); pub_anuncio_dia (item_id, fecha, canal_id, campana_id, clics, impresiones, costo, monto_directo, monto_indirecto, unidades_directas, unidades_indirectas); pub_veredicto (clave = SKU del producto, veredicto subir/seguir/bajar/cortar, motivo).
- Google Ads y Meta: anuncio_dia (plataforma 'google' o 'meta', cuenta_id, anuncio_id, anuncio, campana_id, campana, fecha, gasto, moneda, impresiones, clics).
- Ventas: pedido (id, canal_id, fecha, estado — sin 'cancelado' ni 'devuelto' para contar ventas —, total_ars, atribucion jsonb: plataforma 'google'/'meta'/'tiktok' si llegó desde un anuncio, anuncio_id); pedido_linea (pedido_id, variacion_id, sku, titulo, cantidad, precio_unit_ars). Para ventas de un producto en una cuenta de ML: pedido_linea join pedido on pedido.id = pedido_linea.pedido_id, filtrando pedido.canal_id.
- Productos: producto (id, sku_base, familia_id), variacion (id, producto_id, sku), familia (id, nombre, padre_id; Notebooks = 3, Impresoras 3D = 201), precio (variacion_id, lista_id, lista_ars, vigente_desde: la Clásica es la lista del canal), publicacion (id, variacion_id, canal_id, id_externo = MLA…, estado, tipo_publicacion), meli_item (canal_id, item_id, estado active/paused, precio, datos_externos -> 'ml' con title, available_quantity, listing_type_id).
- Campañas y ofertas de ML: ml_promo_campana (canal_id, promocion_id, tipo DEAL/SELLER_CAMPAIGN/LIGHTNING/SMART/SMART_LIGHTNING, nombre, estado, desde, hasta); ml_promo_item (canal_id, item_id, promocion_id, tipo, estado candidate = puede entrar / pending / started = adentro, precio = lo que paga el comprador, min_precio, max_precio, precio_original, pct_meli, pct_vendedor); ml_promo_historia (canal_id, item_id, promocion_id, que: item_alta/item_baja/item_estado/item_precio/campana_alta…, antes, despues, precio_antes, precio_despues, fecha): explica por qué cambió un precio; ml_precio_comprador (canal_id, item_id, monto = lo que paga hoy el comprador).
- Visitas de la tienda web: visitante_evento (visitante, tipo visita/producto/carrito/checkout/compra/whatsapp, producto_id, pedido_id, pagina, entrada jsonb con tipo anuncio/organico/directo/mercadolibre/social/referido y plataforma, ts).
- El análisis guardado: analisis_diario (fecha, datos jsonb, resumen, urgentes) y analisis_extra (lo agregado desde el asistente).
- tipo_cambio: dólar oficial por día (fecha, tipo 'oficial', venta).
Para comparar semanas usá los 7 días cerrados (hasta ayer) contra los 7 anteriores, como el análisis.`;
