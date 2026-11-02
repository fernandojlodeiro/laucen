// Control de stock (Fer, 29/10): en los ratos libres alguien recorre el depósito con el celular y confirma, de a un
// producto en una ubicación, si está. Tablas en db/deposito.sql (control_stock, control_stock_toma y el depósito
// especial «En búsqueda»).
//
// Qué se controla: el stock (> 0) de los depósitos propios que venden por algún canal activo. Cada «lugar» es una
// variación en una ubicación. Está pendiente si nunca se controló, si su último control tiene más de DIAS_CONTROL
// días o si después de ese control le entró mercadería (ingreso, devolución, transferencia o ajuste que suma, salvo
// los del propio control): cada ingreso pide un control.
// Orden: primero lo de menos stock (el total de la variación en esos depósitos) y, con el mismo stock, lo de más
// plata en stock (total × precio de venta de la lista por defecto).
// Resultados: «Está» no mueve nada (si contó de más, suma la diferencia: sobrante); «No está» resta lo que falta con
// un ajuste; «A buscar» pasa lo que falta al depósito «En búsqueda», que no vende por ningún canal (el disponible baja
// y las publicaciones se pausan como con cualquier cambio de stock), hasta que en «A buscar» se dice si apareció
// (vuelve a una ubicación) o no (se ajusta). Todo con mover_stock, referencia 'control_stock' = id del control.

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { moverStock } from "@/lib/stock";

export const DIAS_CONTROL = 60;
/** Minutos que una tarjeta queda apartada para quien la tiene en pantalla; «Saltar» la aparta para esa persona. */
const MINUTOS_TOMA = 10;
const MINUTOS_SALTAR = 120;

export type Resultado = "ok" | "faltante" | "a_buscar" | "sobrante";
export const RESULTADOS: Record<Resultado, string> = { ok: "Está", faltante: "No está", a_buscar: "A buscar", sobrante: "Sobrante" };

/** Las fotos de una variación (alias `v` con producto_id): las suyas, las del producto o las de su publicación de ML. */
const SQL_FOTOS = `coalesce(
  (select array_agg(x.url order by x.orden) from variacion_foto x where x.variacion_id = v.id),
  (select array_agg(x.url order by x.orden) from producto_foto x where x.producto_id = v.producto_id),
  (select array(select coalesce(x ->> 'secure_url', x ->> 'url') from jsonb_array_elements(mm.p) x)
     from (select m.datos_externos -> 'ml' -> 'pictures' p
             from publicacion pu join meli_item m on m.canal_id = pu.canal_id and m.item_id = pu.id_externo
            where pu.variacion_id = v.id and pu.id_externo is not null
              and jsonb_typeof(m.datos_externos -> 'ml' -> 'pictures') = 'array' and jsonb_array_length(m.datos_externos -> 'ml' -> 'pictures') > 0
            order by (m.estado = 'active') desc limit 1) mm))`;

/** Precio de venta unitario (lista por defecto) de la variación `expr`; $1 = organización. */
const sqlPrecio = (expr: string) => `(select venta_ars from precio_de($1, ${expr}, lista_por_defecto($1)))`;

/** Los lugares a controlar con su estado ($1 = organización). Columnas: variacion_id, ubicacion_id, cantidad,
 *  reservado, deposito, codigo (General si es la de por defecto), sin_lugar (General o A UBICAR), con_ml (publicación
 *  activa en Mercado Libre, propia o de un kit que la lleva), orden_recorrido,
 *  total (de la variación), ultimo_ts, ingreso_ts (el último ingreso de los últimos DIAS_CONTROL días),
 *  pendiente, por_ingreso. */
