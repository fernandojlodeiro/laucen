// Pasar todas las cuentas al esquema nuevo (Fer, 12/10). Las publicaciones que la creación automática hizo
// desde el 10/10 en las cuentas que todavía tenían el esquema viejo salieron sin tachado, y Mercado Libre no
// deja ponerles después un descuento grande (sólo hasta ~5 % debajo del precio que vienen teniendo). Con un
// solo clic de Fer («Arrancar», en Precios en ML › Descuento) en cada cuenta que no es la de origen:
//   1. se copia el esquema de la cuenta de origen (copiarEsquema), conservando las excepciones por producto de la
//      cuenta (las notebooks ya estaban bien en ML: no se tocan), y se prende «Sincronizar precios»;
//   2. se cierran en Mercado Libre las publicaciones creadas solas desde el 10/10 hasta ese momento, sin ventas y
//      sin excepción propia de producto;
//   3. la creación automática (auto-altas.ts) las vuelve a crear con el esquema nuevo: nacen con el tachado y la
//      sincronización las mete en campaña, así el comprador paga lo mismo (la Clásica).
// Lo corre la vuelta de la creación automática (cada 10 minutos). Todo lo que va a ML pasa por la cola.

import { consulta } from "@/lib/erp/base";
import { encolar, type CambioMl } from "@/lib/mercadolibre/cola";
import { copiarEsquema } from "@/lib/precios-ml/datos";

/** Desde cuándo se rehacen las altas automáticas (la primera noche de la creación automática). */
export const DESDE_REHACER = "2026-10-10T18:00:00Z";

type Estado = { origen: number; arrancado: string; copiado?: string; cierre?: string; cerradas?: number; terminado?: string };

/** Prende el proceso en todas las cuentas de ML de la organización salvo la de origen. */
export async function arrancarRehacer(org: string, origen: number): Promise<number> {
  const r = await consulta<{ id: number }>(`
    update canal set config = config || jsonb_build_object('rehacer_esquema', jsonb_build_object('origen', $2::int, 'arrancado', now()))
     where organizacion_id = $1 and tipo = 'mercadolibre' and estado = 'activo' and id <> $2 and not (config ? 'rehacer_esquema') returning id::int`, [org, origen]);
  // La de origen ya tiene el esquema: sólo vuelve a sincronizar sola.
  await consulta(`update canal set config = config || '{"sincronizar_precios": true}'::jsonb where id = $1 and organizacion_id = $2`, [origen, org]);
  return r.length;
}

export type EstadoRehacer = { canal: number; nombre: string; estado: Estado | null; abiertas: number; enCola: number };

/** Para la pantalla: en qué quedó cada cuenta. */
export async function estadoRehacer(org: string): Promise<EstadoRehacer[]> {
  return consulta<EstadoRehacer>(`
    select c.id::int canal, c.nombre, c.config -> 'rehacer_esquema' estado,
           (select count(*)::int from ml_cola q join meli_item m on m.canal_id = q.canal_id and m.item_id = q.respuesta ->> 'id'
             where q.canal_id = c.id and q.origen = 'automatico' and q.tipo = 'crear' and q.estado = 'ok'
               and q.creado_ts >= $2::timestamptz and q.creado_ts < coalesce((c.config -> 'rehacer_esquema' ->> 'copiado')::timestamptz, now())
               and m.estado in ('active', 'paused') and coalesce(m.vendidos, 0) = 0) abiertas,
           (select count(*)::int from ml_cola q where q.canal_id = c.id and q.item_id like 'rehacer:%' and q.estado in ('pendiente', 'enviando')) "enCola"
      from canal c where c.organizacion_id = $1 and c.tipo = 'mercadolibre' and c.estado = 'activo' and c.config ? 'rehacer_esquema'
     order by c.nombre`, [org, DESDE_REHACER]);
}

