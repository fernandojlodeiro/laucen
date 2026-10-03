// La barrida nocturna de Mercado Libre: una vez por noche (de 2 a 5, hora
// argentina), por cada canal de ML con la sincronización de stock prendida,
// de a una cuenta por vez:
//   1. lee de ML la lista de todas sus publicaciones (search_type=scan);
//   2. las trae de a 20 (/items?ids=) y refresca el espejo (meli_item y
//      publicacion) con lo que ML dice de verdad;
//   3. compara con lo que Laucen dice que debería ser (stock disponible del
//      canal, umbral, estado) y ENCOLA las diferencias con origen 'barrida'
//      (las pausas primero, por prioridad).
// Se retoma entre corridas del cron: el avance queda en ml_barrida (una fila
// por canal y noche), que es también el resumen que se ve en pantalla.
// Sólo LEE de ML; lo que haya que cambiar sale por la cola.

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl, type RespuestaMl } from "@/lib/mercadolibre/api";
import { guardarItem, type ItemMl } from "@/lib/mercadolibre/publicaciones";
import { sincronizarStockMl } from "@/lib/mercadolibre/stock";

const ZONA = "America/Argentina/Buenos_Aires";
/** Entre lecturas a ML de una misma cuenta. */
export const RITMO_LECTURA_MS = 150;

/** ¿Estamos en la ventana de la barrida (2:00 a 4:59, hora argentina)? */
export function enVentanaBarrida(ahora = new Date()): boolean {
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", hourCycle: "h23" }).format(ahora));
  return hora >= 2 && hora < 5;
}

/** La noche (fecha argentina) a la que pertenece la barrida. */
export function nocheDe(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora); // YYYY-MM-DD
}

export type Leer = (cuenta: CuentaMl, ruta: string) => Promise<RespuestaMl>;

type Barrida = { id: string; fase: string; scroll_id: string | null; ids: string[]; posicion: number; revisadas: number; errores: number; detalle: string[] };

/** Avanza la barrida de esta noche hasta `hastaMs`. Una cuenta por vez: toma
 *  el primer canal que no terminó y que nadie esté barriendo. Con `forzar`
 *  corre fuera de la ventana (para probar a mano o en los tests). */
export async function barridaNocturna(hastaMs: number, opts: { forzar?: boolean; leer?: Leer; org?: string; ahora?: Date } = {}) {
  const ahora = opts.ahora ?? new Date();
  if (!opts.forzar && !enVentanaBarrida(ahora)) return { fuera_de_horario: true };
  const leer: Leer = opts.leer ?? ((c, r) => ml(c, "GET", r));
  const noche = nocheDe(ahora);
  const canales = await consulta<{ id: number; organizacion_id: string; nombre: string }>(`
    select c.id::int, c.organizacion_id, c.nombre from canal c join meli_cuenta mc on mc.canal_id = c.id and mc.estado = 'activa'
     where c.tipo = 'mercadolibre' and c.estado = 'activo' and coalesce((c.config ->> 'sincronizar_stock')::boolean, false)
       and ($1::text is null or c.organizacion_id = $1)
     order by c.id`, [opts.org ?? null]);
  const informe: Record<string, unknown> = {};
  for (const c of canales) {
    if (Date.now() > hastaMs - 5_000) break;
    await consulta("insert into ml_barrida (organizacion_id, canal_id, noche) values ($1, $2, $3) on conflict (canal_id, noche) do nothing",
      [c.organizacion_id, c.id, noche]);
    // El turno: si otra corrida la está barriendo, se espera a la próxima.
    const b = await una<Barrida>(`
      update ml_barrida set ocupado_hasta = to_timestamp($3 / 1000.0) + interval '30 seconds'
       where canal_id = $1 and noche = $2 and fase not in ('terminada', 'error') and ocupado_hasta < now()
      returning id, fase, scroll_id, ids, posicion, revisadas, errores, detalle`, [c.id, noche, hastaMs]);
    if (!b) {
      const hecha = await una("select 1 from ml_barrida where canal_id = $1 and noche = $2 and fase in ('terminada', 'error')", [c.id, noche]);
      if (hecha) continue; // ya está: la próxima cuenta
      break; // la está barriendo otra corrida: una cuenta por vez
    }
    const cuenta = await cuentaDelCanal(c.organizacion_id, c.id);
    try {
      informe[c.nombre] = await avanzar(b, cuenta!, c.organizacion_id, c.id, hastaMs, leer);
    } catch (e) {
      const msg = (e as Error).message;
      await consulta(`update ml_barrida set errores = errores + 1, detalle = (detalle || to_jsonb($2::text)), ocupado_hasta = now(),
              fase = case when errores + 1 >= 5 then 'error' else fase end where id = $1`, [b.id, msg.slice(0, 300)]);
      informe[c.nombre] = { error: msg };
    }
    // Una cuenta por vez: si ésta no terminó, sigue en la próxima corrida.
    const fase = await una<{ fase: string }>("select fase from ml_barrida where id = $1", [b.id]);
    if (fase?.fase !== "terminada" && fase?.fase !== "error") break;
  }
  return informe;
}