export const SQL_LUGARES = `
  with dep as (
    select d.id, d.nombre from deposito d
     where d.organizacion_id = $1 and d.estado = 'activo' and d.tipo = 'propio' and d.especial is null
       and exists (select 1 from canal_deposito cd join canal ca on ca.id = cd.canal_id and ca.estado = 'activo' where cd.deposito_id = d.id)
  ), ml as (
    -- Con una publicación activa en Mercado Libre: la variación, o un componente de un kit publicado.
    select pu.variacion_id from publicacion pu join canal ca on ca.id = pu.canal_id and ca.tipo = 'mercadolibre' and ca.estado = 'activo'
     where pu.organizacion_id = $1 and pu.estado = 'activa'
    union
    select k.variacion_componente_id from kit_componente k
      join publicacion pu on pu.variacion_id = k.variacion_kit_id and pu.estado = 'activa'
      join canal ca on ca.id = pu.canal_id and ca.tipo = 'mercadolibre' and ca.estado = 'activo'
     where k.organizacion_id = $1
  ), lug as (
    select s.variacion_id, s.ubicacion_id, s.cantidad, s.reservado, dep.nombre deposito,
           case when u.es_default then 'General' else u.codigo end codigo, u.orden_recorrido,
           (u.es_default or upper(trim(u.codigo)) = 'A UBICAR') sin_lugar,
           s.variacion_id in (select variacion_id from ml) con_ml
      from stock s join ubicacion u on u.id = s.ubicacion_id join dep on dep.id = u.deposito_id
     where s.organizacion_id = $1 and s.cantidad > 0
  ), tot as (
    select variacion_id, sum(cantidad)::int total from lug group by 1
  ), ult as (
    select distinct on (c.variacion_id, c.ubicacion_id) c.variacion_id, c.ubicacion_id, c.ts
      from control_stock c where c.organizacion_id = $1
     order by c.variacion_id, c.ubicacion_id, c.ts desc
  ), ing as (
    select m.variacion_id, m.ubicacion_destino_id ubicacion_id, max(m.fecha) fecha
      from movimiento_stock m
     where m.organizacion_id = $1 and m.ubicacion_destino_id is not null and m.tipo in ('ingreso', 'devolucion', 'transferencia', 'ajuste')
       and coalesce(m.referencia_tipo, '') <> 'control_stock' and m.fecha > now() - interval '${DIAS_CONTROL} days'
     group by 1, 2
  ), lugares as (
    select lug.*, tot.total, ult.ts ultimo_ts, ing.fecha ingreso_ts,
           (ult.ts is null or ult.ts < now() - interval '${DIAS_CONTROL} days' or ing.fecha > ult.ts) pendiente,
           coalesce(ing.fecha > coalesce(ult.ts, '-infinity'::timestamptz), false) por_ingreso
      from lug join tot using (variacion_id)
      left join ult using (variacion_id, ubicacion_id)
      left join ing using (variacion_id, ubicacion_id)
  )`;

export type Tarjeta = {
  variacion_id: number; ubicacion_id: number; producto_id: number; sku: string; titulo: string; fotos: string[] | null;
  deposito: string; codigo: string; sin_lugar: boolean; cantidad: number; reservado: number; total: number;
  precio: number | null; ultimo: string | null; ingreso: string | null; por_ingreso: boolean;
};

/** Los tildes de la cola (los dos prendidos de entrada). */
export type FiltroCola = {
  /** Sin GENERAL ni A UBICAR (lo que no tiene una ubicación fija: notebooks y demás). */
  sinLugar: boolean;
  /** Sólo lo que tiene una publicación activa en Mercado Libre (el stock viejo sin publicar no aparece). */
  soloMl: boolean;
};
export const FILTRO_DE_ENTRADA: FiltroCola = { sinLugar: true, soloMl: true };
/** Condición de la cola sobre `l` (alias de lugares); $2 = sinLugar, $3 = soloMl. */
const SQL_FILTRO = "not ($2 and l.sin_lugar) and (not $3 or l.con_ml)";

/** Cuántos lugares están pendientes (para el botón del celular y la pestaña). */
export async function pendientes(org: string, f: FiltroCola = FILTRO_DE_ENTRADA): Promise<number> {
  const r = await una<{ n: number }>(`${SQL_LUGARES} select count(*)::int n from lugares l where l.pendiente and ${SQL_FILTRO}`, [org, f.sinLugar, f.soloMl]);
  return r?.n ?? 0;
}

