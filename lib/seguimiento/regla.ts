// La regla de precio de un producto (pedido de Fer, 11/10): mirando las
// publicaciones que se siguen (lib/seguimiento/), baja el precio de la lista
// Clásicas del producto. Nunca toca Mercado Libre directo: desde la lista, el
// esquema de precios lo lleva a todas las cuentas y planes (lib/precios-ml).
//   · modo «propuesta»: deja el cambio esperando «Aplicar» en la pestaña Seguimiento.
//   · modo «automatico»: cambia la lista sola.
// Baja hasta el objetivo, nunca por debajo del piso. Con «También subir» (Fer, 12/10), si el
// competidor sube (o cambia el más barato por uno más caro) sube hasta el objetivo, nunca por encima del techo.
// Se revisa después de cada lectura de las seguidas y con «Revisar ahora».

import { consulta, una, enTransaccion, ErrorErp } from "@/lib/erp/base";
import { guardarPrecio, precioDe } from "@/lib/precios";
import { canalesMl } from "@/lib/precios-ml/datos";
import { formatear } from "@/lib/moneda";

export type ModoRegla = "apagada" | "propuesta" | "automatico";
export type ComoRegla = "igual" | "pesos" | "pct";
export type Regla = {
  modo: ModoRegla; contra: "mas_barato" | "una"; seguimientoId: number | null; como: ComoRegla; diferencia: number; piso: number | null; subir: boolean; techo: number | null;
  revisadaTs: Date | null; resultado: string | null;
};

export const MODOS_REGLA: Record<ModoRegla, string> = {
  apagada: "Apagada",
  propuesta: "Proponer el cambio y esperar mi clic",
  automatico: "Automático: cambiar la lista sola",
};
export const COMO_REGLA: Record<ComoRegla, string> = { igual: "Igualar su precio", pesos: "Quedar X pesos abajo", pct: "Quedar X % abajo" };

const REGLA_VACIA: Regla = { modo: "apagada", contra: "mas_barato", seguimientoId: null, como: "pesos", diferencia: 0, piso: null, subir: false, techo: null, revisadaTs: null, resultado: null };

/** El precio al que hay que quedar, según el de la referencia. En pesos enteros, hacia abajo. Pura. */
export function objetivoDe(referencia: number, como: ComoRegla, diferencia: number): number {
  const v = como === "igual" ? referencia : como === "pesos" ? referencia - diferencia : referencia * (1 - diferencia / 100);
  return Math.floor(v);
}

/** Qué hacer con una Clásica: bajar hasta el objetivo, nunca por debajo del piso; con techo (también subir),
 *  subir hasta el objetivo, nunca por encima del techo. Pura. */
export function decidir(actual: number, objetivo: number, piso: number, techo: number | null = null): { nuevo: number | null; motivo: string } {
  if (actual > objetivo) {
    if (actual <= piso) return { nuevo: null, motivo: "ya está en el piso" };
    if (objetivo < piso) return { nuevo: piso, motivo: "queda en el piso" };
    return { nuevo: objetivo, motivo: "" };
  }
  if (actual === objetivo) return { nuevo: null, motivo: "ya está en el objetivo" };
  if (techo == null) return { nuevo: null, motivo: "ya está más barato (no sube)" };
  if (actual >= techo) return { nuevo: null, motivo: "ya está en el techo" };
  if (objetivo > techo) return { nuevo: techo, motivo: "queda en el techo" };
  return { nuevo: objetivo, motivo: "" };
}

export async function reglaDe(org: string, productoId: number): Promise<Regla> {
  const r = await una<{ modo: ModoRegla; contra: "mas_barato" | "una"; seguimiento_id: number | null; como: ComoRegla; diferencia: number; piso: number | null; subir: boolean; techo: number | null; revisada_ts: Date | null; resultado: string | null }>(`
    select modo, contra, seguimiento_id::int, como, diferencia::float8, piso::float8, subir, techo::float8, revisada_ts, resultado
      from seguimiento_regla where organizacion_id = $1 and producto_id = $2`, [org, productoId]);
  return r ? { modo: r.modo, contra: r.contra, seguimientoId: r.seguimiento_id, como: r.como, diferencia: r.diferencia, piso: r.piso, subir: r.subir, techo: r.techo, revisadaTs: r.revisada_ts, resultado: r.resultado } : REGLA_VACIA;
}

