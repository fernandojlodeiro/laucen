// Preventa (pedido de Fer, 5/11; bitácora #1106). La cuenta única de «¿está en preventa?»: la usan la tienda, la
// carga a mano, Mercado Libre, las pantallas de stock y la sugerencia de compra. Tablas en db/preventa.sql.
//
// Para una variación y un canal (web o Mercado Libre), hay preventa cuando:
//   1. el disponible físico del canal (físico − reservado de los depósitos del canal) es 0 o menos;
//   2. el producto la admite en ese canal (lo suyo; si no, lo general) y no tiene «No publicable» ni, para Mercado
//      Libre, «Jamás publicar en Mercado Libre»;
//   3. hay una orden en camino con «Publicar» prendido para ese canal y con saldo: se ofrece UNA sola orden por vez, la
//      primera que se publicó en ese canal (aunque después otra llegue antes), y recién cuando se agota pasa a la
//      siguiente. Cupo = lo que falta que traiga − el margen de seguridad − lo ya vendido en preventa de esa orden.
//   En Mercado Libre además la fecha de esa orden para ML tiene que caber en el tope de días de demora.
// Un kit entra en preventa si TODOS sus componentes vienen en la misma orden con cupo; su cupo lo marca el más escaso.
// Precio de preventa = el normal del canal − el descuento (el del producto; si no, el de la orden; si no, el general).
// Margen de seguridad: unidades y % (el menor o el mayor de los dos, redondeado para arriba), el más particular gana.
//
// Reglas fijas: un pedido sale entero del físico o entero de UNA orden (nunca mezcla); lo vendido en preventa queda
// como «reserva de entrante» de su orden y, al llegar la mercadería, pasa a ser reserva física, por orden de compra.

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { hoyArgentina } from "@/lib/rango-fechas";

// ── Configuración ─────────────────────────────────────────

export type ModoMargen = "menor" | "mayor";
export type ConfigPreventa = {
  /** Si un producto sin lo suyo cargado admite preventa en la web / en Mercado Libre. De entrada, no. */
  admiteWeb: boolean; admiteMl: boolean;
  margenUnidades: number | null; margenPct: number | null; margenModo: ModoMargen;
  descuentoPct: number;
  /** % del pedido que se pide de seña en la web. */
  senaPct: number;
  /** Días para pagar el saldo desde que llega la mercadería. */
  plazoSaldoDias: number;
  /** Tope de días de demora que acepta Mercado Libre (después de eso, la orden no se ofrece ahí). */
  mlMaxDias: number;
};
export const CONFIG_PREVENTA: ConfigPreventa = {
  admiteWeb: false, admiteMl: false, margenUnidades: 5, margenPct: 10, margenModo: "menor", descuentoPct: 0, senaPct: 30, plazoSaldoDias: 7, mlMaxDias: 45,
};

export async function configPreventa(org: string, c?: Consultor): Promise<ConfigPreventa> {
  const sql = "select valor from config_org where organizacion_id = $1 and clave = 'preventa'";
  const f = c ? (await c.query<{ valor: Partial<ConfigPreventa> }>(sql, [org])).rows[0] : await una<{ valor: Partial<ConfigPreventa> }>(sql, [org]).catch(() => null);
  return { ...CONFIG_PREVENTA, ...(f?.valor ?? {}) };
}