/** La próxima tarjeta para esta persona, y la aparta para que no le salga a otra. */
export async function proximaTarjeta(org: string, usuario: string, f: FiltroCola): Promise<Tarjeta | null> {
  return enTransaccion(async (c) => {
    // Lo que tenía en pantalla se suelta (si sigue pendiente, vuelve a salir primera); lo vencido se borra.
    await c.query("delete from control_stock_toma where organizacion_id = $1 and (hasta < now() or (usuario_id = $2 and not saltada))", [org, usuario]);
    const t = (await c.query<Tarjeta>(`${SQL_LUGARES}
      , cola as (
        select l.* from lugares l
         where l.pendiente and ${SQL_FILTRO}
           and not exists (select 1 from control_stock_toma t where t.variacion_id = l.variacion_id and t.ubicacion_id = l.ubicacion_id
                             and t.organizacion_id = $1 and t.hasta > now() and (t.usuario_id <> $4 or t.saltada))
      ), pre as (
        select x.variacion_id, ${sqlPrecio("x.variacion_id")}::float8 precio from (select distinct variacion_id from cola) x
      ), elegida as (
        select cola.*, pre.precio from cola join pre using (variacion_id)
         order by cola.total, cola.total * pre.precio desc nulls last, cola.variacion_id, cola.orden_recorrido, cola.codigo
         limit 1
      )
      select e.variacion_id::int, e.ubicacion_id::int, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo, ${SQL_FOTOS} fotos,
             e.deposito, e.codigo, e.sin_lugar, e.cantidad, e.reservado, e.total, e.precio,
             to_char(e.ultimo_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY') ultimo,
             to_char(e.ingreso_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY') ingreso, e.por_ingreso
        from elegida e join variacion v on v.id = e.variacion_id`, [org, f.sinLugar, f.soloMl, usuario])).rows[0];
    if (!t) return null;
    await c.query(`insert into control_stock_toma (organizacion_id, variacion_id, ubicacion_id, usuario_id, saltada, hasta)
                   values ($1, $2, $3, $4, false, now() + interval '${MINUTOS_TOMA} minutes')
                   on conflict (variacion_id, ubicacion_id, usuario_id) do update set saltada = false, hasta = excluded.hasta`,
      [org, t.variacion_id, t.ubicacion_id, usuario]);
    return t;
  });
}

/** «Saltar»: esta persona no la vuelve a ver por un rato (no se registra ningún control). */
export async function saltar(org: string, usuario: string, variacionId: number, ubicacionId: number): Promise<void> {
  await consulta(`insert into control_stock_toma (organizacion_id, variacion_id, ubicacion_id, usuario_id, saltada, hasta)
                  values ($1, $2, $3, $4, true, now() + interval '${MINUTOS_SALTAR} minutes')
                  on conflict (variacion_id, ubicacion_id, usuario_id) do update set saltada = true, hasta = excluded.hasta`,
    [org, variacionId, ubicacionId, usuario]);
}

/** La ubicación (General) del depósito «En búsqueda»; si no existe, lo crea. */
export async function ubicacionEnBusqueda(org: string, c: Consultor): Promise<number> {
  let d = (await c.query<{ id: string }>("select id from deposito where organizacion_id = $1 and especial = 'en_busqueda'", [org])).rows[0];
  if (!d) {
    d = (await c.query<{ id: string }>(`insert into deposito (organizacion_id, nombre, tipo, usa_ubicaciones, especial)
      values ($1, 'En búsqueda', 'propio', false, 'en_busqueda')
      on conflict (organizacion_id, nombre) do update set especial = 'en_busqueda' returning id`, [org])).rows[0];
    await c.query("delete from canal_deposito where deposito_id = $1", [d.id]);
  }
  const u = (await c.query<{ id: string }>("select id from ubicacion where deposito_id = $1 and es_default", [d.id])).rows[0];
  if (!u) throw new ErrorErp("El depósito «En búsqueda» no tiene su ubicación general.");
  return Number(u.id);
}

export type PedidoReservado = { id: number; cantidad: number };

/** Los pedidos que tienen reservada la variación (reservas − liberaciones − ventas de cada pedido). */
export async function pedidosQueLaReservan(org: string, variacionId: number): Promise<PedidoReservado[]> {
  return consulta<PedidoReservado>(`
    select m.referencia_id::bigint::int id, sum(case m.tipo when 'reserva' then m.cantidad else -m.cantidad end)::int cantidad
      from movimiento_stock m
     where m.organizacion_id = $1 and m.variacion_id = $2 and m.referencia_tipo = 'pedido' and m.referencia_id ~ '^\\d+$'
       and m.tipo in ('reserva', 'liberacion', 'venta')
     group by 1 having sum(case m.tipo when 'reserva' then m.cantidad else -m.cantidad end) > 0
     order by 1`, [org, variacionId]);
}

