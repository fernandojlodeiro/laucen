// Reparto del stock entre cuentas de ML cuando queda poco (Fer, 21/10).
//
// Cada cuenta de ML (y, dentro de una cuenta, cada "producto de usuario" de
// ML, que es el que tiene stock propio: la común y su gemela de catálogo lo
// comparten) muestra su propio disponible. Si todas muestran el disponible
// entero, un comprador puede armar un carrito con varios vendedores y llevarse
// más de lo que hay (pasó con el SKU00537 el 19/10: 6 + 6 + 2 de 6), porque ML
// controla el stock de cada vendedor por separado y avisa recién al pagarse.
//
// Con el reparto prendido, cuando el disponible llega a `desde` (10) o menos y
// el precio de lista del producto (lista de precios del canal) es menor que
// `topePrecio` ($ 100.000), el disponible se reparte de a una unidad por
// cuenta, en orden: más vendidos del producto en la cuenta (lo que informa ML
// de sus publicaciones) → la cuenta preferida en el empate (.BAIRES) → al azar
// (un sorteo fijo por producto y cuenta, así no cambia en cada pasada). La
// suma de lo que le toca a cada cuenta nunca pasa lo que hay. Dentro de la
// cuenta, lo suyo se reparte de a una unidad entre sus productos de ML (el que
// más vendió primero): las publicaciones de un mismo producto de ML (planes
// agrupados, catálogo) muestran lo mismo, y la suma de lo visible en ML nunca
// pasa lo que hay, ni con un carrito en la misma cuenta (Fer, 26/10). Lo que
// queda en 0 se pausa por stock y se reactiva solo cuando le vuelve a tocar.
//
// Prendido en Configuración › Canales, caja «Reparto del stock entre cuentas
// de ML» (config_org 'reparto_stock_ml'). Lo usa lib/mercadolibre/stock.ts.

import { consulta, una } from "@/lib/erp/base";

export type ConfigReparto = { activo: boolean; desde: number; topePrecio: number; preferida: number | null };
export const REPARTO_POR_DEFECTO: ConfigReparto = { activo: false, desde: 10, topePrecio: 100_000, preferida: null };

export async function leerReparto(org: string): Promise<ConfigReparto> {
  const f = await una<{ valor: Partial<ConfigReparto> }>(
    "select valor from config_org where organizacion_id = $1 and clave = 'reparto_stock_ml'", [org]).catch(() => null);
  return { ...REPARTO_POR_DEFECTO, ...(f?.valor ?? {}) };
}