export async function guardarConfigPreventa(org: string, cfg: ConfigPreventa): Promise<void> {
  if (cfg.margenUnidades != null && !(Number.isInteger(cfg.margenUnidades) && cfg.margenUnidades >= 0)) throw new ErrorErp("El margen en unidades tiene que ser un entero.");
  if (cfg.margenPct != null && !(cfg.margenPct >= 0 && cfg.margenPct <= 100)) throw new ErrorErp("El margen en % va de 0 a 100.");
  if (cfg.margenModo !== "menor" && cfg.margenModo !== "mayor") throw new ErrorErp("El margen toma el menor o el mayor.");
  if (!(cfg.descuentoPct >= 0 && cfg.descuentoPct <= 90)) throw new ErrorErp("El descuento de preventa va de 0 % a 90 %.");
  if (!(cfg.senaPct >= 1 && cfg.senaPct <= 100)) throw new ErrorErp("La seña va de 1 % a 100 %.");
  if (!(Number.isInteger(cfg.plazoSaldoDias) && cfg.plazoSaldoDias >= 1 && cfg.plazoSaldoDias <= 60)) throw new ErrorErp("El plazo del saldo va de 1 a 60 días.");
  if (!(Number.isInteger(cfg.mlMaxDias) && cfg.mlMaxDias >= 1 && cfg.mlMaxDias <= 120)) throw new ErrorErp("El tope de días de Mercado Libre va de 1 a 120.");
  await consulta(`insert into config_org (organizacion_id, clave, valor) values ($1, 'preventa', $2::jsonb)
                  on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, JSON.stringify(cfg)]);
}

/** Margen de seguridad de una cantidad que llega (pura): las unidades y el % (redondeado para arriba), el menor o el
 *  mayor. Sin ninguno de los dos, 0. Ej.: 5 u. / 10 % / el menor → llegan 10: 1; llegan 15: 2; llegan 100: 5. */
export function margenSeguridad(cantidad: number, m: { unidades: number | null; pct: number | null; modo: ModoMargen }): number {
  const vals: number[] = [];
  if (m.unidades != null) vals.push(m.unidades);
  if (m.pct != null) vals.push(Math.ceil((cantidad * m.pct) / 100 - 1e-9));
  if (!vals.length) return 0;
  return Math.max(0, m.modo === "mayor" ? Math.max(...vals) : Math.min(...vals));
}

/** Días de demora para Mercado Libre hasta una fecha (pura): desde hoy, al menos 1. */
export function diasHasta(fecha: string, hoy = hoyArgentina()): number {
  return Math.max(1, Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86400000));
}

// ── La cuenta ─────────────────────────────────────────────

export type CanalPreventa = "web" | "ml";

export type OfertaPreventa = {
  variacionId: number; ordenId: number; codigo: string;
  /** La fecha que se promete en ese canal (la de la web o la de ML). */
  llegada: string;
  cupo: number; descuentoPct: number;
};

type Candidata = { orden_id: number; codigo: string; llegada: string | null; llegada_ml: string | null; publicada: Date | null; descuento: number | null;
  m_u: number | null; m_p: number | null; m_m: ModoMargen | null; variacion_id: number; pendiente: number; vendido: number };

/** La preventa que se ofrece de cada variación en un canal (las que no tienen, no están en el mapa). `canalId`: el
 *  canal concreto (sus depósitos deciden si hay físico). */
export async function ofertasPreventa(org: string, variaciones: number[], canal: { id: number; tipo: CanalPreventa }, c?: Consultor): Promise<Map<number, OfertaPreventa>> {
  const salida = new Map<number, OfertaPreventa>();
  const ids = [...new Set(variaciones.filter((v) => Number.isInteger(v) && v > 0))];
  if (!ids.length) return salida;
  const q = async <T extends Record<string, unknown>>(sql: string, v: unknown[]) => (c ? (await c.query<T>(sql, v)).rows : await consulta<T>(sql, v));
  // Ninguna orden publicada en el canal: no hay nada que calcular (lo más común).
  const hay = await q<{ n: number }>(`select count(*)::int n from orden_compra where organizacion_id = $1 and estado = 'en_camino' and ${canal.tipo === "web" ? "publicar_web" : "publicar_ml"}`, [org]);
  if (!hay[0]?.n) return salida;
  const cfg = await configPreventa(org, c);
  const hoy = hoyArgentina();
  // Las variaciones: si su producto la admite, su disponible en el canal y, si es kit, sus componentes.
  const info = await q<{ id: number; admite: boolean; disp: number; m_u: number | null; m_p: number | null; m_m: ModoMargen | null; descuento: number | null;
    comps: { v: number; k: number }[] | null }>(`
    select va.id::int,
           (va.estado = 'activa' and p.estado = 'activo' and not p.no_publicable ${canal.tipo === "ml" ? "and not p.nunca_ml" : ""}
            and coalesce(${canal.tipo === "web" ? "p.preventa_web" : "p.preventa_ml"}, $4::boolean)) admite,
           stock_disponible_canal($1, va.id, $3) disp,
           p.preventa_margen_unidades m_u, p.preventa_margen_pct::float8 m_p, p.preventa_margen_modo m_m, p.preventa_descuento_pct::float8 descuento,
           (select json_agg(json_build_object('v', k.variacion_componente_id, 'k', k.cantidad)) from kit_componente k where k.variacion_kit_id = va.id and not k.sobrante) comps
      from variacion va join producto p on p.id = va.producto_id
     where va.organizacion_id = $1 and va.id = any($2::bigint[])`, [org, ids, canal.id, canal.tipo === "web" ? cfg.admiteWeb : cfg.admiteMl]);
  const vivas = info.filter((v) => v.admite && v.disp <= 0);
  if (!vivas.length) return salida;
  // Las órdenes candidatas de cada variación (o componente): en camino, publicadas en el canal, con lo que falta traer.
  const buscadas = [...new Set(vivas.flatMap((v) => (v.comps?.length ? v.comps.map((x) => x.v) : [v.id])))];
  const cands = await q<Candidata>(`
    select o.id::int orden_id, o.codigo, o.llegada::text, o.llegada_ml::text, ${canal.tipo === "web" ? "o.publicada_web_ts" : "o.publicada_ml_ts"} publicada,
           o.descuento_pct::float8 descuento, o.margen_unidades m_u, o.margen_pct::float8 m_p, o.margen_modo m_m,
           pe.variacion_id::int, pe.pendiente,
           coalesce((select sum(r.cantidad) from preventa_reserva r where r.orden_id = o.id and r.variacion_id = pe.variacion_id and r.estado = 'activa'), 0)::int vendido
      from orden_compra o join orden_compra_pendiente pe on pe.orden_id = o.id
     where o.organizacion_id = $1 and o.estado = 'en_camino' and ${canal.tipo === "web" ? "o.publicar_web" : "o.publicar_ml"} and pe.variacion_id = any($2::bigint[])
     order by ${canal.tipo === "web" ? "o.publicada_web_ts" : "o.publicada_ml_ts"} nulls last, o.llegada nulls last, o.id`, [org, buscadas]);
  const margenes = new Map(info.map((v) => [v.id, v]));
  const cupoDe = (cand: Candidata, dueno: typeof info[number]) => {
    // El margen más particular, entero: el del producto; si no cargó nada, el de la orden; si no, el general.
    const m = dueno.m_u != null || dueno.m_p != null ? { unidades: dueno.m_u, pct: dueno.m_p, modo: (dueno.m_m ?? cfg.margenModo) as ModoMargen }
      : cand.m_u != null || cand.m_p != null ? { unidades: cand.m_u, pct: cand.m_p, modo: (cand.m_m ?? cfg.margenModo) as ModoMargen }
      : { unidades: cfg.margenUnidades, pct: cfg.margenPct, modo: cfg.margenModo };
    return Math.max(0, cand.pendiente - margenSeguridad(cand.pendiente, m) - cand.vendido);
  };
  const fechaDe = (cand: Candidata) => (canal.tipo === "web" ? cand.llegada : cand.llegada_ml ?? cand.llegada);
  const cabeEnMl = (cand: Candidata) => {
    if (canal.tipo !== "ml") return true;
    const f = fechaDe(cand);
    return !!f && diasHasta(f, hoy) <= cfg.mlMaxDias;
  };
  const ordenes = [...new Map(cands.map((x) => [x.orden_id, x])).values()]; // en el orden de publicación
  for (const v of vivas) {
    const dueno = margenes.get(v.id)!;
    if (v.comps?.length) {
      // Kit: la primera orden (en el orden de publicación) que traiga TODOS sus componentes con cupo.
      for (const o of ordenes) {
        if (!cabeEnMl(o)) continue;
        let cupo = Infinity;
        for (const comp of v.comps) {
          const cand = cands.find((x) => x.orden_id === o.orden_id && x.variacion_id === comp.v);
          if (!cand) { cupo = 0; break; }
          cupo = Math.min(cupo, Math.floor(cupoDe(cand, margenes.get(comp.v) ?? dueno) / comp.k));
        }
        if (cupo > 0 && Number.isFinite(cupo)) {
          salida.set(v.id, { variacionId: v.id, ordenId: o.orden_id, codigo: o.codigo, llegada: fechaDe(o) ?? hoy, cupo, descuentoPct: dueno.descuento ?? o.descuento ?? cfg.descuentoPct });
          break;
        }
      }
      continue;
    }
    for (const cand of cands.filter((x) => x.variacion_id === v.id)) {
      if (!cabeEnMl(cand)) continue;
      const cupo = cupoDe(cand, dueno);
      if (cupo > 0) {
        salida.set(v.id, { variacionId: v.id, ordenId: cand.orden_id, codigo: cand.codigo, llegada: fechaDe(cand) ?? hoy, cupo, descuentoPct: dueno.descuento ?? cand.descuento ?? cfg.descuentoPct });
        break;
      }
    }
  }
  return salida;
}

/** Precio de preventa a partir del normal (pura): − el descuento, redondeado a pesos. */
export const precioPreventa = (normal: number, descuentoPct: number) => Math.round(normal * (1 - descuentoPct / 100));

/** El canal (id y si es web o ML) de un id de canal. */
export async function canalPreventa(org: string, canalId: number, c?: Consultor): Promise<{ id: number; tipo: CanalPreventa } | null> {
  const sql = "select id::int, tipo from canal where id = $1 and organizacion_id = $2";
  const r = c ? (await c.query<{ id: number; tipo: string }>(sql, [canalId, org])).rows[0] : await una<{ id: number; tipo: string }>(sql, [canalId, org]);
  if (!r) return null;
  return { id: r.id, tipo: r.tipo === "mercadolibre" ? "ml" : "web" };
}

// ── Un pedido en preventa ──────────────────────────────────

export type PedidoPreventa = { ordenId: number; codigo: string; llegada: string; descuentos: Map<number, number> };

/** Decide si un pedido (sus líneas con producto) sale del físico o de una preventa, y valida la regla de no mezclar:
 *  o todo hay en físico, o todo viene en la misma orden con cupo. Devuelve null si es un pedido común. Corre adentro
 *  de la transacción que crea el pedido, con un candado por organización para que dos compras no se lleven el mismo
 *  cupo. `ordenPedida`: la orden que el cliente vio (si cambió, se avisa). */
export async function decidirPreventa(c: PoolClient, org: string, canalId: number, lineas: { variacion_id: number; cantidad: number }[],
  o: { ordenPedida?: number | null } = {}): Promise<PedidoPreventa | null> {
  const conProducto = lineas.filter((l) => l.variacion_id);
  if (!conProducto.length) return null;
  const canal = await canalPreventa(org, canalId, c);
  if (!canal) return null;
  await c.query("select pg_advisory_xact_lock(hashtext('preventa:' || $1))", [org]);
  const porVariacion = new Map<number, number>();
  for (const l of conProducto) porVariacion.set(l.variacion_id, (porVariacion.get(l.variacion_id) ?? 0) + l.cantidad);
  const ofertas = await ofertasPreventa(org, [...porVariacion.keys()], canal, c);
  const enPreventa = [...porVariacion.keys()].filter((v) => ofertas.has(v));
  if (!enPreventa.length) {
    if (o.ordenPedida) throw new ErrorErp("La preventa de ese producto ya no está disponible: volvé a cargar la página para ver el stock de hoy.");
    return null;
  }
  const sku = async (v: number) => (await c.query<{ sku: string }>("select sku from variacion where id = $1", [v])).rows[0]?.sku ?? String(v);
  if (enPreventa.length < porVariacion.size) {
    const fisicos = await Promise.all([...porVariacion.keys()].filter((v) => !ofertas.has(v)).map(sku));
    throw new ErrorErp(`No se mezclan productos en preventa con productos en stock en un mismo pedido. ${fisicos.join(", ")} va${fisicos.length === 1 ? "" : "n"} en otro pedido.`);
  }
  const ordenes = new Set(enPreventa.map((v) => ofertas.get(v)!.ordenId));
  if (ordenes.size > 1) throw new ErrorErp("Esos productos llegan en órdenes de compra distintas (con fechas distintas): van en pedidos separados.");
  const of = ofertas.get(enPreventa[0])!;
  if (o.ordenPedida && o.ordenPedida !== of.ordenId) throw new ErrorErp(`Cambió la fecha de llegada: ahora es el ${of.llegada.split("-").reverse().join("/")}. Revisá el pedido y volvé a confirmarlo.`);
  // El cupo: lo que pide cada variación (un kit, sus componentes) contra lo que le queda a la orden.
  for (const [v, n] of porVariacion) {
    const cupo = ofertas.get(v)!.cupo;
    if (n > cupo) throw new ErrorErp(`De ${await sku(v)} quedan ${cupo} en preventa (llegan el ${ofertas.get(v)!.llegada.split("-").reverse().join("/")}).`);
  }
  // Dos líneas que comparten un componente (un kit y el suelto): se valida el total de cada componente.
  const comps = await c.query<{ v: number; n: number }>(`
    select coalesce(k.variacion_componente_id, x.v)::int v, sum(x.n * coalesce(k.cantidad, 1))::int n
      from unnest($1::bigint[], $2::int[]) x(v, n) left join kit_componente k on k.variacion_kit_id = x.v and not k.sobrante group by 1`,
    [[...porVariacion.keys()], [...porVariacion.values()]]);
  if (comps.rows.length > 1) {
    const sueltas = await ofertasPreventa(org, comps.rows.map((r) => r.v), canal, c);
    for (const r of comps.rows) {
      const s = sueltas.get(r.v);
      if (s && s.ordenId === of.ordenId && r.n > s.cupo) throw new ErrorErp(`De ${await sku(r.v)} quedan ${s.cupo} en preventa.`);
    }
  }
  return { ordenId: of.ordenId, codigo: of.codigo, llegada: of.llegada, descuentos: new Map(enPreventa.map((v) => [v, ofertas.get(v)!.descuentoPct])) };
}

// ── Llegada de la mercadería ────────────────────────────────

/** Les reserva el stock físico que ya entró a las reservas de entrante de una orden, por orden de compra (la más vieja
 *  primero): cada renglón reservado se convierte en reserva física del pedido. Un pedido con todos sus renglones
 *  cubiertos deja de ser preventa (sigue como un pedido común) y, si debe el saldo, le corre el plazo para pagarlo. Lo
 *  que no alcanza queda «sin cubrir» (lo ve Ventas › Preventas). Se llama al recibir cada caja y al cerrar la recepción. */
export async function cubrirPreventas(org: string, ordenId: number, quien: string): Promise<{ cubiertos: number[]; renglones: number }> {
  const cfg = await configPreventa(org);
  const cubiertos: number[] = [];
  let renglones = 0;
  const filas = await consulta<{ id: number; pedido_id: number; variacion_id: number; cantidad: number; deposito_id: number | null; canal_id: number }>(`
    select r.id::int, r.pedido_id::int, r.variacion_id::int, r.cantidad, p.deposito_id::int, p.canal_id::int
      from preventa_reserva r join pedido p on p.id = r.pedido_id
     where r.organizacion_id = $1 and r.orden_id = $2 and r.estado = 'activa' and p.estado not in ('cancelado', 'devuelto')
     order by p.fecha, p.id, r.id`, [org, ordenId]);
  const pedidos = new Set<number>();
  for (const f of filas) {
    const ok = await enTransaccion(async (c) => {
      const dep = f.deposito_id ?? (await c.query<{ d: number }>("select deposito_para_pedido($1, $2, null)::int d", [org, f.canal_id])).rows[0].d;
      const disp = (await c.query<{ n: number }>("select stock_disponible_deposito($1, $2, $3) n", [org, f.variacion_id, dep])).rows[0].n;
      if (disp < f.cantidad) return false;
      const sigue = (await c.query("update preventa_reserva set estado = 'cubierta', cerrado_ts = now() where id = $1 and estado = 'activa'", [f.id])).rowCount;
      if (!sigue) return false;
      await c.query("select reservar_en_deposito($1, $2, $3, $4, 'pedido', $5, $6)", [org, f.variacion_id, dep, f.cantidad, String(f.pedido_id), quien]);
      await c.query("update pedido set deposito_id = coalesce(deposito_id, $2) where id = $1", [f.pedido_id, dep]);
      return true;
    });
    if (ok) { renglones++; pedidos.add(f.pedido_id); }
  }
  // Los pedidos que quedaron con todo cubierto.
  for (const pid of pedidos) {
    const listo = await una<{ n: number }>("select count(*)::int n from preventa_reserva where pedido_id = $1 and estado = 'activa'", [pid]);
    if (listo?.n) continue;
    const hasta = new Date(Date.parse(`${hoyArgentina()}T12:00:00Z`) + cfg.plazoSaldoDias * 86400000).toISOString().slice(0, 10);
    await consulta(`update pedido set preventa_cubierto_ts = now(),
                      preventa_saldo_hasta = case when estado_pago = 'pendiente' and estado = 'nuevo' then $2::date else null end
                     where id = $1 and preventa_cubierto_ts is null`, [pid, hasta]);
    await consulta(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                    select organizacion_id, id, estado, estado, $2, 'llegó la mercadería de la preventa: el stock quedó reservado' from pedido where id = $1`, [pid, quien]);
    cubiertos.push(pid);
  }
  if (cubiertos.length) {
    const { avisarLlegadaPreventa } = await import("@/lib/preventa/avisos");
    await avisarLlegadaPreventa(org, cubiertos).catch((e) => console.error("[preventa] aviso de llegada", e));
  }
  return { cubiertos, renglones };
}