async function avanzar(b: Barrida, cuenta: CuentaMl, org: string, canal: number, hastaMs: number, leer: Leer) {
  let ultimo = 0;
  const pedir = async (ruta: string) => {
    const espera = ultimo + RITMO_LECTURA_MS - Date.now();
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
    ultimo = Date.now();
    return leer(cuenta, ruta);
  };
  let { fase, scroll_id: scroll, ids, posicion, revisadas, errores } = b;
  ids = ids ?? [];
  const guardar = (extra = "") => consulta(`
    update ml_barrida set fase = $2, scroll_id = $3, ids = $4::jsonb, posicion = $5, revisadas = $6, errores = $7 ${extra} where id = $1`,
    [b.id, fase, scroll, JSON.stringify(ids), posicion, revisadas, errores]);

  // 1) La lista de publicaciones (scan con scroll; si el scroll venció entre
  //    corridas, se empieza la lista de nuevo).
  while (fase === "ids") {
    if (Date.now() > hastaMs - 3_000) { await guardar(", ocupado_hasta = now()"); return { fase, ids: ids.length }; }
    const r = await pedir(`/users/${cuenta.meliUserId}/items/search?search_type=scan&limit=100${scroll ? `&scroll_id=${encodeURIComponent(scroll)}` : ""}`);
    if (r.status !== 200) {
      if (scroll) { scroll = null; ids = []; continue; } // venció: de nuevo
      throw new Error(`Mercado Libre no dio la lista de publicaciones (${r.status}).`);
    }
    const d = r.datos as { results?: string[]; scroll_id?: string };
    const nuevos = d.results ?? [];
    ids.push(...nuevos);
    scroll = d.scroll_id ?? null;
    if (!nuevos.length || !scroll) { fase = "items"; scroll = null; posicion = 0; }
    await guardar();
  }

  // 2) Lo que ML dice de cada una, de a 20: refresca el espejo.
  const vistos = new Set<string>();
  while (fase === "items") {
    if (Date.now() > hastaMs - 3_000) { await guardar(", ocupado_hasta = now()"); return { fase, revisadas, de: ids.length }; }
    const tanda = [...new Set(ids.slice(posicion, posicion + 20))].filter((x) => !vistos.has(x));
    if (!tanda.length && posicion >= ids.length) { fase = "comparar"; await guardar(); break; }
    if (tanda.length) {
      const r = await pedir(`/items?ids=${tanda.join(",")}&include_attributes=all`);
      if (r.status === 200 && Array.isArray(r.datos)) {
        for (const x of r.datos as { code: number; body: ItemMl }[]) {
          if (x.code !== 200 || !x.body?.id) { errores++; continue; }
          await guardarItem(cuenta, x.body);
          vistos.add(x.body.id);
          revisadas++;
        }
      } else if (r.status === 429 || r.status >= 500 || r.status === 0) {
        await guardar(", ocupado_hasta = now()"); // ML pidió aire: sigue la próxima corrida desde acá
        return { fase, revisadas, de: ids.length, frenada: r.status };
      } else {
        errores += tanda.length;
      }
    }
    posicion += 20;
    await guardar();
  }

  // 3) Comparar con lo que debería ser y encolar las diferencias.
  if (fase === "comparar") {
    const r = await sincronizarStockMl(org, undefined, hastaMs, { canal, origen: "barrida" });
    const diferencias = r.pausadas + r.reactivadas + r.cantidades;
    fase = "terminada";
    await consulta(`
      update ml_barrida set fase = 'terminada', revisadas = $2, errores = $3, diferencias = $4, encoladas = $5, pausas = $6,
             ids = '[]', scroll_id = null, terminada_ts = now(), ocupado_hasta = now(),
             detalle = detalle || $7::jsonb
       where id = $1`,
      [b.id, revisadas, errores + r.errores.length, diferencias, r.encoladas, r.pausadas, JSON.stringify(r.errores.slice(0, 5))]);
    console.log(`[ml barrida] canal ${canal}: ${revisadas} revisadas, ${diferencias} diferencias, ${r.encoladas} encoladas (${r.pausadas} pausas), ${errores} errores`);
    return { revisadas, diferencias, encoladas: r.encoladas, pausas: r.pausadas, errores };
  }
  return { fase };
}