export async function guardarRegla(org: string, productoId: number, r: Omit<Regla, "revisadaTs" | "resultado">): Promise<void> {
  if (r.modo !== "apagada" && !(r.piso && r.piso > 0)) throw new ErrorErp("Para prenderla, cargá el piso: el precio más bajo al que puede llegar la Clásica.");
  if (r.modo !== "apagada" && r.subir && !(r.techo && r.techo > 0)) throw new ErrorErp("Para que también suba, cargá el techo: el precio más alto al que puede llegar la Clásica.");
  if (r.subir && r.techo != null && r.piso != null && r.techo < r.piso) throw new ErrorErp("El techo tiene que ser mayor que el piso.");
  if (r.contra === "una" && !r.seguimientoId) throw new ErrorErp("Elegí contra qué publicación se compara.");
  if (r.como === "pct" && r.diferencia >= 100) throw new ErrorErp("El porcentaje tiene que ser menor a 100.");
  if (r.contra === "una") {
    const ok = await una("select 1 from seguimiento_pub where id = $1 and organizacion_id = $2 and producto_id = $3", [r.seguimientoId, org, productoId]);
    if (!ok) throw new ErrorErp("Esa publicación ya no se sigue.");
  }
  await consulta(`
    insert into seguimiento_regla (organizacion_id, producto_id, modo, contra, seguimiento_id, como, diferencia, piso, subir, techo)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    on conflict (organizacion_id, producto_id) do update set modo = excluded.modo, contra = excluded.contra, seguimiento_id = excluded.seguimiento_id,
      como = excluded.como, diferencia = excluded.diferencia, piso = excluded.piso,
      subir = excluded.subir, techo = excluded.techo, actualizado_ts = now()`,
    [org, productoId, r.modo, r.contra, r.contra === "una" ? r.seguimientoId : null, r.como, r.como === "igual" ? 0 : r.diferencia, r.piso, r.subir, r.techo]);
  // Al apagarla o pasarla a automático, lo que esperaba el clic ya no corre.
  if (r.modo !== "propuesta") await reemplazarPropuestas(org, productoId);
}

async function reemplazarPropuestas(org: string, productoId: number) {
  await consulta("update seguimiento_ajuste set estado = 'reemplazado', resuelto_ts = now() where organizacion_id = $1 and producto_id = $2 and estado = 'propuesto'", [org, productoId]);
}

/** La lista de la Clásica (la de las cuentas de Mercado Libre). */
async function listaClasica(org: string): Promise<number> {
  const id = (await canalesMl(org)).find((c) => c.listaId)?.listaId;
  if (!id) throw new ErrorErp("No hay lista de la Clásica: ninguna cuenta de Mercado Libre tiene lista de precios.");
  return id;
}

/** La referencia: la más barata de las seguidas activas (o la elegida), con lo último leído. */
async function referenciaDe(org: string, productoId: number, r: Regla): Promise<{ precio: number; texto: string } | null> {
  const f = await una<{ precio: number; vendedor: string | null; item_id: string }>(`
    select precio::float8, vendedor, item_id from seguimiento_pub
     where organizacion_id = $1 and producto_id = $2 and estado = 'activa' and precio is not null and coalesce(moneda, 'ARS') = 'ARS'
       -- Las excluidas a mano y las internacionales no cuentan (Fer, 12/10).
       and not excluido and not coalesce(internacional, false)
       and ($3::bigint is null or id = $3)
     order by precio limit 1`, [org, productoId, r.contra === "una" ? r.seguimientoId : null]);
  return f ? { precio: f.precio, texto: `${f.vendedor ?? f.item_id} a ${formatear(f.precio, "ARS")}` } : null;
}

const fmt = (n: number) => formatear(n, "ARS");