export type Registro = {
  /** Qué tocó: ok = «Está», faltante = «No está», a_buscar = «A buscar». */
  boton: "ok" | "faltante" | "a_buscar";
  variacionId: number; ubicacionId: number;
  /** Lo que decía el sistema cuando se mostró la tarjeta (si cambió, no se registra). */
  sistema: number;
  /** Cuántas vio. Con «No está» o «A buscar» y sin cambiarla (igual al sistema), no está ninguna. */
  contado: number;
};

export type Registrado = { resultado: Resultado; diferencia: number; sku: string; codigo: string; quedan: number; reservado: number; controlId: number };

/** Registra un control y mueve el stock según el botón. Devuelve lo que pasó. */
export async function registrarControl(org: string, usuario: string, r: Registro): Promise<Registrado> {
  return enTransaccion(async (c) => {
    const st = (await c.query<{ cantidad: number; reservado: number; sku: string; codigo: string }>(`
      select s.cantidad, s.reservado, v.sku, case when u.es_default then 'General' else u.codigo end codigo
        from stock s join variacion v on v.id = s.variacion_id join ubicacion u on u.id = s.ubicacion_id
       where s.organizacion_id = $1 and s.variacion_id = $2 and s.ubicacion_id = $3 for update of s`, [org, r.variacionId, r.ubicacionId])).rows[0];
    if (!st) throw new ErrorErp("Ese producto ya no está en esa ubicación según el sistema. Te muestro el próximo.");
    if (st.cantidad !== r.sistema) {
      throw new ErrorErp(`Mientras lo mirabas cambió el stock de ${st.sku} en ${st.codigo} (decía ${r.sistema}, ahora dice ${st.cantidad}). Te lo muestro de nuevo con lo actual.`);
    }
    if (!Number.isInteger(r.contado) || r.contado < 0) throw new ErrorErp("La cantidad que ves tiene que ser un número entero (0 o más).");

    let resultado: Resultado;
    let contado = r.contado;
    let diferencia = 0;
    if (r.boton === "ok") {
      if (contado < st.cantidad) throw new ErrorErp(`Contaste ${contado} y el sistema dice ${st.cantidad}: si faltan, tocá «No está» o «A buscar».`);
      resultado = contado > st.cantidad ? "sobrante" : "ok";
      diferencia = contado - st.cantidad;
    } else {
      if (contado >= st.cantidad) contado = 0; // sin cambiar la cantidad: no está ninguna
      resultado = r.boton;
      diferencia = st.cantidad - contado;
    }

    const control = (await c.query<{ id: string }>(`
      insert into control_stock (organizacion_id, variacion_id, ubicacion_id, sistema, contado, resultado, diferencia, precio_ars, usuario_id, buscando)
      values ($1, $2, $3, $4, $5, $6, $7, ${sqlPrecio("$2::bigint")}, $8, $9) returning id`,
      [org, r.variacionId, r.ubicacionId, st.cantidad, contado, resultado, diferencia, usuario, resultado === "a_buscar"])).rows[0];
    const referencia = { tipo: "control_stock", id: control.id };

    if (resultado === "sobrante") {
      await moverStock(org, { variacionId: r.variacionId, tipo: "ajuste", cantidad: diferencia, destinoId: r.ubicacionId,
        referencia, usuarioId: usuario, nota: `Control de stock: había ${diferencia} de más` }, c);
    } else if (resultado === "faltante") {
      await moverStock(org, { variacionId: r.variacionId, tipo: "ajuste", cantidad: diferencia, origenId: r.ubicacionId,
        referencia, usuarioId: usuario, nota: `Control de stock: no está${contado ? ` (faltan ${diferencia})` : ""}` }, c);
    } else if (resultado === "a_buscar") {
      await moverStock(org, { variacionId: r.variacionId, tipo: "transferencia", cantidad: diferencia, origenId: r.ubicacionId,
        destinoId: await ubicacionEnBusqueda(org, c), referencia, usuarioId: usuario,
        nota: `Control de stock: a buscar (no estaba en ${st.codigo})` }, c);
    }
    await c.query("delete from control_stock_toma where variacion_id = $1 and ubicacion_id = $2", [r.variacionId, r.ubicacionId]);
    return { resultado, diferencia, sku: st.sku, codigo: st.codigo, quedan: st.cantidad + (resultado === "sobrante" ? diferencia : -diferencia),
      reservado: st.reservado, controlId: Number(control.id) };
  });
}

