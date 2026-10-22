// Agrupado automático de los planes de cuotas, en tandas (Fer, 22/10: «lo armamos con un solo click de mi parte y
// los mandás de a tandas a Meli»). El clic de Fer (Configuración › Cola de Mercado Libre, pestaña Lotes preparados,
// «Agrupar todo en tandas») autoriza todas las cuentas de ML conectadas (tabla ml_agrupado_auto). Desde ahí, el
// proceso de fondo (/api/erp/tareas) hace por cuenta, de a una tanda por vez:
//   1. si hay planes viejos sin ventas cuyo plan ya está en el producto agrupado: los elimina (prepararCierreAgrupados);
//   2. si no, hasta TANDA altas agrupadas (prepararAgrupar);
//   3. si no queda ninguna de las dos cosas, la cuenta terminó.
// Cada tanda es un lote que sale enseguida (queda en la lista de lotes, ya mandado). La próxima arranca recién
// cuando la cola de esa cuenta no tiene nada de un lote por salir y pasaron PAUSA_MIN minutos. Lo que ML rechaza al
// validar queda anotado (rechazadas) y no se vuelve a probar. «Frenar» lo para en todas las cuentas.

import { consulta, una, motivoErp } from "@/lib/erp/base";
import { prepararAgrupar, prepararCierreAgrupados } from "@/lib/mercadolibre/agrupar";
import { mandarLote } from "@/lib/mercadolibre/cola";

export const TANDA = 25;
const PAUSA_MIN = 10;

export type FilaAgrupado = { canal_id: number; canal: string; estado: string; autorizado_ts: Date; tandas: number; altas: number; cierres: number;
  rechazadas: Record<string, string>; ultimo_error: string | null; terminado_ts: Date | null; lote_id: number | null; en_cola: number };

/** El clic de Fer: todas las cuentas de ML conectadas quedan andando (las terminadas vuelven a revisar). */
export async function autorizarAgrupado(org: string, usuario: string | null): Promise<number> {
  const r = await consulta(`
    insert into ml_agrupado_auto (organizacion_id, canal_id, autorizado_por)
    select $1, c.id, $2 from canal c join meli_cuenta mc on mc.canal_id = c.id and mc.estado = 'activa'
     where c.organizacion_id = $1 and c.tipo = 'mercadolibre' and c.estado = 'activo'
    on conflict (organizacion_id, canal_id) do update set estado = 'andando', autorizado_por = excluded.autorizado_por,
      autorizado_ts = now(), proxima_ts = now(), ultimo_error = null, terminado_ts = null
    returning canal_id`, [org, usuario]);
  return r.length;
}

export async function frenarAgrupado(org: string): Promise<number> {
  return (await consulta("update ml_agrupado_auto set estado = 'frenado' where organizacion_id = $1 and estado = 'andando' returning canal_id", [org])).length;
}

export async function estadoAgrupado(org: string): Promise<FilaAgrupado[]> {
  return consulta<FilaAgrupado>(`
    select a.canal_id::int, c.nombre canal, a.estado, a.autorizado_ts, a.tandas, a.altas, a.cierres, a.rechazadas, a.ultimo_error, a.terminado_ts, a.lote_id::int,
           (select count(*) from ml_cola q where q.lote_id = a.lote_id and q.estado in ('pendiente', 'enviando'))::int en_cola
      from ml_agrupado_auto a join canal c on c.id = a.canal_id
     where a.organizacion_id = $1 order by c.nombre`, [org]);
}

// La misma condición que el cron de pg_cron (db/mercadolibre.sql): andando, en hora y sin lotes de la cuenta por salir.
const LISTA = `a.estado = 'andando' and a.proxima_ts <= now()
  and not exists (select 1 from ml_cola q where q.canal_id = a.canal_id and q.lote_id is not null and q.estado in ('pendiente', 'enviando'))`;

export async function hayAgrupadoPendiente(): Promise<boolean> {
  return !!(await una(`select 1 from ml_agrupado_auto a where ${LISTA} limit 1`));
}

/** Una tanda por cuenta lista, hasta `hastaMs`. */
export async function avanzarAgrupado(hastaMs: number): Promise<Record<string, unknown>> {
  const informe: Record<string, unknown> = {};
  while (Date.now() < hastaMs - 30_000) {
    // Tomarla corre su próxima vuelta 5 minutos: si se corta a mitad, otra la retoma después.
    const a = await una<{ organizacion_id: string; canal_id: number; autorizado_por: string | null; rechazadas: Record<string, string> }>(`
      update ml_agrupado_auto set proxima_ts = now() + interval '5 minutes'
       where (organizacion_id, canal_id) = (select organizacion_id, canal_id from ml_agrupado_auto a where ${LISTA}
                                             order by proxima_ts limit 1 for update skip locked)
      returning organizacion_id, canal_id::int, autorizado_por, rechazadas`);
    if (!a) break;
    const pausa = `now() + interval '${PAUSA_MIN} minutes'`;
    try {
      const cierre = await prepararCierreAgrupados(a.organizacion_id, a.canal_id, a.autorizado_por);
      if (cierre.loteId) {
        await mandarLote(a.organizacion_id, cierre.loteId, a.autorizado_por);
        await consulta(`update ml_agrupado_auto set lote_id = $3, tandas = tandas + 1, cierres = cierres + $4, ultimo_error = null, proxima_ts = ${pausa}
                         where organizacion_id = $1 and canal_id = $2`, [a.organizacion_id, a.canal_id, cierre.loteId, cierre.cerrar]);
        informe[a.canal_id] = { cierres: cierre.cerrar, lote: cierre.loteId };
        continue;
      }
      const r = await prepararAgrupar(a.organizacion_id, a.canal_id, a.autorizado_por,
        { max: TANDA, hasta: Math.min(hastaMs - 10_000, Date.now() + 90_000), saltar: new Set(Object.keys(a.rechazadas ?? {})) });
      if (r.loteId) await mandarLote(a.organizacion_id, r.loteId, a.autorizado_por);
      const termino = !r.loteId && r.quedan === 0;
      await consulta(`
        update ml_agrupado_auto set lote_id = coalesce($3, lote_id), tandas = tandas + ($3 is not null)::int, altas = altas + $4,
               rechazadas = rechazadas || $5::jsonb, ultimo_error = null,
               estado = case when $6 then 'terminado' else estado end, terminado_ts = case when $6 then now() end,
               proxima_ts = case when $3 is null then now() else ${pausa} end
         where organizacion_id = $1 and canal_id = $2`,
        [a.organizacion_id, a.canal_id, r.loteId, r.altas, JSON.stringify(r.rechazadas), termino]);
      informe[a.canal_id] = { altas: r.altas, lote: r.loteId, rechazos: r.rechazos.length, quedan: r.quedan, termino };
    } catch (e) {
      await consulta(`update ml_agrupado_auto set ultimo_error = $3, proxima_ts = now() + interval '30 minutes' where organizacion_id = $1 and canal_id = $2`,
        [a.organizacion_id, a.canal_id, motivoErp(e)]).catch(() => {});
      informe[a.canal_id] = { error: motivoErp(e) };
    }
  }
  return informe;
}