/** Las reservas en espera (sin orden) de los SKU de una orden recién confirmada pasan a esa orden, por orden de compra:
 *  un pedido pasa entero (todos sus renglones en espera tienen que caber en la orden) o no pasa. */
export async function asignarEsperas(org: string, ordenId: number): Promise<number[]> {
  const o = await una<{ codigo: string; llegada: string | null; llegada_ml: string | null }>("select codigo, llegada::text, llegada_ml::text from orden_compra where id = $1 and organizacion_id = $2", [ordenId, org]);
  if (!o) return [];
  const esperan = await consulta<{ pedido_id: number }>(`
    select distinct r.pedido_id::int, min(p.fecha) over (partition by r.pedido_id) f from preventa_reserva r join pedido p on p.id = r.pedido_id
     where r.organizacion_id = $1 and r.orden_id is null and r.estado = 'activa' and p.estado not in ('cancelado', 'devuelto')
       and r.variacion_id in (select variacion_id from orden_compra_pendiente where orden_id = $2)
     order by f, pedido_id`, [org, ordenId]);
  const pasados: number[] = [];
  for (const { pedido_id } of esperan) {
    const ok = await enTransaccion(async (c) => {
      await c.query("select pg_advisory_xact_lock(hashtext('preventa:' || $1))", [org]);
      const falta = await c.query<{ v: number }>(`
        with pide as (select variacion_id, sum(cantidad)::int n from preventa_reserva where pedido_id = $1 and orden_id is null and estado = 'activa' group by 1)
        select pide.variacion_id::int v from pide
          left join orden_compra_pendiente pe on pe.orden_id = $2 and pe.variacion_id = pide.variacion_id
         where coalesce(pe.pendiente, 0) - coalesce((select sum(cantidad) from preventa_reserva x where x.orden_id = $2 and x.variacion_id = pide.variacion_id and x.estado = 'activa'), 0) < pide.n`,
        [pedido_id, ordenId]);
      if (falta.rows.length) return false;
      await c.query("update preventa_reserva set orden_id = $2, nota = 'estaba en espera' where pedido_id = $1 and orden_id is null and estado = 'activa'", [pedido_id, ordenId]);
      await c.query(`update pedido p set preventa_orden_id = $2, preventa_llegada = case when ca.tipo = 'mercadolibre' then coalesce($4::date, $3::date) else $3::date end
                       from canal ca where ca.id = p.canal_id and p.id = $1`, [pedido_id, ordenId, o.llegada, o.llegada_ml]);
      await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                     select organizacion_id, id, estado, estado, 'sistema', $2 from pedido where id = $1`, [pedido_id, `la preventa en espera pasó a la orden ${o.codigo}`]);
      return true;
    });
    if (ok) pasados.push(pedido_id);
  }
  return pasados;
}

// ── Resolver un pedido de preventa (achicar una orden, llega menos, cancelaciones) ──

/** Pasa un pedido de preventa a otra orden en camino que tenga cupo de todos sus productos (toma su fecha). */
export async function pasarAOtraOrden(org: string, pedidoId: number, ordenNueva: number, quien: string): Promise<string> {
  return enTransaccion(async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('preventa:' || $1))", [org]);
    const p = (await c.query<{ preventa_orden_id: number | null; preventa_cubierto_ts: Date | null; estado: string; canal: string }>(`
      select p.preventa_orden_id::int, p.preventa_cubierto_ts, p.estado, ca.tipo canal from pedido p join canal ca on ca.id = p.canal_id
       where p.id = $1 and p.organizacion_id = $2 for update of p`, [pedidoId, org])).rows[0];
    if (!p?.preventa_orden_id || p.preventa_cubierto_ts) throw new ErrorErp("Ese pedido no es una preventa pendiente.");
    if (["cancelado", "devuelto"].includes(p.estado)) throw new ErrorErp(`El pedido está ${p.estado}.`);
    const o = (await c.query<{ codigo: string; estado: string; llegada: string | null; llegada_ml: string | null }>(
      "select codigo, estado, llegada::text, llegada_ml::text from orden_compra where id = $1 and organizacion_id = $2", [ordenNueva, org])).rows[0];
    if (!o || o.estado !== "en_camino") throw new ErrorErp("Elegí una orden en camino.");
    const falta = await c.query<{ sku: string }>(`
      with pide as (select variacion_id, sum(cantidad)::int n from preventa_reserva where pedido_id = $1 and estado = 'activa' group by 1)
      select va.sku from pide join variacion va on va.id = pide.variacion_id
        left join orden_compra_pendiente pe on pe.orden_id = $2 and pe.variacion_id = pide.variacion_id
       where coalesce(pe.pendiente, 0) - coalesce((select sum(cantidad) from preventa_reserva x where x.orden_id = $2 and x.variacion_id = pide.variacion_id
                                                       and x.estado = 'activa' and x.pedido_id <> $1), 0) < pide.n`, [pedidoId, ordenNueva]);
    if (falta.rows.length) throw new ErrorErp(`La orden ${o.codigo} no tiene lugar para ${falta.rows.map((r) => r.sku).join(", ")}.`);
    await c.query("update preventa_reserva set orden_id = $2 where pedido_id = $1 and estado = 'activa'", [pedidoId, ordenNueva]);
    const llegada = p.canal === "mercadolibre" ? o.llegada_ml ?? o.llegada : o.llegada;
    await c.query("update pedido set preventa_orden_id = $2, preventa_llegada = $3 where id = $1", [pedidoId, ordenNueva, llegada]);
    await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                   values ($1, $2, $3, $3, $4, $5)`, [org, pedidoId, p.estado, quien, `preventa pasada a la orden ${o.codigo} (llega el ${llegada ?? "—"}): avisarle al cliente`]);
    return o.codigo;
  });
}