/** Resuelve un «A buscar»: `aparecieron` unidades vuelven a `ubicacionId`; el resto se da por faltante (ajuste). */
export async function resolverBusqueda(org: string, usuario: string, controlId: number, aparecieron: number, ubicacionId: number | null): Promise<{ sku: string; aparecieron: number; perdidas: number; variacionId: number }> {
  return enTransaccion(async (c: PoolClient) => {
    const k = (await c.query<{ variacion_id: string; ubicacion_id: string; diferencia: number; sku: string }>(`
      select k.variacion_id, k.ubicacion_id, k.diferencia, v.sku from control_stock k join variacion v on v.id = k.variacion_id
       where k.id = $2 and k.organizacion_id = $1 and k.buscando for update of k`, [org, controlId])).rows[0];
    if (!k) throw new ErrorErp("Ese producto ya se resolvió.");
    if (!Number.isInteger(aparecieron) || aparecieron < 0 || aparecieron > k.diferencia) {
      throw new ErrorErp(`Pueden aparecer entre 0 y ${k.diferencia}.`);
    }
    const destino = ubicacionId ?? Number(k.ubicacion_id);
    if (aparecieron > 0) {
      const u = (await c.query(`select 1 from ubicacion u join deposito d on d.id = u.deposito_id
        where u.id = $2 and u.organizacion_id = $1 and u.estado = 'activa' and d.estado = 'activo' and d.especial is null`, [org, destino])).rows[0];
      if (!u) throw new ErrorErp("Elegí la ubicación donde apareció.");
    }
    const enBusqueda = await ubicacionEnBusqueda(org, c);
    const variacionId = Number(k.variacion_id);
    const referencia = { tipo: "control_stock", id: controlId };
    const perdidas = k.diferencia - aparecieron;
    if (aparecieron > 0) {
      await moverStock(org, { variacionId, tipo: "transferencia", cantidad: aparecieron, origenId: enBusqueda, destinoId: destino,
        referencia, usuarioId: usuario, nota: "Control de stock: apareció" }, c);
    }
    if (perdidas > 0) {
      await moverStock(org, { variacionId, tipo: "ajuste", cantidad: perdidas, origenId: enBusqueda,
        referencia, usuarioId: usuario, nota: "Control de stock: no apareció" }, c);
    }
    await c.query(`update control_stock set buscando = false, aparecieron = $3, resuelto_ubicacion_id = $4, resuelto_por = $5, resuelto_ts = now()
                    where id = $2 and organizacion_id = $1`, [org, controlId, aparecieron, aparecieron > 0 ? destino : null, usuario]);
    return { sku: k.sku, aparecieron, perdidas, variacionId };
  });
}

export type Buscando = {
  id: number; variacion_id: number; producto_id: number; sku: string; titulo: string; fotos: string[] | null;
  ubicacion_id: number; deposito: string; codigo: string; diferencia: number; precio: number | null; fecha: string; persona: string | null;
};

/** Los «A buscar» sin resolver, del más viejo al más nuevo. */
export async function buscandoAhora(org: string): Promise<Buscando[]> {
  return consulta<Buscando>(`
    select k.id::int, k.variacion_id::int, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo, ${SQL_FOTOS} fotos,
           k.ubicacion_id::int, d.nombre deposito, case when u.es_default then 'General' else u.codigo end codigo, k.diferencia,
           k.precio_ars::float8 precio, to_char(k.ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY HH24:MI') fecha,
           coalesce(us.nombre, us.email) persona
      from control_stock k join variacion v on v.id = k.variacion_id
      join ubicacion u on u.id = k.ubicacion_id join deposito d on d.id = u.deposito_id
      left join usuarios us on us.id = k.usuario_id
     where k.organizacion_id = $1 and k.buscando
     order by k.ts, k.id`, [org]);
}