export async function guardarReparto(org: string, c: ConfigReparto) {
  await consulta(`insert into config_org (organizacion_id, clave, valor) values ($1, 'reparto_stock_ml', $2::jsonb)
                  on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, JSON.stringify(c)]);
}

/** Un grupo de publicaciones de una cuenta que comparten stock en ML. */
export type Grupo = { clave: string; vendidos: number; pubs: number[] };
export type CuentaReparto = { canal: number; vendidos: number; grupos: Grupo[] };

/** Sorteo fijo (el "al azar" del empate): el mismo producto y cuenta dan siempre lo mismo. */
export function sorteo(variacion: number, canal: number): number {
  let h = (Math.imul(variacion, 2654435761) ^ Math.imul(canal, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

/** El orden de las cuentas: más vendidos → la preferida → sorteo. */
export function ordenCuentas<T extends { canal: number; vendidos: number }>(cuentas: T[], variacion: number, preferida: number | null): T[] {
  return [...cuentas].sort((a, b) => b.vendidos - a.vendidos
    || Number(b.canal === preferida) - Number(a.canal === preferida)
    || sorteo(variacion, a.canal) - sorteo(variacion, b.canal) || a.canal - b.canal);
}

/** Reparte `total` unidades de a una por cuenta, en el orden de ordenCuentas;
 *  dentro de cada cuenta, lo suyo de a una por grupo (el que más vendió
 *  primero). Devuelve lo que le toca a cada publicación (las que no reciben
 *  nada, 0). `topeCanal` limita lo de una cuenta a su propio disponible. */
export function repartir(total: number, cuentas: CuentaReparto[], variacion: number, preferida: number | null,
  topeCanal: (canal: number) => number = () => Infinity): Map<number, number> {
  const res = new Map<number, number>();
  const orden = ordenCuentas(cuentas.filter((c) => c.grupos.length), variacion, preferida);
  const parte = orden.map(() => 0);
  let quedan = Math.max(0, total);
  // De a una unidad por cuenta, mientras alguna pueda recibir.
  while (quedan > 0) {
    let dio = false;
    for (let i = 0; i < orden.length && quedan > 0; i++) {
      if (parte[i] >= topeCanal(orden[i].canal)) continue;
      parte[i]++; quedan--; dio = true;
    }
    if (!dio) break;
  }
  orden.forEach((c, i) => {
    const grupos = [...c.grupos].sort((a, b) => b.vendidos - a.vendidos || a.clave.localeCompare(b.clave));
    const deGrupo = grupos.map(() => 0);
    for (let u = 0; u < parte[i]; u++) deGrupo[u % grupos.length]++;
    grupos.forEach((g, j) => { for (const p of g.pubs) res.set(p, deGrupo[j]); });
  });
  return res;
}

type FilaReparto = { pub: number; variacion: number; canal: number; lista: number | null; grupo: string; vendidos: number; disponible: number };

/** Lo que le toca a cada publicación de ML de estas variaciones, sólo para las
 *  que entran en el reparto (disponible ≤ desde y precio de lista < tope). Las
 *  demás no figuran: siguen con el disponible entero. `enCamino`: lo vendido
 *  en ML que todavía no entró como pedido (se descuenta del disponible). */
export async function repartoDe(org: string, variaciones: number[], enCamino: Map<number, number>,
  cfg?: ConfigReparto): Promise<Map<number, number>> {
  const c = cfg ?? await leerReparto(org);
  const res = new Map<number, number>();
  if (!c.activo || !variaciones.length) return res;
  // Todas las publicaciones que muestran stock en ML, de todas las cuentas que
  // sincronizan (aunque la pasada sea de una sola cuenta): el reparto es entre todas.
  const filas = await consulta<FilaReparto>(`
    select p.id::int pub, p.variacion_id::int variacion, p.canal_id::int canal, c.lista_precios_id::int lista,
           -- Dentro de la cuenta, lo suyo se reparte entre sus productos de ML (cada uno tiene su propio stock en ML).
           -- Mostrar lo de la cuenta en todos (22/10) dejó vender 3 con 2 en un carrito de la misma cuenta (pedido
           -- 150454, 26/10: SKU03433 con 5 productos de ML separados en DAITOM). La común y su gemela de catálogo
           -- comparten producto, así que van juntas.
           coalesce(p.datos_externos ->> 'user_product_id', p.id_externo) grupo,
           coalesce(mi.vendidos, 0)::int vendidos,
           stock_disponible_canal(p.organizacion_id, p.variacion_id, p.canal_id)::int disponible
      from publicacion p join canal c on c.id = p.canal_id
      join meli_cuenta mc on mc.canal_id = c.id and mc.estado = 'activa'
      left join meli_item mi on mi.canal_id = p.canal_id and mi.item_id = p.id_externo and mi.variation_id = coalesce(p.variacion_externa, '')
     where p.organizacion_id = $1 and p.variacion_id = any($2::bigint[])
       and c.tipo = 'mercadolibre' and c.estado = 'activo' and coalesce((c.config ->> 'sincronizar_stock')::boolean, false)
       and p.id_externo is not null and p.estado <> 'cerrada' and not p.pausada_manual
       and coalesce(p.datos_externos ->> 'logistica', '') <> 'fulfillment'`, [org, variaciones]);
  const porVar = new Map<number, FilaReparto[]>();
  for (const f of filas) porVar.set(f.variacion, [...(porVar.get(f.variacion) ?? []), f]);
  // Primero lo que entra por cantidad (barato); el precio de lista, sólo de ésas
  // y una vez por producto y lista (precio_de por cada publicación del catálogo tardaba ~35 s).
  const dispDe = (v: number, fs: FilaReparto[]) => {
    const camino = enCamino.get(v) ?? 0;
    return new Map(fs.map((f) => [f.canal, Math.max(0, f.disponible - camino)]));
  };
  // Sin stock no hay nada que repartir (se pausa igual por el umbral).
  const candidatas = [...porVar].filter(([v, fs]) => { const t = Math.max(0, ...dispDe(v, fs).values()); return t > 0 && t <= c.desde; });
  if (!candidatas.length) return res;
  const listas = [...new Set(filas.map((f) => f.lista).filter((x): x is number => x != null))];
  const precios = new Map((await consulta<{ variacion: number; precio: number }>(`
    select v.id::int variacion, max(x.lista_ars)::float8 precio
      from unnest($2::bigint[]) v(id) cross join unnest($3::bigint[]) l(id)
      cross join lateral precio_de($1, v.id, l.id, (now() at time zone 'America/Argentina/Buenos_Aires')::date) x
     group by v.id`, [org, candidatas.map(([v]) => v), listas])).map((f) => [f.variacion, f.precio]));
  for (const [v, fs] of candidatas) {
    // Sin precio de lista no se sabe si entra: sigue como siempre.
    const precio = precios.get(v);
    if (precio == null || precio >= c.topePrecio) continue;
    const dispCanal = dispDe(v, fs);
    const total = Math.max(0, ...dispCanal.values());
    const cuentas = new Map<number, CuentaReparto>();
    for (const f of fs) {
      const cu = cuentas.get(f.canal) ?? { canal: f.canal, vendidos: 0, grupos: [] };
      cu.vendidos += f.vendidos;
      const g = cu.grupos.find((x) => x.clave === f.grupo);
      if (g) { g.vendidos += f.vendidos; g.pubs.push(f.pub); } else cu.grupos.push({ clave: f.grupo, vendidos: f.vendidos, pubs: [f.pub] });
      cuentas.set(f.canal, cu);
    }
    for (const [pub, n] of repartir(total, [...cuentas.values()], v, c.preferida, (canal) => dispCanal.get(canal) ?? 0)) res.set(pub, n);
  }
  return res;
}
