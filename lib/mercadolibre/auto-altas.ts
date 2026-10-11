// Creación automática de lo que falta en cada cuenta de Mercado Libre (Fer, 10/10).
// En las cuentas con el interruptor «Crear solo lo que falta» prendido
// (canal.config.crear_faltantes_auto; prenderlo es el clic de Fer, AGENTS.md), cada
// 10 minutos (pg_cron → /api/meli/auto-altas) se arma una vuelta corta:
//   1. los productos activos en otra cuenta que ésta no tiene, con su Clásica y sus
//      planes (prepararFaltantesEnCuenta);
//   2. los planes de cuotas que les faltan a los que ya están (prepararPlanesFaltantes).
// Con todas las pautas (pautas.ts) y arreglos conocidos (copiar.ts › comprobarAlta). Las
// altas van directo a la cola de ML (que respeta los límites de ML y reintenta), sin lote.
// Lo que ML no acepta o no se puede copiar queda en ml_alta_colgada con su motivo, y no se
// vuelve a intentar hasta su próximo turno: 30 min, 2 h, 12 h y después una vez por día.

import { consulta } from "@/lib/erp/base";
import { prepararFaltantesEnCuenta } from "@/lib/mercadolibre/publicar-todas";
import { prepararPlanesFaltantes } from "@/lib/precios-ml/faltantes";

type Falla = { sku: string; plan: string; motivo: string };

async function anotarFallas(org: string, canal: number, fallas: Falla[]): Promise<void> {
  const unicas = [...new Map(fallas.map((f) => [`${f.sku}|${f.plan}`, f])).values()];
  for (const f of unicas) {
    await consulta(`
      insert into ml_alta_colgada (organizacion_id, canal_id, sku, plan, motivo) values ($1, $2, $3, $4, $5)
      on conflict (organizacion_id, canal_id, sku, plan) do update set
        motivo = excluded.motivo, intentos = ml_alta_colgada.intentos + 1, ultimo_ts = now(),
        proximo_ts = now() + (case when ml_alta_colgada.intentos + 1 <= 1 then interval '30 minutes' when ml_alta_colgada.intentos + 1 = 2 then interval '2 hours'
                                   when ml_alta_colgada.intentos + 1 = 3 then interval '12 hours' else interval '24 hours' end)`,
      [org, canal, f.sku, f.plan, f.motivo.slice(0, 1500)]);
  }
}

/** Los SKU de la cuenta que esperan su próximo intento. */
async function enEspera(org: string, canal: number): Promise<Set<string>> {
  return new Set((await consulta<{ sku: string }>(
    "select distinct sku from ml_alta_colgada where organizacion_id = $1 and canal_id = $2 and proximo_ts > now()", [org, canal])).map((x) => x.sku));
}

export type InformeAuto = Record<string, { altas: number; colgadas: number; sinTiempo: number }>;

/** Una vuelta: reparte el tiempo entre las cuentas prendidas (arranca por una distinta cada vez). */
export async function correrAutoAltas(hasta: number): Promise<InformeAuto> {
  const canales = await consulta<{ id: number; organizacion_id: string; nombre: string }>(`
    select id::int, organizacion_id, nombre from canal
     where tipo = 'mercadolibre' and estado = 'activo' and coalesce((config ->> 'crear_faltantes_auto')::boolean, false)
     order by id`);
  const informe: InformeAuto = {};
  if (!canales.length) return informe;
  const giro = Math.floor(Date.now() / 600_000) % canales.length;
  const orden = [...canales.slice(giro), ...canales.slice(0, giro)];
  for (let i = 0; i < orden.length; i++) {
    const c = orden[i];
    const resto = hasta - Date.now();
    if (resto < 20_000) break;
    const tope = Date.now() + resto / (orden.length - i);
    const r = { altas: 0, colgadas: 0, sinTiempo: 0 };
    try {
      const saltear = await enEspera(c.organizacion_id, c.id);
      // 1. Productos que la cuenta no tiene: la mitad del tiempo.
      const mitad = Date.now() + (tope - Date.now()) / 2;
      const a = await prepararFaltantesEnCuenta(c.organizacion_id, c.id, null, mitad, null, { directo: true, saltear });
      const fallasA: Falla[] = [...(a.fallas ?? []), ...a.sinOrigen.map((sku) => ({ sku, plan: "*", motivo: "No tiene ninguna publicación común activa (sin variaciones) para copiar." }))];
      await anotarFallas(c.organizacion_id, c.id, fallasA);
      r.altas += a.encoladas ?? 0;
      r.sinTiempo += a.sinTiempo;
      r.colgadas += fallasA.length;
      // 2. Planes que les faltan a los que ya están.
      for (const f of fallasA) saltear.add(f.sku);
      const b = await prepararPlanesFaltantes(c.organizacion_id, c.id, { familia: null, q: "", comienza: true }, null, tope, null, { directo: true, saltear });
      const fallasB: Falla[] = [...(b.fallas ?? []), ...b.sinOrigen.map((sku) => ({ sku, plan: "*", motivo: "No tiene ninguna publicación común activa (sin variaciones) para copiar." }))];
      await anotarFallas(c.organizacion_id, c.id, fallasB);
      r.altas += b.altas;
      r.sinTiempo += b.sinTiempo;
      r.colgadas += fallasB.length;
      // Lo que ya se creó deja de estar colgado.
      await consulta(`
        delete from ml_alta_colgada g where g.organizacion_id = $1 and g.canal_id = $2
           and exists (select 1 from ml_cola q where q.canal_id = g.canal_id and q.tipo = 'crear' and q.estado = 'ok' and q.enviado_ts > g.ultimo_ts
                          and q.item_id like 'esquema:' || g.sku || ':%' and (g.plan = '*' or q.item_id = 'esquema:' || g.sku || ':' || g.plan))`, [c.organizacion_id, c.id]);
    } catch (e) {
      console.error("[auto-altas]", c.nombre, e instanceof Error ? e.message : e);
    }
    await consulta(`update canal set config = config || jsonb_build_object('auto_altas', jsonb_build_object('ultima_vuelta', now(), 'altas', $2::int,
                      'total', coalesce((config -> 'auto_altas' ->> 'total')::int, 0) + $2::int)) where id = $1`, [c.id, r.altas]);
    informe[c.nombre] = r;
  }
  return informe;
}