/** Deja un pedido de preventa «en espera sin orden»: la próxima orden que traiga sus productos lo cubre primero. */
export async function dejarEnEspera(org: string, pedidoId: number, quien: string): Promise<void> {
  await enTransaccion(async (c) => {
    const p = (await c.query<{ preventa_orden_id: number | null; preventa_cubierto_ts: Date | null; estado: string }>(
      "select preventa_orden_id::int, preventa_cubierto_ts, estado from pedido where id = $1 and organizacion_id = $2 for update", [pedidoId, org])).rows[0];
    if (!p?.preventa_orden_id || p.preventa_cubierto_ts) throw new ErrorErp("Ese pedido no es una preventa pendiente.");
    await c.query("update preventa_reserva set orden_id = null, nota = 'en espera sin orden' where pedido_id = $1 and estado = 'activa'", [pedidoId]);
    await c.query("update pedido set preventa_llegada = null where id = $1", [pedidoId]);
    await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                   values ($1, $2, $3, $3, $4, 'preventa en espera sin orden: la cubre la próxima orden que traiga sus productos')`, [org, pedidoId, p.estado, quien]);
  });
}

/** Le da más plazo para pagar el saldo a un pedido de preventa que ya llegó. */
export async function extenderSaldo(org: string, pedidoId: number, dias: number, quien: string): Promise<string> {
  if (!Number.isInteger(dias) || dias < 1 || dias > 60) throw new ErrorErp("El plazo va de 1 a 60 días.");
  const hasta = new Date(Date.parse(`${hoyArgentina()}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
  const r = await consulta("update pedido set preventa_saldo_hasta = $3 where id = $1 and organizacion_id = $2 and preventa_saldo_hasta is not null returning id", [pedidoId, org, hasta]);
  if (!r.length) throw new ErrorErp("Ese pedido no tiene un saldo de preventa pendiente.");
  await consulta(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                  select organizacion_id, id, estado, estado, $2, $3 from pedido where id = $1`, [pedidoId, quien, `plazo del saldo de la preventa hasta el ${hasta.split("-").reverse().join("/")}`]);
  return hasta;
}

// ── Para las pantallas ──────────────────────────────────────

export type PedidoEnPreventa = {
  id: number; fecha: Date; canal: string; canal_id: number; cliente: string | null; cliente_id: number | null; estado: string; estado_pago: string;
  orden_id: number | null; orden: string | null; llegada: string | null; total_ars: number; pagado_ars: number; sena_ars: number | null;
  cubierto: boolean; saldo_hasta: string | null; en_espera: boolean; activas: number; cubiertas: number; productos: string; es_ml: boolean;
};

/** Los pedidos de preventa vivos (sin cancelar), con lo que se necesita para resolverlos. */
export async function pedidosEnPreventa(org: string, f: { ordenId?: number | null; soloPendientes?: boolean } = {}): Promise<PedidoEnPreventa[]> {
  return consulta<PedidoEnPreventa>(`
    select p.id::int, p.fecha, ca.nombre canal, ca.id::int canal_id, cl.nombre cliente, p.cliente_id::int, p.estado, p.estado_pago,
           p.preventa_orden_id::int orden_id, o.codigo orden, p.preventa_llegada::text llegada, p.total_ars::float8,
           coalesce((select sum(pg.importe_ars) from pago pg where pg.pedido_id = p.id and pg.estado = 'aprobado'), 0)::float8 pagado_ars,
           p.preventa_sena_ars::float8 sena_ars, p.preventa_cubierto_ts is not null cubierto, p.preventa_saldo_hasta::text saldo_hasta,
           exists (select 1 from preventa_reserva r where r.pedido_id = p.id and r.estado = 'activa' and r.orden_id is null) en_espera,
           (select coalesce(sum(r.cantidad), 0) from preventa_reserva r where r.pedido_id = p.id and r.estado = 'activa')::int activas,
           (select coalesce(sum(r.cantidad), 0) from preventa_reserva r where r.pedido_id = p.id and r.estado = 'cubierta')::int cubiertas,
           (select string_agg(pl.cantidad || ' × ' || coalesce(pl.sku, ''), ', ' order by pl.orden) from pedido_linea pl where pl.pedido_id = p.id) productos,
           ca.tipo = 'mercadolibre' es_ml
      from pedido p join canal ca on ca.id = p.canal_id left join cliente cl on cl.id = p.cliente_id left join orden_compra o on o.id = p.preventa_orden_id
     where p.organizacion_id = $1 and p.preventa_orden_id is not null and p.estado not in ('cancelado', 'devuelto')
       and ($2::bigint is null or p.preventa_orden_id = $2)
       and (not $3 or p.preventa_cubierto_ts is null or (p.preventa_saldo_hasta is not null and p.estado_pago = 'pendiente'))
     order by p.fecha, p.id`, [org, f.ordenId ?? null, !!f.soloPendientes]);
}

export type FilaOferta = {
  variacion_id: number; producto_id: number; sku: string; titulo: string; fotos: string[] | null;
  orden_id: number; orden: string; llegada: string | null; llegada_ml: string | null; publicar_web: boolean; publicar_ml: boolean;
  llegando: number; vendido: number; disp: number;
};

/** Por producto y orden en camino: lo que llega, lo vendido en preventa y el disponible físico de hoy. */
export async function resumenPorProducto(org: string): Promise<FilaOferta[]> {
  return consulta<FilaOferta>(`
    select pe.variacion_id::int, va.producto_id::int, va.sku, titulo_variacion(va.id) titulo,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = va.producto_id) fotos,
           o.id::int orden_id, o.codigo orden, o.llegada::text, o.llegada_ml::text, o.publicar_web, o.publicar_ml,
           pe.pendiente llegando,
           coalesce((select sum(r.cantidad) from preventa_reserva r where r.orden_id = o.id and r.variacion_id = pe.variacion_id and r.estado = 'activa'), 0)::int vendido,
           (select coalesce(sum(s.cantidad - s.reservado), 0) from stock s join ubicacion u on u.id = s.ubicacion_id join deposito d on d.id = u.deposito_id
             where s.variacion_id = pe.variacion_id and d.tipo not in ('full_ml', 'transito'))::int disp
      from orden_compra_pendiente pe join orden_compra o on o.id = pe.orden_id join variacion va on va.id = pe.variacion_id
     where o.organizacion_id = $1 and o.estado = 'en_camino'
     order by o.llegada nulls last, o.codigo, va.sku`, [org]);
}

/** Las reservas que quedaron sin cubrir de órdenes ya recibidas (llegó menos de lo vendido). */
export async function sinCubrir(org: string): Promise<{ pedido_id: number; orden: string; sku: string; cantidad: number; es_ml: boolean }[]> {
  return consulta(`
    select r.pedido_id::int, o.codigo orden, va.sku, r.cantidad, ca.tipo = 'mercadolibre' es_ml
      from preventa_reserva r join orden_compra o on o.id = r.orden_id join variacion va on va.id = r.variacion_id
      join pedido p on p.id = r.pedido_id join canal ca on ca.id = p.canal_id
     where r.organizacion_id = $1 and r.estado = 'activa' and o.estado = 'recibida' and p.estado not in ('cancelado', 'devuelto')
     order by p.fecha, p.id`, [org]);
}

/** Cuántas preventas hay que atender (para «Para hacer»): sin cubrir, saldos vencidos y órdenes atrasadas con ventas. */
export async function pendientesPreventa(org: string): Promise<{ sinCubrir: number; saldosVencidos: number; atrasadas: number; agotadas: number }> {
  const r = await una<{ sin_cubrir: number; saldos: number; atrasadas: number }>(`
    select (select count(distinct r.pedido_id) from preventa_reserva r join orden_compra o on o.id = r.orden_id join pedido p on p.id = r.pedido_id
             where r.organizacion_id = $1 and r.estado = 'activa' and o.estado = 'recibida' and p.estado not in ('cancelado', 'devuelto'))::int sin_cubrir,
           (select count(*) from pedido p where p.organizacion_id = $1 and p.preventa_saldo_hasta < (now() at time zone 'America/Argentina/Buenos_Aires')::date
             and p.estado_pago = 'pendiente' and p.estado = 'nuevo')::int saldos,
           (select count(*) from orden_compra o where o.organizacion_id = $1 and o.estado = 'en_camino' and o.llegada < (now() at time zone 'America/Argentina/Buenos_Aires')::date
             and exists (select 1 from preventa_reserva r where r.orden_id = o.id and r.estado = 'activa'))::int atrasadas`, [org]);
  return { sinCubrir: r?.sin_cubrir ?? 0, saldosVencidos: r?.saldos ?? 0, atrasadas: r?.atrasadas ?? 0, agotadas: 0 };
}

/** Las variaciones que podrían estar en preventa en un canal: las que traen las órdenes en camino publicadas ahí, y los
 *  kits que llevan alguna de ellas (para no calcular todo el catálogo). */
export async function candidatasPreventa(org: string, canal: CanalPreventa): Promise<number[]> {
  const r = await consulta<{ v: number }>(`
    with pe as (select pe.variacion_id from orden_compra_pendiente pe join orden_compra o on o.id = pe.orden_id
                 where o.organizacion_id = $1 and o.estado = 'en_camino' and ${canal === "web" ? "o.publicar_web" : "o.publicar_ml"} and pe.pendiente > 0)
    select variacion_id::int v from pe
    union select k.variacion_kit_id::int from kit_componente k where k.variacion_componente_id in (select variacion_id from pe)`, [org]);
  return r.map((x) => x.v);
}

/** La preventa de cada producto de la tienda (para el listado): la de su variación más barata en preventa, con el
 *  cupo de todas. Sólo los productos sin stock físico. */
export async function preventaDeProductos(org: string, canalId: number): Promise<Map<number, { variacionId: number; llegada: string; codigo: string; cupo: number; descuentoPct: number }>> {
  const salida = new Map<number, { variacionId: number; llegada: string; codigo: string; cupo: number; descuentoPct: number }>();
  const cand = await candidatasPreventa(org, "web");
  if (!cand.length) return salida;
  const of = await ofertasPreventa(org, cand, { id: canalId, tipo: "web" });
  if (!of.size) return salida;
  const prod = await consulta<{ v: number; p: number }>("select id::int v, producto_id::int p from variacion where id = any($1::bigint[])", [[...of.keys()]]);
  for (const { v, p } of prod) {
    const o = of.get(v)!;
    const ya = salida.get(p);
    if (!ya) salida.set(p, { variacionId: v, llegada: o.llegada, codigo: o.codigo, cupo: o.cupo, descuentoPct: o.descuentoPct });
    else ya.cupo += o.cupo;
  }
  return salida;
}
