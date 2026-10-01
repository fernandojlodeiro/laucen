// Listas de precios (orden 136, §5). `precioDe` es la ÚNICA forma de obtener
// un precio en todo el sistema: envuelve la función precio_de() de la base
// (db/catalogo.sql), que resuelve el descuento variación → producto →
// familia (y sus familias padre) → 0.

import { consulta, una, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { importeDoble, hoyAR, type Moneda } from "@/lib/moneda";

export type Precio = {
  precioId: number;
  /** Precio de lista (el que se muestra tachado). */
  lista: { ars: number; usd: number };
  monedaOrigen: Moneda;
  vigenteDesde: string;
  /** Descuento efectivo en %, 0 a 100. */
  descuentoPct: number;
  /** Precio de venta = lista × (1 − descuento). */
  venta: { ars: number; usd: number };
};

type FilaPrecio = {
  precio_id: string; lista_ars: string; lista_usd: string; moneda_origen: Moneda; vigente_desde: string;
  descuento_pct: string; venta_ars: string; venta_usd: string;
};

const aPrecio = (r: FilaPrecio): Precio => ({
  precioId: Number(r.precio_id),
  lista: { ars: Number(r.lista_ars), usd: Number(r.lista_usd) },
  monedaOrigen: r.moneda_origen,
  vigenteDesde: r.vigente_desde,
  descuentoPct: Number(r.descuento_pct),
  venta: { ars: Number(r.venta_ars), usd: Number(r.venta_usd) },
});

/** Precio de una variación en una lista, un día (por defecto hoy). null si la
 *  variación no tiene precio cargado en esa lista. */
export async function precioDe(org: string, variacionId: number, listaId: number, fecha?: string, c?: Consultor): Promise<Precio | null> {
  const sql = `select precio_id, lista_ars, lista_usd, moneda_origen, to_char(vigente_desde, 'YYYY-MM-DD') vigente_desde,
                      descuento_pct, venta_ars, venta_usd
                 from precio_de($1, $2, $3, $4::date)`;
  const valores = [org, variacionId, listaId, fecha ?? hoyAR()];
  const r = c ? (await c.query<FilaPrecio>(sql, valores)).rows[0] : await una<FilaPrecio>(sql, valores);
  return r ? aPrecio(r) : null;
}

/** Carga (o cambia) el precio de lista de una variación desde hoy. La otra
 *  moneda se calcula con el tipo de cambio del día y queda congelada. Si ya
 *  había un precio cargado hoy, lo pisa (la historia es por día). */
export async function guardarPrecio(org: string, args: {
  listaId: number; variacionId: number; importe: number; moneda: Moneda; usuarioId?: string | null; vigenteDesde?: string;
}, c?: Consultor): Promise<void> {
  if (!(args.importe >= 0)) throw new ErrorErp("El precio tiene que ser un número mayor o igual a cero.");
  const fecha = args.vigenteDesde ?? hoyAR();
  const correr = async (cx: Consultor) => {
    const ok = await cx.query(
      `select 1 from lista_precios l, variacion v where l.id = $2 and l.organizacion_id = $1 and v.id = $3 and v.organizacion_id = $1`,
      [org, args.listaId, args.variacionId]);
    if (!ok.rowCount) throw new ErrorErp("La lista o la variación no existen.");
    const d = await importeDoble(org, args.importe, args.moneda, fecha, cx);
    await cx.query(`
      insert into precio (organizacion_id, lista_id, variacion_id, importe_ars, importe_usd, moneda_origen, vigente_desde, usuario_id)
      values ($1, $2, $3, $4, $5, $6, $7::date, $8)
      on conflict (lista_id, variacion_id, vigente_desde) do update
        set importe_ars = excluded.importe_ars, importe_usd = excluded.importe_usd,
            moneda_origen = excluded.moneda_origen, usuario_id = excluded.usuario_id, creado_ts = now()`,
      [org, args.listaId, args.variacionId, d.importe_ars, d.importe_usd, d.moneda_origen, fecha, args.usuarioId ?? null]);
  };
  if (c) await correr(c);
  else await enTransaccion(correr);
}

/** Carga masiva: "Mayorista = Web − 25 %". Toma el precio de lista vigente
 *  de cada variación en la lista de origen, le aplica el porcentaje (negativo
 *  = rebaja) y lo carga desde hoy en la de destino, en la misma moneda en que
 *  estaba cargado. Devuelve cuántos precios cargó. */
export async function precioMasivoPorPorcentaje(org: string, args: {
  listaDestinoId: number; listaOrigenId: number; porcentaje: number; usuarioId?: string | null; redondeo?: number;
}): Promise<number> {
  if (args.listaDestinoId === args.listaOrigenId) throw new ErrorErp("La lista de origen y la de destino tienen que ser distintas.");
  return enTransaccion(async (c) => {
    const ok = await c.query("select count(*)::int n from lista_precios where organizacion_id = $1 and id in ($2, $3)",
      [org, args.listaDestinoId, args.listaOrigenId]);
    if (ok.rows[0].n !== 2) throw new ErrorErp("Alguna de las dos listas no existe.");
    const origen = await c.query<{ variacion_id: string; importe_ars: string; importe_usd: string; moneda_origen: Moneda }>(`
      select distinct on (variacion_id) variacion_id, importe_ars, importe_usd, moneda_origen
        from precio where organizacion_id = $1 and lista_id = $2 and vigente_desde <= $3::date
       order by variacion_id, vigente_desde desc`, [org, args.listaOrigenId, hoyAR()]);
    const factor = 1 + args.porcentaje / 100;
    const paso = args.redondeo && args.redondeo > 0 ? args.redondeo : 0;
    for (const f of origen.rows) {
      const base = Number(f.moneda_origen === "USD" ? f.importe_usd : f.importe_ars);
      let nuevo = base * factor;
      nuevo = paso ? Math.round(nuevo / paso) * paso : Math.round(nuevo * 100) / 100;
      await guardarPrecio(org, {
        listaId: args.listaDestinoId, variacionId: Number(f.variacion_id), importe: nuevo,
        moneda: f.moneda_origen, usuarioId: args.usuarioId,
      }, c);
    }
    return origen.rowCount ?? 0;
  });
}

/** Las listas de la organización. */
export function listasDePrecios(org: string) {
  return consulta<{ id: number; nombre: string; moneda_base: Moneda; estado: string; orden: number }>(
    "select id::int, nombre, moneda_base, estado, orden from lista_precios where organizacion_id = $1 order by orden, nombre", [org]);
}
