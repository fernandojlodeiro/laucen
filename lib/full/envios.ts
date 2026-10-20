// Envíos a Full de Mercado Libre (db/full.sql): los depósitos de Full y "En camino a Full", armar
// el envío (a mano o con la sugerencia), despacharlo (el stock pasa a "En camino"), recibirlo (lo
// llama la lectura de Full, lib/full/lectura.ts), cerrarlo con faltantes y repartir su flete.
// El stock se mueve sólo con mover_stock() (db/stock.sql).

import { pool } from "@/db";
import { consulta, una, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { SQL_CODIGO, completarCodigoFull } from "@/lib/deposito/etiquetas-full";

export type EstadoEnvio = "borrador" | "despachado" | "recibido" | "cerrado";
export const ESTADOS_ENVIO: Record<EstadoEnvio, { texto: string; tono: "gris" | "azul" | "verde" | "amarillo" }> = {
  borrador: { texto: "Borrador", tono: "gris" },
  despachado: { texto: "En camino", tono: "azul" },
  recibido: { texto: "Recibido", tono: "verde" },
  cerrado: { texto: "Cerrado con faltantes", tono: "amarillo" },
};

export type CriterioFlete = "unidades" | "volumen" | "peso" | "valor";
export const CRITERIOS_FLETE: Record<CriterioFlete, string> = {
  volumen: "Por volumen (medidas del paquete)",
  peso: "Por peso",
  unidades: "Por unidades",
  valor: "Por valor (costo de la mercadería)",
};
export const esCriterio = (x: unknown): x is CriterioFlete => typeof x === "string" && Object.hasOwn(CRITERIOS_FLETE, x);

/** Lo que se pide al armar la sugerencia (Agregar sugeridos). */
export type ParametrosSugerencia = { diasFull: number; diasDejar: number; diasVentas: number };
export const SUGERENCIA_DEFECTO: ParametrosSugerencia = { diasFull: 30, diasDejar: 30, diasVentas: 60 };

const NOMBRE_TRANSITO = "En camino a Full";
const PRIORIDAD_FULL = 99;

// ── Depósitos ────────────────────────────────────────────

/** El depósito Full de una cuenta de ML (el activo asociado a su canal), o null. */
export async function depositoFull(org: string, canalId: number, c: Consultor = pool): Promise<number | null> {
  const r = await c.query<{ id: string }>(`
    select d.id from canal_deposito cd join deposito d on d.id = cd.deposito_id
     where cd.organizacion_id = $1 and cd.canal_id = $2 and d.tipo = 'full_ml' and d.estado = 'activo' order by cd.prioridad, d.id limit 1`, [org, canalId]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

/** El depósito Full de la cuenta; si no hay, lo crea ("Full <cuenta>") y lo asocia al canal
 *  después de los demás (un pedido que no es Full nunca sale de ahí). */
export async function asegurarDepositoFull(c: Consultor, org: string, canalId: number): Promise<number> {
  const ya = await depositoFull(org, canalId, c);
  if (ya) return ya;
  const canal = (await c.query<{ nombre: string; tipo: string }>("select nombre, tipo from canal where id = $1 and organizacion_id = $2", [canalId, org])).rows[0];
  if (!canal || canal.tipo !== "mercadolibre") throw new ErrorErp("Esa cuenta de Mercado Libre no existe.");
  const nombre = `Full ${canal.nombre}`;
  const d = (await c.query<{ id: string }>(`
    insert into deposito (organizacion_id, nombre, tipo) values ($1, $2, 'full_ml')
    on conflict (organizacion_id, nombre) do update set tipo = 'full_ml', estado = 'activo' returning id`, [org, nombre])).rows[0];
  await c.query(`insert into canal_deposito (organizacion_id, canal_id, deposito_id, prioridad) values ($1, $2, $3, $4)
                 on conflict (canal_id, deposito_id) do update set prioridad = excluded.prioridad`, [org, canalId, d.id, PRIORIDAD_FULL]);
  return Number(d.id);
}

/** El depósito "En camino a Full" de la organización (lo crea si falta). Usa ubicaciones: una por envío. */
async function asegurarTransito(c: Consultor, org: string): Promise<number> {
  const ya = (await c.query<{ id: string }>("select id from deposito where organizacion_id = $1 and tipo = 'transito' order by (estado = 'activo') desc, id limit 1", [org])).rows[0];
  if (ya) {
    await c.query("update deposito set estado = 'activo', usa_ubicaciones = true where id = $1", [ya.id]);
    return Number(ya.id);
  }
  const d = (await c.query<{ id: string }>(`
    insert into deposito (organizacion_id, nombre, tipo, usa_ubicaciones) values ($1, $2, 'transito', true)
    on conflict (organizacion_id, nombre) do update set tipo = 'transito', usa_ubicaciones = true, estado = 'activo' returning id`, [org, NOMBRE_TRANSITO])).rows[0];
  return Number(d.id);
}

async function ubicacionGeneral(c: Consultor, deposito: number): Promise<number> {
  const r = (await c.query<{ id: string }>("select id from ubicacion where deposito_id = $1 and es_default", [deposito])).rows[0];
  if (!r) throw new ErrorErp("El depósito no tiene ubicación general.");
  return Number(r.id);
}

// ── Envíos ───────────────────────────────────────────────

export type Envio = {
  id: number; canal_id: number; canal: string; deposito_origen_id: number; origen: string; deposito_full_id: number; full: string;
  ubicacion_transito_id: number | null; numero_ml: string | null; fecha_entrega: string | null; estado: EstadoEnvio;
  flete_ars: number | null; flete_factura_id: number | null; flete_criterio: CriterioFlete; factura: string | null; notas: string | null;
  despachado_ts: Date | null; recibido_ts: Date | null; cerrado_ts: Date | null; creado_ts: Date;
};

export const SQL_FACTURA_TEXTO = `(select concat_ws(' · ', to_char(f.fecha, 'DD/MM/YYYY'), pr.nombre,
     f.letra || ' ' || coalesce(lpad(f.punto_venta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0'), 's/n'))
   from factura_compra f join proveedor pr on pr.id = f.proveedor_id where f.id = e.flete_factura_id)`;

export async function envio(org: string, id: number): Promise<Envio | null> {
  return una<Envio>(`
    select e.id::int, e.canal_id::int, c.nombre canal, e.deposito_origen_id::int, o.nombre origen, e.deposito_full_id::int, f.nombre full,
           e.ubicacion_transito_id::int, e.numero_ml, to_char(e.fecha_entrega, 'YYYY-MM-DD') fecha_entrega, e.estado,
           e.flete_ars::float, e.flete_factura_id::int, e.flete_criterio, ${SQL_FACTURA_TEXTO} factura, e.notas,
           e.despachado_ts, e.recibido_ts, e.cerrado_ts, e.creado_ts
      from full_envio e join canal c on c.id = e.canal_id join deposito o on o.id = e.deposito_origen_id join deposito f on f.id = e.deposito_full_id
     where e.organizacion_id = $1 and e.id = $2`, [org, id]);
}

/** Un envío nuevo en borrador, de una cuenta de ML y desde un depósito propio. Si la cuenta todavía
 *  no tiene depósito Full, lo crea. */
export async function crearEnvio(org: string, usuario: string, canalId: number, origenId: number): Promise<number> {
  return enTransaccion(async (c) => {
    const o = (await c.query<{ tipo: string }>("select tipo from deposito where id = $1 and organizacion_id = $2 and estado = 'activo'", [origenId, org])).rows[0];
    if (!o || o.tipo === "full_ml" || o.tipo === "transito") throw new ErrorErp("Elegí el depósito de donde sale la mercadería.");
    const full = await asegurarDepositoFull(c, org, canalId);
    const r = await c.query<{ id: string }>(`
      insert into full_envio (organizacion_id, canal_id, deposito_origen_id, deposito_full_id, usuario_id) values ($1, $2, $3, $4, $5) returning id`,
      [org, canalId, origenId, full, usuario]);
    return Number(r.rows[0].id);
  });
}

async function envioPara(c: Consultor, org: string, id: number, estados: EstadoEnvio[]): Promise<Envio> {
  const e = (await c.query<Envio>(`select id::int, canal_id::int, deposito_origen_id::int, deposito_full_id::int, ubicacion_transito_id::int, estado,
                                          flete_ars::float, flete_factura_id::int, flete_criterio
                                     from full_envio where organizacion_id = $1 and id = $2 for update`, [org, id])).rows[0];
  if (!e) throw new ErrorErp("Ese envío no existe.");
  if (!estados.includes(e.estado)) throw new ErrorErp(`El envío está «${ESTADOS_ENVIO[e.estado].texto}»: eso ya no se puede hacer.`);
  return e;
}

export async function guardarCabecera(org: string, id: number, d: { numero_ml: string | null; fecha_entrega: string | null; notas: string | null }) {
  const r = await consulta("update full_envio set numero_ml = $3, fecha_entrega = $4::date, notas = $5 where organizacion_id = $1 and id = $2 returning id",
    [org, id, d.numero_ml, d.fecha_entrega, d.notas]);
  if (!r.length) throw new ErrorErp("Ese envío no existe.");
}

export async function borrarEnvio(org: string, id: number) {
  await enTransaccion(async (c) => {
    await envioPara(c, org, id, ["borrador"]);
    await c.query("delete from full_envio where organizacion_id = $1 and id = $2", [org, id]);
  });
}

// ── Líneas ───────────────────────────────────────────────

/** La publicación de la cuenta para esa variación (la que lleva el Código ML de la etiqueta): la que
 *  ya está en Full, si no la que tiene el código, si no una activa. */
async function publicacionDe(org: string, canalId: number, variacionId: number) {
  return una<{ item_id: string; variation_id: string; codigo: string | null }>(`
    select m.item_id, coalesce(m.variation_id, '') variation_id, ${SQL_CODIGO} codigo
      from meli_item m join publicacion pu on pu.id = m.publicacion_id
     where m.organizacion_id = $1 and m.canal_id = $2 and pu.variacion_id = $3 and coalesce(m.estado, '') <> 'closed'
     order by (m.logistica = 'fulfillment') desc, (${SQL_CODIGO}) is null, (m.estado = 'active') desc, m.item_id limit 1`, [org, canalId, variacionId]);
}

/** Suma un producto al envío (si ya estaba, suma la cantidad). Avisa si la cuenta no lo publica. */
export async function agregarLinea(org: string, envioId: number, variacionId: number, cantidad: number): Promise<string | null> {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new ErrorErp("Poné cuántas unidades van.");
  const e = await envio(org, envioId);
  if (!e) throw new ErrorErp("Ese envío no existe.");
  if (e.estado !== "borrador") throw new ErrorErp("El envío ya salió: no se le pueden agregar productos.");
  const v = await una<{ sku: string }>("select sku from variacion where id = $1 and organizacion_id = $2", [variacionId, org]);
  if (!v) throw new ErrorErp("Ese producto no existe.");
  const pub = await publicacionDe(org, e.canal_id, variacionId);
  if (pub && !pub.codigo) await completarCodigoFull(org, e.canal_id, pub.item_id, pub.variation_id).catch(() => null);
  await consulta(`
    insert into full_envio_linea (organizacion_id, envio_id, variacion_id, item_id, variation_id, cantidad) values ($1, $2, $3, $4, $5, $6)
    on conflict (envio_id, variacion_id) do update set cantidad = full_envio_linea.cantidad + excluded.cantidad,
      item_id = coalesce(excluded.item_id, full_envio_linea.item_id), variation_id = excluded.variation_id`,
    [org, envioId, variacionId, pub?.item_id ?? null, pub?.variation_id ?? "", cantidad]);
  await prorratearFlete(org, envioId);
  return pub ? null : `${v.sku} no tiene publicación en ${e.canal}: para mandarlo a Full, primero publicalo en esa cuenta.`;
}

export async function cambiarCantidad(org: string, envioId: number, lineaId: number, cantidad: number) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new ErrorErp("Poné cuántas unidades van (para sacarlo, usá el tacho).");
  await enTransaccion(async (c) => {
    await envioPara(c, org, envioId, ["borrador"]);
    await c.query("update full_envio_linea set cantidad = $4 where organizacion_id = $1 and envio_id = $2 and id = $3", [org, envioId, lineaId, cantidad]);
  });
  await prorratearFlete(org, envioId);
}

export async function borrarLinea(org: string, envioId: number, lineaId: number) {
  await enTransaccion(async (c) => {
    await envioPara(c, org, envioId, ["borrador"]);
    await c.query("delete from full_envio_linea where organizacion_id = $1 and envio_id = $2 and id = $3", [org, envioId, lineaId]);
  });
  await prorratearFlete(org, envioId);
}

// ── Sugerencia y contexto de cada producto ───────────────

export type Contexto = {
  variacion_id: number; sku: string; titulo: string; vendidas_cuenta: number; vendidas_otros: number;
  en_full: number; en_camino: number; disponible_origen: number;
};

/** Para cada variación (las dadas, o las que la cuenta publica y vendió): cuánto vendió en la cuenta
 *  y en los demás canales en los últimos `dias`, cuánto hay en Full, en camino y en el origen. */
export async function contexto(org: string, e: Pick<Envio, "id" | "canal_id" | "deposito_full_id" | "deposito_origen_id">, dias: number, variaciones?: number[]): Promise<Contexto[]> {
  return consulta<Contexto>(`
    with vs as (
      select distinct v.id from variacion v
       where v.organizacion_id = $1 and (
         ($6::bigint[] is not null and v.id = any($6::bigint[]))
         or ($6::bigint[] is null and not es_kit(v.id) and v.estado <> 'archivada'
             and exists (select 1 from publicacion p where p.variacion_id = v.id and p.canal_id = $2 and p.estado <> 'cerrada')))
    ), ventas as (
      select l.variacion_id, coalesce(sum(l.cantidad) filter (where pe.canal_id = $2), 0)::int cuenta, coalesce(sum(l.cantidad) filter (where pe.canal_id <> $2), 0)::int otros
        from pedido pe join pedido_linea l on l.pedido_id = pe.id
       where pe.organizacion_id = $1 and pe.estado not in ('presupuesto', 'nuevo', 'cancelado', 'devuelto')
         and pe.fecha >= now() - make_interval(days => $5) and l.variacion_id in (select id from vs)
       group by l.variacion_id
    ), camino as (
      select l.variacion_id, sum(l.cantidad - l.recibido - l.faltante)::int n
        from full_envio_linea l join full_envio e on e.id = l.envio_id
       where e.organizacion_id = $1 and e.deposito_full_id = $3 and e.estado = 'despachado' and e.id <> $7
       group by l.variacion_id
    )
    select v.id::int variacion_id, v.sku, titulo_variacion(v.id) titulo, coalesce(ve.cuenta, 0) vendidas_cuenta, coalesce(ve.otros, 0) vendidas_otros,
           stock_disponible_deposito($1, v.id, $3) en_full, coalesce(ca.n, 0) en_camino, stock_disponible_deposito($1, v.id, $4) disponible_origen
      from vs join variacion v on v.id = vs.id left join ventas ve on ve.variacion_id = v.id left join camino ca on ca.variacion_id = v.id
     where $6::bigint[] is not null or coalesce(ve.cuenta, 0) > 0
     order by v.sku`, [org, e.canal_id, e.deposito_full_id, e.deposito_origen_id, dias, variaciones ?? null, e.id]);
}

/** Cuánto conviene mandar: lo que la cuenta vende en `diasFull` días, menos lo que ya hay en Full y en
 *  camino; sin bajar el origen de lo que los demás canales venden en `diasDejar` días. */
export function cantidadSugerida(x: Contexto, p: ParametrosSugerencia): number {
  const dias = Math.max(1, p.diasVentas);
  const necesita = Math.ceil((x.vendidas_cuenta / dias) * p.diasFull) - Math.max(0, x.en_full) - x.en_camino;
  const puede = x.disponible_origen - Math.ceil((x.vendidas_otros / dias) * p.diasDejar);
  return Math.max(0, Math.min(necesita, puede));
}

/** Suma al envío lo sugerido de los productos que todavía no tiene. Devuelve cuántos sumó. */
export async function agregarSugeridos(org: string, envioId: number, p: ParametrosSugerencia): Promise<{ agregados: number; unidades: number }> {
  const e = await envio(org, envioId);
  if (!e) throw new ErrorErp("Ese envío no existe.");
  if (e.estado !== "borrador") throw new ErrorErp("El envío ya salió: no se le pueden agregar productos.");
  const ya = new Set((await consulta<{ v: number }>("select variacion_id::int v from full_envio_linea where envio_id = $1", [envioId])).map((x) => x.v));
  const filas = await contexto(org, e, p.diasVentas);
  let agregados = 0, unidades = 0;
  for (const x of filas) {
    if (ya.has(x.variacion_id)) continue;
    const n = cantidadSugerida(x, p);
    if (n <= 0) continue;
    const pub = await publicacionDe(org, e.canal_id, x.variacion_id);
    await consulta(`insert into full_envio_linea (organizacion_id, envio_id, variacion_id, item_id, variation_id, cantidad) values ($1, $2, $3, $4, $5, $6)
                    on conflict (envio_id, variacion_id) do nothing`, [org, envioId, x.variacion_id, pub?.item_id ?? null, pub?.variation_id ?? "", n]);
    agregados++; unidades += n;
  }
  if (agregados) await prorratearFlete(org, envioId);
  return { agregados, unidades };
}

// ── Despachar, recibir, cerrar ───────────────────────────

async function moverStock(c: Consultor, org: string, variacion: number, tipo: string, cantidad: number, origen: number | null, destino: number | null,
  envioId: number, usuario: string, nota: string | null, kit: number | null = null) {
  await c.query("select mover_stock($1, $2, $3, $4, $5, $6, 'full_envio', $7, $8, $9, $10)",
    [org, variacion, tipo, cantidad, origen, destino, String(envioId), usuario, nota, kit]);
}

/** Pasa `cantidad` de una variación del depósito `deposito` (de las ubicaciones con disponible, por
 *  orden de recorrido) a la ubicación `destino`. Un kit se pasa componente por componente. Si no
 *  alcanza, no mueve nada (la transacción se deshace) y dice cuánto hay. */
async function sacarDelDeposito(c: Consultor, org: string, variacion: number, cantidad: number, deposito: number, destino: number,
  envioId: number, usuario: string, kit: number | null = null, nivel = 0): Promise<void> {
  if (nivel > 5) throw new ErrorErp("El kit tiene demasiados niveles.");
  const comps = (await c.query<{ v: string; n: number }>(
    "select variacion_componente_id v, cantidad n from kit_componente where variacion_kit_id = $1 and not sobrante", [variacion])).rows;
  if (comps.length) {
    for (const k of comps) await sacarDelDeposito(c, org, Number(k.v), cantidad * k.n, deposito, destino, envioId, usuario, kit ?? variacion, nivel + 1);
    return;
  }
  const ubics = (await c.query<{ id: string; disp: number }>(`
    select ub.id, (s.cantidad - s.reservado)::int disp from ubicacion ub join stock s on s.ubicacion_id = ub.id and s.variacion_id = $1
     where ub.deposito_id = $2 and ub.estado = 'activa' and s.cantidad - s.reservado > 0 order by ub.orden_recorrido, ub.codigo`, [variacion, deposito])).rows;
  const hay = ubics.reduce((t, u) => t + u.disp, 0);
  if (hay < cantidad) {
    const v = (await c.query<{ sku: string; dep: string }>("select v.sku, d.nombre dep from variacion v, deposito d where v.id = $1 and d.id = $2", [variacion, deposito])).rows[0];
    throw new ErrorErp(`No alcanza el stock de ${v?.sku ?? variacion} en ${v?.dep ?? "el depósito"}: hay ${hay} disponibles y el envío lleva ${cantidad}.`);
  }
  let resta = cantidad;
  for (const u of ubics) {
    if (resta <= 0) break;
    const toma = Math.min(resta, u.disp);
    await moverStock(c, org, variacion, "transferencia", toma, Number(u.id), destino, envioId, usuario, "Sale para Full", kit);
    resta -= toma;
  }
}

/** Despachar: las unidades pasan del depósito de origen a la ubicación de este envío en
 *  "En camino a Full". Desde ahí no se venden por ningún canal. */
export async function despachar(org: string, envioId: number, usuario: string): Promise<{ productos: number; unidades: number }> {
  return enTransaccion(async (c) => {
    const e = await envioPara(c, org, envioId, ["borrador"]);
    const lineas = (await c.query<{ variacion_id: string; cantidad: number }>("select variacion_id, cantidad from full_envio_linea where envio_id = $1 order by id", [envioId])).rows;
    if (!lineas.length) throw new ErrorErp("El envío no tiene productos.");
    const transito = await asegurarTransito(c, org);
    const codigo = `ENVIO-${envioId}`;
    const u = (await c.query<{ id: string }>(`
      insert into ubicacion (organizacion_id, deposito_id, codigo, descripcion) values ($1, $2, $3, $4)
      on conflict (deposito_id, codigo) do update set estado = 'activa' returning id`, [org, transito, codigo, `Envío a Full ${envioId}`])).rows[0];
    const ubic = Number(u.id);
    for (const l of lineas) await sacarDelDeposito(c, org, Number(l.variacion_id), l.cantidad, e.deposito_origen_id, ubic, envioId, usuario);
    await c.query("update full_envio set estado = 'despachado', ubicacion_transito_id = $3, despachado_ts = now() where organizacion_id = $1 and id = $2", [org, envioId, ubic]);
    return { productos: lineas.length, unidades: lineas.reduce((t, l) => t + l.cantidad, 0) };
  });
}

/** Recibe en Full `cantidad` de una línea (de "En camino" a la general del depósito Full). Si con
 *  eso llegó todo el envío, queda "Recibido". Para usar dentro de una transacción. */
export async function recibirLinea(c: Consultor, org: string, lineaId: number, cantidad: number, usuario: string, nota: string): Promise<void> {
  const l = (await c.query<{ envio_id: string; variacion_id: string; pendiente: number; ubic: string | null; full: string }>(`
    select l.envio_id, l.variacion_id, (l.cantidad - l.recibido - l.faltante)::int pendiente, e.ubicacion_transito_id ubic, e.deposito_full_id "full"
      from full_envio_linea l join full_envio e on e.id = l.envio_id
     where l.organizacion_id = $1 and l.id = $2 and e.estado = 'despachado' for update of l`, [org, lineaId])).rows[0];
  if (!l || !l.ubic) throw new ErrorErp("Esa línea no está en camino.");
  const n = Math.min(cantidad, l.pendiente);
  if (n <= 0) return;
  const general = await ubicacionGeneral(c, Number(l.full));
  await moverStock(c, org, Number(l.variacion_id), "transferencia", n, Number(l.ubic), general, Number(l.envio_id), usuario, nota);
  await c.query("update full_envio_linea set recibido = recibido + $2 where id = $1", [lineaId, n]);
  await c.query(`update full_envio e set estado = 'recibido', recibido_ts = now()
                  where e.id = $1 and e.estado = 'despachado'
                    and not exists (select 1 from full_envio_linea x where x.envio_id = e.id and x.cantidad > x.recibido + x.faltante)`, [l.envio_id]);
}

/** Recibir a mano lo que falta de una línea (si la lectura de Full no anda). */
export async function recibirAMano(org: string, envioId: number, lineaId: number, cantidad: number, usuario: string) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new ErrorErp("Poné cuántas unidades llegaron.");
  await enTransaccion(async (c) => {
    await envioPara(c, org, envioId, ["despachado"]);
    await recibirLinea(c, org, lineaId, cantidad, usuario, "Recibido en Full (a mano)");
  });
}

/** Cerrar un envío en camino: lo que no llegó vuelve al depósito de origen o se da por perdido. */
export async function cerrarEnvio(org: string, envioId: number, faltantes: "volver" | "perdido", usuario: string): Promise<number> {
  return enTransaccion(async (c) => {
    const e = await envioPara(c, org, envioId, ["despachado"]);
    const lineas = (await c.query<{ id: string; variacion_id: string; pendiente: number }>(
      "select id, variacion_id, (cantidad - recibido - faltante)::int pendiente from full_envio_linea where envio_id = $1 and cantidad > recibido + faltante", [envioId])).rows;
    const origen = await ubicacionGeneral(c, e.deposito_origen_id);
    let total = 0;
    for (const l of lineas) {
      if (faltantes === "volver") await moverStock(c, org, Number(l.variacion_id), "transferencia", l.pendiente, e.ubicacion_transito_id, origen, envioId, usuario, "No llegó a Full: vuelve al depósito");
      else await moverStock(c, org, Number(l.variacion_id), "egreso", l.pendiente, e.ubicacion_transito_id, null, envioId, usuario, "No llegó a Full: perdido");
      await c.query("update full_envio_linea set faltante = faltante + $2 where id = $1", [l.id, l.pendiente]);
      total += l.pendiente;
    }
    await c.query(`update full_envio set estado = case when $3 > 0 then 'cerrado' else 'recibido' end, cerrado_ts = now(),
                          recibido_ts = coalesce(recibido_ts, case when $3 = 0 then now() end)
                    where organizacion_id = $1 and id = $2`, [org, envioId, total]);
    if (e.ubicacion_transito_id) await c.query("update ubicacion set estado = 'archivada' where id = $1 and not exists (select 1 from stock s where s.ubicacion_id = $1 and (s.cantidad <> 0 or s.reservado <> 0))", [e.ubicacion_transito_id]);
    return total;
  });
}

// ── Flete ────────────────────────────────────────────────

/** Lo que cuesta una factura de gasto, en pesos y sin IVA (el IVA es crédito fiscal): neto + no
 *  gravado + otros impuestos, a su cotización. Una nota de crédito resta. */
export async function montoFactura(org: string, facturaId: number): Promise<number> {
  const f = await una<{ m: number }>(`
    select round((neto + no_gravado + otros_impuestos) * coalesce(nullif(cotizacion, 0), 1) * case when es_nota_credito then -1 else 1 end, 2)::float m
      from factura_compra where organizacion_id = $1 and id = $2 and estado <> 'anulada'`, [org, facturaId]);
  if (!f) throw new ErrorErp("Esa factura no existe o está anulada.");
  return f.m;
}

/** Las facturas de compra para vincular como flete (las del último año, la más nueva primero). */
export async function facturasParaFlete(org: string, incluir: number | null): Promise<{ id: number; texto: string }[]> {
  return consulta<{ id: number; texto: string }>(`
    select f.id::int, concat_ws(' · ', to_char(f.fecha, 'DD/MM/YYYY'), pr.nombre,
             f.letra || ' ' || coalesce(lpad(f.punto_venta::text, 5, '0') || '-' || lpad(f.numero::text, 8, '0'), 's/n'),
             '$ ' || to_char(f.total_ars, 'FM999G999G999D00')) texto
      from factura_compra f join proveedor pr on pr.id = f.proveedor_id
     where f.organizacion_id = $1 and f.estado <> 'anulada' and (f.fecha >= current_date - 365 or f.id = $2)
     order by f.fecha desc, f.id desc limit 500`, [org, incluir]);
}

export async function guardarFlete(org: string, envioId: number, d: { monto: number | null; facturaId: number | null; criterio: CriterioFlete }) {
  let monto = d.monto;
  if (monto == null && d.facturaId) monto = await montoFactura(org, d.facturaId);
  if (monto != null && monto < 0) throw new ErrorErp("El flete no puede ser negativo.");
  const r = await consulta("update full_envio set flete_ars = $3, flete_factura_id = $4, flete_criterio = $5 where organizacion_id = $1 and id = $2 returning id",
    [org, envioId, monto, d.facturaId, d.criterio]);
  if (!r.length) throw new ErrorErp("Ese envío no existe.");
  await prorratearFlete(org, envioId);
}

export type LineaReparto = { id: number; sku: string; cantidad: number; volumen: number | null; peso: number | null; valor: number | null };

/** Reparte el flete entre las líneas según el criterio. Si a alguna le falta el dato (medidas, peso,
 *  costo), se reparte por unidades y se dice a cuáles les falta. Devuelve el flete por unidad de cada línea. */
export function repartirFlete(lineas: LineaReparto[], criterio: CriterioFlete, flete: number | null):
  { porUnidad: Map<number, number | null>; usado: CriterioFlete; sinDato: string[] } {
  const dato = (l: LineaReparto) => (criterio === "volumen" ? l.volumen : criterio === "peso" ? l.peso : criterio === "valor" ? l.valor : 1);
  const sinDato = criterio === "unidades" ? [] : lineas.filter((l) => !(Number(dato(l)) > 0)).map((l) => l.sku);
  const usado: CriterioFlete = sinDato.length ? "unidades" : criterio;
  const peso = (l: LineaReparto) => l.cantidad * (usado === "unidades" ? 1 : Number(dato(l)));
  const total = lineas.reduce((t, l) => t + peso(l), 0);
  const porUnidad = new Map<number, number | null>();
  for (const l of lineas) porUnidad.set(l.id, flete == null || !total || !l.cantidad ? null : Math.round((flete * peso(l) / total / l.cantidad) * 10000) / 10000);
  return { porUnidad, usado, sinDato };
}

/** Las líneas con lo que hace falta para repartir el flete. */
export async function lineasReparto(org: string, envioId: number): Promise<LineaReparto[]> {
  return consulta<LineaReparto>(`
    select l.id::int, v.sku, l.cantidad,
           (pr.largo_cm * pr.ancho_cm * pr.alto_cm)::float volumen, pr.peso_g::float peso,
           coalesce(v.costo_promedio_usd * tc_del_dia($1), v.costo_promedio_ars, v.costo_ultimo_usd * tc_del_dia($1), v.costo_ultimo_ars,
                    case when v.costo_moneda = 'ARS' then v.costo_fob else v.costo_fob * tc_del_dia($1) end)::float valor
      from full_envio_linea l join variacion v on v.id = l.variacion_id join producto pr on pr.id = v.producto_id
     where l.organizacion_id = $1 and l.envio_id = $2 order by l.id`, [org, envioId]);
}

/** Recalcula el flete por unidad de cada línea (con cada cambio de flete o de líneas). */
export async function prorratearFlete(org: string, envioId: number): Promise<void> {
  const e = await una<{ flete_ars: number | null; flete_criterio: CriterioFlete }>("select flete_ars::float, flete_criterio from full_envio where organizacion_id = $1 and id = $2", [org, envioId]);
  if (!e) return;
  const lineas = await lineasReparto(org, envioId);
  const { porUnidad } = repartirFlete(lineas, e.flete_criterio, e.flete_ars);
  for (const l of lineas) await consulta("update full_envio_linea set flete_unit_ars = $2 where id = $1", [l.id, porUnidad.get(l.id) ?? null]);
}