/** Una vuelta: avanza cada cuenta un paso. */
export async function correrRehacer(): Promise<Record<string, string>> {
  const informe: Record<string, string> = {};
  const canales = await consulta<{ id: number; organizacion_id: string; nombre: string; estado: Estado }>(`
    select id::int, organizacion_id, nombre, config -> 'rehacer_esquema' estado from canal
     where tipo = 'mercadolibre' and estado = 'activo' and config ? 'rehacer_esquema' and not (config -> 'rehacer_esquema' ? 'terminado')`);
  for (const c of canales) {
    const fijar = (x: Partial<Estado>) => consulta(
      "update canal set config = jsonb_set(config, '{rehacer_esquema}', (config -> 'rehacer_esquema') || $2::jsonb) where id = $1", [c.id, JSON.stringify(x)]);
    try {
      // 1. El esquema y la sincronización. Desde acá, lo que se crea en la cuenta ya sale con el esquema nuevo.
      if (!c.estado.copiado) {
        await copiarEsquema(c.organizacion_id, c.estado.origen, c.id, { conservarProductos: true });
        await consulta(`update canal set config = (config - 'pausa_altas') || '{"sincronizar_precios": true}'::jsonb where id = $1`, [c.id]);
        await fijar({ copiado: new Date().toISOString() });
        informe[c.nombre] = "esquema copiado";
        continue;
      }
      const hasta = c.estado.copiado;
      // Lo ya cerrado en ML queda cerrado en Laucen (así la creación automática lo ve como faltante).
      await consulta(`
        update meli_item m set estado = 'closed' from ml_cola q
         where q.canal_id = $1 and q.item_id = 'rehacer:' || m.item_id and q.estado = 'ok' and m.canal_id = q.canal_id and m.estado <> 'closed'`, [c.id]);
      // 2. Cerrar las publicaciones creadas solas antes del esquema nuevo, sin ventas (una sola vez cada una).
      const abiertas = await consulta<{ item_id: string; sku: string | null }>(`
        select distinct m.item_id, m.sku from ml_cola q
          join meli_item m on m.canal_id = q.canal_id and m.item_id = any(array[q.respuesta ->> 'id'] || coalesce(array(select jsonb_array_elements_text(q.respuesta -> 'otras')), '{}'))
         where q.canal_id = $1 and q.origen = 'automatico' and q.tipo = 'crear' and q.estado = 'ok'
           and q.creado_ts >= $2::timestamptz and q.creado_ts < $3::timestamptz
           and m.estado in ('active', 'paused') and coalesce(m.vendidos, 0) = 0
           -- Los productos con excepción propia en la cuenta (las notebooks) ya nacieron con su tachado: no se tocan.
           and not exists (select 1 from publicacion pu join variacion v on v.id = pu.variacion_id
                             join ml_regla_precio r on r.canal_id = q.canal_id and r.nivel = 'producto' and r.producto_id = v.producto_id
                            where pu.id = m.publicacion_id)
           and not exists (select 1 from ml_cola e where e.canal_id = q.canal_id and e.item_id = 'rehacer:' || m.item_id and e.estado in ('pendiente', 'enviando', 'ok'))`,
        [c.id, DESDE_REHACER, hasta]);
      if (abiertas.length) {
        const cambios: CambioMl[] = abiertas.map((a) => ({
          canalId: c.id, itemId: `rehacer:${a.item_id}`, tipo: "estado", antes: { estado: "active" },
          payload: { descripcion: `Cerrar ${a.item_id} (${a.sku ?? "sin SKU"}): creada sin el esquema nuevo; se vuelve a crear con él`,
            pedidos: [{ metodo: "PUT", ruta: `/items/${a.item_id}`, cuerpo: { status: "closed" } }] },
        }));
        await encolar(c.organizacion_id, cambios, { origen: "automatico" });
        await fijar({ cierre: c.estado.cierre ?? new Date().toISOString(), cerradas: (c.estado.cerradas ?? 0) + abiertas.length });
        informe[c.nombre] = `${abiertas.length} a cerrar`;
        continue;
      }
      // 3. Terminado cuando no queda nada por cerrar ni en la cola.
      const pendientes = await consulta<{ n: number }>(
        "select count(*)::int n from ml_cola where canal_id = $1 and item_id like 'rehacer:%' and estado in ('pendiente', 'enviando')", [c.id]);
      if (!pendientes[0]?.n) { await fijar({ terminado: new Date().toISOString() }); informe[c.nombre] = "terminado"; }
      else informe[c.nombre] = `${pendientes[0].n} cerrándose`;
    } catch (e) {
      console.error("[rehacer]", c.nombre, e instanceof Error ? e.message : e);
      informe[c.nombre] = `error: ${e instanceof Error ? e.message : e}`;
    }
  }
  return informe;
}
