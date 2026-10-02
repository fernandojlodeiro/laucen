// Stock único entre todas las cuentas de ML (orden de la sesión 2): cada
// publicación vinculada de un canal de ML informa el disponible del canal
// (suma de sus depósitos) y se PAUSA cuando llega al umbral de pausa
// (publicación → producto → canal → organización → 1). Si la pausó Laucen
// por stock, la reactiva cuando vuelve a haber.
//
// Prendido por canal: canal.config.sincronizar_stock = true (Configuración →
// Canales). Apagado no toca nada en ML — así se puede conectar una cuenta y
// cargar el stock tranquilo antes de que Laucen empiece a mandar.
// Las publicaciones de Full no se tocan (el stock lo maneja ML).

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";

type Pub = {
  id: number; canal_id: number; variacion_id: number; id_externo: string; variacion_externa: string | null; estado: string;
  pausada_por_stock: boolean; cantidad_publicada: number | null; disponible: number; umbral: number;
};

export type ResultadoStock = { revisadas: number; cantidades: number; pausadas: number; reactivadas: number; errores: string[] };

/** Ajusta en ML las publicaciones que cambiaron. Sin `variaciones`, revisa
 *  todas las de los canales con la sincronización prendida. Para un kit,
 *  pasar también las variaciones de sus componentes no hace falta: se
 *  revisan por la publicación del kit. */
export async function sincronizarStockMl(org: string, variaciones?: number[], hastaMs = Date.now() + 60_000): Promise<ResultadoStock> {
  const res: ResultadoStock = { revisadas: 0, cantidades: 0, pausadas: 0, reactivadas: 0, errores: [] };
  // Si cambió un componente, también los kits que lo usan.
  let vars = variaciones;
  if (vars?.length) {
    const kits = await consulta<{ id: number }>("select distinct variacion_kit_id::int id from kit_componente where variacion_componente_id = any($1::bigint[])", [vars]);
    vars = [...new Set([...vars, ...kits.map((k) => k.id)])];
  }
  const pubs = await consulta<Pub>(`
    select p.id::int, p.canal_id::int, p.variacion_id::int, p.id_externo, p.variacion_externa, p.estado, p.pausada_por_stock,
           p.cantidad_publicada, stock_disponible_canal(p.organizacion_id, p.variacion_id, p.canal_id) disponible,
           umbral_pausa_de(p.organizacion_id, p.variacion_id, p.canal_id) umbral
      from publicacion p join canal c on c.id = p.canal_id
     where p.organizacion_id = $1 and c.tipo = 'mercadolibre' and c.estado = 'activo'
       and coalesce((c.config ->> 'sincronizar_stock')::boolean, false)
       and p.id_externo is not null and p.estado <> 'cerrada'
       and coalesce(p.datos_externos ->> 'logistica', '') <> 'fulfillment'
       and ($2::bigint[] is null or p.variacion_id = any($2::bigint[]))
     order by p.canal_id, p.id`, [org, vars?.length ? vars : null]);
  const cuentas = new Map<number, CuentaMl | null>();
  for (const p of pubs) {
    if (Date.now() > hastaMs) break;
    res.revisadas++;
    if (!cuentas.has(p.canal_id)) cuentas.set(p.canal_id, await cuentaDelCanal(org, p.canal_id));
    const cuenta = cuentas.get(p.canal_id);
    if (!cuenta || cuenta.estado !== "activa") continue;
    const disp = Math.max(0, p.disponible);
    try {
      if (disp <= p.umbral) {
        if (p.estado === "activa") {
          // Una variación no se pausa sola en ML (se pausa el item entero):
          // se le informa 0 y ML la deja de ofrecer.
          await cambiar(cuenta, p, p.variacion_externa ? { available_quantity: 0 } : { status: "paused" });
          await consulta("update publicacion set estado = 'pausada', pausada_por_stock = true, ultima_sincronizacion_ts = now() where id = $1", [p.id]);
          res.pausadas++;
        }
      } else if (p.pausada_por_stock) {
        await cambiar(cuenta, p, { available_quantity: disp });
        if (!p.variacion_externa) await cambiar(cuenta, p, { status: "active" });
        await consulta("update publicacion set estado = 'activa', pausada_por_stock = false, cantidad_publicada = $2, ultima_sincronizacion_ts = now() where id = $1", [p.id, disp]);
        res.reactivadas++;
      } else if (p.estado === "activa" && p.cantidad_publicada !== disp) {
        await cambiar(cuenta, p, { available_quantity: disp });
        await consulta("update publicacion set cantidad_publicada = $2, ultima_sincronizacion_ts = now() where id = $1", [p.id, disp]);
        res.cantidades++;
      }
    } catch (e) {
      res.errores.push(`${p.id_externo}${p.variacion_externa ? `/${p.variacion_externa}` : ""}: ${(e as Error).message}`);
    }
  }
  return res;
}

/** Cambia cantidad o estado de una publicación (o de una de sus variaciones). */
async function cambiar(cuenta: CuentaMl, p: Pub, que: { available_quantity?: number; status?: "paused" | "active" }) {
  const cuerpo = que.available_quantity !== undefined && p.variacion_externa
    ? { variations: [{ id: Number(p.variacion_externa), available_quantity: que.available_quantity }] }
    : que;
  const r = await ml(cuenta, "PUT", `/items/${p.id_externo}`, cuerpo);
  if (r.status < 200 || r.status >= 300) {
    const d = r.datos as { message?: string; cause?: { message?: string }[] };
    throw new Error(`ML contestó ${r.status}${d?.message ? ` (${[d.message, ...(d.cause ?? []).map((c) => c.message)].filter(Boolean).join(" · ")})` : ""}`);
  }
}

/** Las variaciones con eventos de stock sin procesar (los emite mover_stock
 *  al cruzar el umbral): se marcan como procesados por 'meli'. */
export async function variacionesConEventos(org: string): Promise<number[]> {
  const r = await consulta<{ variacion_id: number }>(`
    with ev as (
      update evento set procesado_ts = now(), procesado_por = 'meli'
       where organizacion_id = $1 and tipo = 'stock_bajo_umbral' and procesado_ts is null
         and (payload ->> 'canal_id')::bigint in (select id from canal where organizacion_id = $1 and tipo = 'mercadolibre')
      returning (payload ->> 'variacion_id')::int variacion_id)
    select distinct variacion_id from ev`, [org]);
  return r.map((x) => x.variacion_id);
}

/** ¿La organización tiene algún canal de ML sincronizando stock? */
export async function haySincronizacion(org: string): Promise<boolean> {
  return !!(await una("select 1 from canal where organizacion_id = $1 and tipo = 'mercadolibre' and coalesce((config ->> 'sincronizar_stock')::boolean, false) limit 1", [org]));
}