/** Revisa la regla de un producto con lo último leído y hace lo que corresponda. Devuelve lo que pasó, en criollo. */
export async function revisarRegla(org: string, productoId: number, usuario: string | null = null): Promise<string> {
  const r = await reglaDe(org, productoId);
  if (r.modo === "apagada") return "La regla está apagada.";
  const anotar = async (t: string) => {
    await consulta("update seguimiento_regla set revisada_ts = now(), resultado = $3 where organizacion_id = $1 and producto_id = $2", [org, productoId, t]);
    return t;
  };
  const ref = await referenciaDe(org, productoId, r);
  if (!ref) return anotar(r.contra === "una" ? "La publicación elegida no está activa o no tiene precio leído: no se cambió nada." : "Ninguna de las seguidas está activa con precio leído: no se cambió nada.");
  const objetivo = objetivoDe(ref.precio, r.como, r.diferencia);
  const lista = await listaClasica(org);
  const variaciones = await consulta<{ id: number; sku: string }>(
    "select id::int, sku from variacion where organizacion_id = $1 and producto_id = $2 and estado <> 'archivada' order by id", [org, productoId]);
  const cambios: { variacion: number; sku: string; antes: number; nuevo: number; usd: number | null }[] = [];
  const notas: string[] = [];
  for (const v of variaciones) {
    const p = await precioDe(org, v.id, lista);
    if (!p) { notas.push(`${v.sku}: no tiene precio en la lista`); continue; }
    const d = decidir(p.lista.ars, objetivo, r.piso!, r.subir ? r.techo : null);
    if (d.nuevo == null) { notas.push(`${v.sku}: ${d.motivo} (${fmt(p.lista.ars)})`); continue; }
    // Un producto con precio en dólares sigue en dólares: se baja en la misma proporción.
    cambios.push({ variacion: v.id, sku: v.sku, antes: p.lista.ars, nuevo: d.nuevo, usd: p.monedaOrigen === "USD" && p.lista.ars > 0 ? p.lista.usd * d.nuevo / p.lista.ars : null });
    if (d.motivo) notas.push(`${v.sku}: ${d.motivo}`);
  }
  const base = `Referencia: ${ref.texto}; objetivo ${fmt(objetivo)}.`;
  // Lo que esperaba el clic y ya no vale, se reemplaza por lo de hoy.
  await reemplazarPropuestas(org, productoId);
  if (!cambios.length) return anotar(`${base} No hace falta cambiar${notas.length ? ` (${notas.join("; ")})` : ""}.`);
  await enTransaccion(async (c) => {
    for (const x of cambios) {
      if (r.modo === "automatico") {
        // Lo cambió la regla sola: sin usuario (el historial dice «Regla de seguimiento, automática»).
        await guardarPrecio(org, { listaId: lista, variacionId: x.variacion, importe: x.usd ?? x.nuevo, moneda: x.usd != null ? "USD" : "ARS", usuarioId: null,
          origen: "seguimiento", motivo: `Automático: referencia ${ref.texto}` }, c);
      }
      await c.query(`insert into seguimiento_ajuste (organizacion_id, producto_id, variacion_id, lista_id, antes_ars, nuevo_ars, referencia, modo, estado, resuelto_ts, usuario_id)
                     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [org, productoId, x.variacion, lista, x.antes, x.nuevo, ref.texto, r.modo, r.modo === "automatico" ? "aplicado" : "propuesto", r.modo === "automatico" ? new Date() : null, usuario]);
    }
  });
  const detalle = cambios.map((x) => `${x.sku} de ${fmt(x.antes)} a ${fmt(x.nuevo)}`).join("; ");
  return anotar(r.modo === "automatico"
    ? `${base} Se cambió la Clásica: ${detalle}.`
    : `${base} Propuesto cambiar la Clásica: ${detalle}. Espera «Aplicar».`);
}

/** «Aplicar»: lo propuesto pasa a la lista de precios (desde ahí, el esquema lo lleva a Mercado Libre). */
export async function aplicarPropuesta(org: string, productoId: number, usuario: string | null): Promise<number> {
  const props = await consulta<{ id: number; variacion_id: number; lista_id: number; nuevo_ars: number; referencia: string | null }>(`
    select id::int, variacion_id::int, lista_id::int, nuevo_ars::float8, referencia from seguimiento_ajuste
     where organizacion_id = $1 and producto_id = $2 and estado = 'propuesto'`, [org, productoId]);
  if (!props.length) throw new ErrorErp("No hay nada propuesto para aplicar.");
  await enTransaccion(async (c) => {
    for (const x of props) {
      const p = await precioDe(org, x.variacion_id, x.lista_id, undefined, c);
      const usd = p && p.monedaOrigen === "USD" && p.lista.ars > 0 ? p.lista.usd * x.nuevo_ars / p.lista.ars : null;
      await guardarPrecio(org, { listaId: x.lista_id, variacionId: x.variacion_id, importe: usd ?? x.nuevo_ars, moneda: usd != null ? "USD" : "ARS", usuarioId: usuario,
        origen: "seguimiento", motivo: `Propuesta aplicada: referencia ${x.referencia ?? "—"}` }, c);
      await c.query("update seguimiento_ajuste set estado = 'aplicado', resuelto_ts = now(), usuario_id = $2 where id = $1", [x.id, usuario]);
    }
  });
  return props.length;
}

export async function descartarPropuesta(org: string, productoId: number, usuario: string | null): Promise<void> {
  await consulta("update seguimiento_ajuste set estado = 'descartado', resuelto_ts = now(), usuario_id = $3 where organizacion_id = $1 and producto_id = $2 and estado = 'propuesto'",
    [org, productoId, usuario]);
}

export type Ajuste = { id: number; ts: Date; sku: string; antes: number; nuevo: number; referencia: string | null; modo: string; estado: string };

/** Lo que hizo o propuso la regla, lo último primero. */
export function ajustesDe(org: string, productoId: number, limite = 50): Promise<Ajuste[]> {
  return consulta<Ajuste>(`
    select a.id::int, a.ts, v.sku, a.antes_ars::float8 antes, a.nuevo_ars::float8 nuevo, a.referencia, a.modo, a.estado
      from seguimiento_ajuste a join variacion v on v.id = a.variacion_id
     where a.organizacion_id = $1 and a.producto_id = $2 order by a.ts desc, a.id desc limit $3`, [org, productoId, limite]);
}

/** Después de leer las seguidas: revisa la regla de cada producto que se leyó y tiene la regla prendida. */
export async function revisarReglasDe(org: string, productos: number[]): Promise<void> {
  if (!productos.length) return;
  const conRegla = await consulta<{ producto_id: number }>(
    "select producto_id::int from seguimiento_regla where organizacion_id = $1 and modo <> 'apagada' and producto_id = any($2::bigint[])", [org, productos]);
  for (const x of conRegla) await revisarRegla(org, x.producto_id).catch((e) => console.error("[seguimiento regla]", x.producto_id, e));
}

/** Todo lo que muestra la caja «Regla de precio»: la regla, la Clásica de hoy, la referencia y qué haría. */
export async function vistaRegla(org: string, productoId: number) {
  const regla = await reglaDe(org, productoId);
  const lista = await listaClasica(org).catch(() => null);
  const variaciones = await consulta<{ id: number; sku: string }>(
    "select id::int, sku from variacion where organizacion_id = $1 and producto_id = $2 and estado <> 'archivada' order by id", [org, productoId]);
  const clasicas = lista ? await Promise.all(variaciones.map(async (v) => ({ sku: v.sku, ars: (await precioDe(org, v.id, lista))?.lista.ars ?? null }))) : [];
  const ref = await referenciaDe(org, productoId, regla.modo === "apagada" && regla.contra === "una" && !regla.seguimientoId ? REGLA_VACIA : regla);
  const objetivo = ref ? objetivoDe(ref.precio, regla.como, regla.diferencia) : null;
  const [ajustes, propuestas] = await Promise.all([
    ajustesDe(org, productoId, 30),
    consulta<{ n: number }>("select count(*)::int n from seguimiento_ajuste where organizacion_id = $1 and producto_id = $2 and estado = 'propuesto'", [org, productoId]),
  ]);
  return { regla, lista, clasicas, referencia: ref, objetivo, ajustes, propuestas: propuestas[0]?.n ?? 0 };
}
