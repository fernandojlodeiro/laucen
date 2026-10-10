// Envío gratis debajo del umbral (Fer, 10/10): una vez por día se revisa que
// ninguna publicación activa de Mercado Libre con un precio menor al del envío
// gratis (el que releva Costos ML, ml_costos_envio_gratis_vigente; nunca un
// número fijo) tenga el envío gratis puesto. Si lo tiene:
//   · con el interruptor «Sacar envío gratis debajo del umbral» prendido en la
//     cuenta (canal.config.sacar_envio_gratis; prenderlo es el clic de Fer),
//     se lo saca solo, por la cola;
//   · si no, queda en Precios en ML › Alertas con un botón que prepara el lote.
// Lo sacado queda en la cola (payload.motivo = 'envio_gratis') y se lista en
// las alertas de los últimos 7 días.

import { consulta } from "@/lib/erp/base";
import { encolar, encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { barreraPlanes } from "@/lib/precios-ml/grupos";

export type ConEnvioGratis = {
  canalId: number; cuenta: string; itemId: string; publicacionId: number | null; productoId: number | null; sku: string | null; titulo: string | null;
  precio: number;
};

/** Las publicaciones activas con envío gratis y un precio (lo que paga el comprador) menor al umbral. */
export async function conEnvioGratisDeMas(org: string, canal?: number | null): Promise<{ umbral: number; filas: ConEnvioGratis[] }> {
  const umbral = await barreraPlanes();
  const filas = await consulta<ConEnvioGratis>(`
    select mi.canal_id::int "canalId", c.nombre cuenta, mi.item_id "itemId", pu.id::int "publicacionId", v.producto_id::int "productoId", v.sku,
           coalesce(pu.titulo, mi.titulo) titulo, coalesce(pc.monto, mi.precio)::float8 precio
      from meli_item mi
      join canal c on c.id = mi.canal_id and c.organizacion_id = $1 and c.tipo = 'mercadolibre' and c.estado <> 'archivado'
      left join publicacion pu on pu.id = mi.publicacion_id
      left join variacion v on v.id = pu.variacion_id
      left join ml_precio_comprador pc on pc.canal_id = mi.canal_id and pc.item_id = mi.item_id and pc.monto is not null
     where mi.estado = 'active' and ($3::bigint is null or mi.canal_id = $3)
       and coalesce((mi.datos_externos -> 'ml' -> 'shipping' ->> 'free_shipping')::boolean, false)
       and coalesce(pc.monto, mi.precio) < $2
       -- Lo que ya va en camino (o espera el clic) no se repite.
       and not exists (select 1 from ml_cola q where q.canal_id = mi.canal_id and q.item_id = mi.item_id and q.payload ->> 'motivo' = 'envio_gratis'
                          and q.estado in ('preparado', 'pendiente', 'enviando'))
     order by c.nombre, v.sku`, [org, umbral, canal ?? null]);
  // Una publicación con variaciones trae una fila por variación: va una vez.
  const vistas = new Set<string>();
  return { umbral, filas: filas.filter((f) => { const k = `${f.canalId}|${f.itemId}`; if (vistas.has(k)) return false; vistas.add(k); return true; }) };
}

const cambio = (f: ConEnvioGratis, umbral: number): CambioMl => ({
  canalId: f.canalId, itemId: f.itemId, publicacionId: f.publicacionId, tipo: "otro",
  payload: {
    motivo: "envio_gratis",
    pedidos: [{ metodo: "PUT", ruta: `/items/${f.itemId}`, cuerpo: { shipping: { free_shipping: false } } }],
    descripcion: `Sin envío gratis: el comprador paga $ ${Math.round(f.precio).toLocaleString("es-AR")}, menos que el envío gratis ($ ${Math.round(umbral).toLocaleString("es-AR")})`,
  },
  antes: { envio_gratis: true, precio: f.precio },
});

/** El botón de las alertas: un lote con las de esta cuenta (o una sola publicación) para el clic de «Mandar». */
export async function prepararSacarEnvioGratis(org: string, canal: number, usuario: string | null, item?: string | null): Promise<{ loteId: number | null; n: number }> {
  const { umbral, filas } = await conEnvioGratisDeMas(org, canal);
  const elegidas = item ? filas.filter((f) => f.itemId === item) : filas;
  if (!elegidas.length) return { loteId: null, n: 0 };
  const loteId = await encolarLoteConBoton(org, canal, elegidas.map((f) => cambio(f, umbral)),
    `Sacar envío gratis debajo de $ ${Math.round(umbral).toLocaleString("es-AR")} · ${elegidas[0].cuenta} · ${elegidas.length} publicaci${elegidas.length === 1 ? "ón" : "ones"}`, usuario);
  return { loteId, n: elegidas.length };
}

/** La revisión diaria (desde el barrido): en las cuentas con el interruptor prendido, lo saca solo. */
export async function revisarEnvioGratis(): Promise<Record<string, { revisadas: number; encoladas: number }>> {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const canales = await consulta<{ id: number; organizacion_id: string; prendido: boolean }>(`
    select id::int, organizacion_id, coalesce((config ->> 'sacar_envio_gratis')::boolean, false) prendido from canal
     where tipo = 'mercadolibre' and estado = 'activo' and coalesce(config ->> 'envio_gratis_revisado', '') <> $1`, [hoy]);
  const informe: Record<string, { revisadas: number; encoladas: number }> = {};
  for (const c of canales) {
    const { umbral, filas } = await conEnvioGratisDeMas(c.organizacion_id, c.id);
    if (c.prendido && filas.length) await encolar(c.organizacion_id, filas.map((f) => cambio(f, umbral)), { origen: "automatico" });
    await consulta("update canal set config = config || jsonb_build_object('envio_gratis_revisado', $2::text) where id = $1", [c.id, hoy]);
    informe[c.id] = { revisadas: filas.length, encoladas: c.prendido ? filas.length : 0 };
  }
  return informe;
}

/** Lo sacado (o intentado) en los últimos 7 días, para las alertas. */
export async function envioGratisSacado(org: string, canal: number): Promise<{ itemId: string; estado: string; error: string | null; ts: string; descripcion: string | null; origen: string }[]> {
  return consulta(`
    select item_id "itemId", estado, ultimo_error error, coalesce(enviado_ts, creado_ts)::text ts, payload ->> 'descripcion' descripcion, origen
      from ml_cola where organizacion_id = $1 and canal_id = $2 and payload ->> 'motivo' = 'envio_gratis' and creado_ts > now() - interval '7 days'
     order by id desc limit 200`, [org, canal]);
}
