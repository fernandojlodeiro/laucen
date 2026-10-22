// Lotes que pide preparar una sesión (db/mercadolibre.sql, ml_preparacion; Fer, 22/10: «armá el lote directamente
// para que yo vaya y lo dispare», sin botones en Configuración › Canales). El proceso de fondo (/api/erp/tareas)
// arma el lote con la llave de la cuenta y anota el resultado (el número de lote). Sólo PREPARA: el lote sale recién
// con el clic de Fer en Configuración › Cola de Mercado Libre.

import { consulta, una, motivoErp } from "@/lib/erp/base";
import { prepararAgrupar, prepararCierreAgrupados } from "@/lib/mercadolibre/agrupar";
import { prepararRevisionTitulos } from "@/lib/mercadolibre/titulos-ia";

export async function hayPreparacionesPendientes(): Promise<boolean> {
  return !!(await una("select 1 from ml_preparacion where estado = 'pendiente' or (estado = 'trabajando' and tomada_ts < now() - interval '5 minutes') limit 1"));
}

/** Arma los lotes pedidos, de a uno, hasta `hastaMs`. */
export async function prepararPendientes(hastaMs: number): Promise<{ hechas: number; errores: number }> {
  const res = { hechas: 0, errores: 0 };
  while (Date.now() < hastaMs - 20_000) {
    // Una por vez; la que quedó «trabajando» más de 5 minutos (se cortó) se vuelve a tomar.
    const p = await una<{ id: number; organizacion_id: string; canal_id: number; tipo: string; max: number | null; pedido_por: string | null }>(`
      update ml_preparacion set estado = 'trabajando', tomada_ts = now()
       where id = (select id from ml_preparacion
                    where estado = 'pendiente' or (estado = 'trabajando' and tomada_ts < now() - interval '5 minutes')
                    order by id limit 1 for update skip locked)
      returning id::int, organizacion_id, canal_id::int, tipo, max, pedido_por`);
    if (!p) break;
    try {
      const hasta = Math.min(hastaMs - 5_000, Date.now() + 200_000);
      const r = p.tipo === "agrupar" ? await prepararAgrupar(p.organizacion_id, p.canal_id, null, { max: p.max ?? 20, hasta })
        : p.tipo === "cierre_agrupados" ? await prepararCierreAgrupados(p.organizacion_id, p.canal_id, null)
        : await prepararRevisionTitulos(p.organizacion_id, p.canal_id, null, { max: p.max ?? 50, hasta });
      await consulta("update ml_preparacion set estado = 'hecha', resultado = $2::jsonb, hecha_ts = now() where id = $1", [p.id, JSON.stringify(r)]);
      res.hechas++;
    } catch (e) {
      await consulta("update ml_preparacion set estado = 'error', resultado = $2::jsonb, hecha_ts = now() where id = $1",
        [p.id, JSON.stringify({ error: motivoErp(e) })]).catch(() => {});
      res.errores++;
    }
  }
  return res;
}
