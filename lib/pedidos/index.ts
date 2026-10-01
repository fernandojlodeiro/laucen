// Pedidos (orden 136, §8). Dos funciones únicas:
// - `crearPedido`: la usa POST /api/pedidos (carrito, planilla mayorista,
//   WhatsApp, sincronización de Mercado Libre) y la importación de ventas
//   históricas. Crea o enlaza el cliente, el pedido y sus líneas, con los
//   precios de `precioDe` según la lista del canal (o la del cliente).
// - `cambiarEstado`: envuelve cambiar_estado() de la base (db/ventas.sql):
//   valida la transición, escribe el historial, emite el evento y reserva /
//   vende / libera stock. Mercado Libre la llama sola; la tienda, el operador.

import type { PoolClient } from "pg";
import { consulta, una, enTransaccion, ErrorErp, type Consultor } from "@/lib/erp/base";
import { precioDe } from "@/lib/precios";
import { convertir, esMoneda, type Moneda } from "@/lib/moneda";

export const ESTADOS_PEDIDO = {
  nuevo: "Nuevo",
  pagado: "Pagado",
  en_preparacion: "En preparación",
  preparado: "Preparado",
  despachado: "Despachado",
  entregado: "Entregado",
  cancelado: "Cancelado",
  devuelto: "Devuelto",
} as const;
export type EstadoPedido = keyof typeof ESTADOS_PEDIDO;
export const esEstadoPedido = (x: unknown): x is EstadoPedido => typeof x === "string" && Object.hasOwn(ESTADOS_PEDIDO, x);

export const ESTADOS_PAGO = { pendiente: "Pendiente", pagado: "Pagado", a_convenir: "A convenir", reembolsado: "Reembolsado" } as const;
export type EstadoPago = keyof typeof ESTADOS_PAGO;
export const esEstadoPago = (x: unknown): x is EstadoPago => typeof x === "string" && Object.hasOwn(ESTADOS_PAGO, x);

/** Cambia el estado de un pedido. `quien`: id del usuario o 'sistema'.
 *  Devuelve el estado anterior. Tira un error en criollo si la transición no
 *  vale (p. ej. de despachado a pagado, o un pedido cancelado). */
export async function cambiarEstado(org: string, pedidoId: number, nuevo: EstadoPedido, quien: string, nota?: string | null, c?: Consultor): Promise<EstadoPedido> {
  if (!esEstadoPedido(nuevo)) throw new ErrorErp(`Estado desconocido: ${nuevo}.`);
  const sql = "select cambiar_estado($1, $2, $3, $4, $5) anterior";
  const valores = [org, pedidoId, nuevo, quien, nota ?? null];
  const r = c ? (await c.query<{ anterior: EstadoPedido }>(sql, valores)).rows[0] : await una<{ anterior: EstadoPedido }>(sql, valores);
  return r!.anterior;
}

// ── Crear un pedido ──────────────────────────────────────

export type ClienteEntrada = {
  /** Id del cliente en el canal (ej. el comprador de ML): enlaza por cliente_identidad. */
  id_externo?: string | null;
  nombre?: string | null;
  tipo?: "consumidor_final" | "mayorista";
  email?: string | null;
  telefono?: string | null;
  documento_tipo?: string | null;
  documento_numero?: string | null;
  condicion_iva?: string | null;
  direccion?: {
    calle?: string; numero?: string; piso_depto?: string; localidad?: string;
    provincia?: string; codigo_postal?: string; pais?: string;
  } | null;
};

export type LineaEntrada = {
  variacion_id?: number | null;
  sku?: string | null;
  cantidad: number;
  /** Precio unitario de venta ya pactado (ej. el de ML), en la moneda del
   *  pedido. Si falta, sale de precioDe con la lista que corresponda. */
  precio_unitario?: number | null;
  /** Título tal como se vendió. Si falta, el de la variación. */
  titulo?: string | null;
};

export type PedidoEntrada = {
  canalId: number;
  /** Un cliente que ya existe (por id), o los datos para encontrarlo o crearlo. */
  clienteId?: number | null;
  cliente?: ClienteEntrada | null;
  id_externo?: string | null;
  fecha?: string | null;
  moneda?: Moneda | null;
  lineas: LineaEntrada[];
  medio_pago?: string | null;
  estado_pago?: EstadoPago | null;
  envio?: Record<string, unknown> | null;
  notas?: string | null;
  deposito_id?: number | null;
  /** false para ventas históricas: no reservan ni descuentan stock. */
  afecta_stock?: boolean;
  /** Estado con el que nace (las históricas nacen 'entregado'). Por defecto 'nuevo'. */
  estado_inicial?: EstadoPedido;
};

export type PedidoCreado = { pedidoId: number; clienteId: number | null; creado: boolean; total: { ars: number; usd: number } };

/** Crea un pedido (o devuelve el que ya existe con el mismo id_externo en ese
 *  canal: llamar dos veces no lo duplica). Todo en una transacción. */
export async function crearPedido(org: string, entrada: PedidoEntrada, quien: string, cx?: PoolClient): Promise<PedidoCreado> {
  const correr = async (c: PoolClient) => {
    const canal = (await c.query<{ id: string; lista_precios_id: string | null; moneda_base: Moneda | null }>(`
      select ca.id, ca.lista_precios_id, l.moneda_base from canal ca left join lista_precios l on l.id = ca.lista_precios_id
       where ca.id = $1 and ca.organizacion_id = $2`, [entrada.canalId, org])).rows[0];
    if (!canal) throw new ErrorErp("El canal no existe.");

    if (entrada.id_externo) {
      const ya = (await c.query<{ id: string; cliente_id: string | null; total_ars: string; total_usd: string }>(
        "select id, cliente_id, total_ars, total_usd from pedido where canal_id = $1 and id_externo = $2", [canal.id, entrada.id_externo])).rows[0];
      if (ya) return { pedidoId: Number(ya.id), clienteId: ya.cliente_id ? Number(ya.cliente_id) : null, creado: false, total: { ars: Number(ya.total_ars), usd: Number(ya.total_usd) } };
    }
    if (!entrada.lineas?.length) throw new ErrorErp("El pedido no tiene líneas.");

    const clienteId = await clienteDelPedido(c, org, Number(canal.id), entrada);
    const listaCliente = clienteId
      ? (await c.query<{ lista_precios_id: string | null }>("select lista_precios_id from cliente where id = $1", [clienteId])).rows[0]?.lista_precios_id
      : null;
    const listaId = listaCliente ? Number(listaCliente) : canal.lista_precios_id ? Number(canal.lista_precios_id) : null;
    const moneda: Moneda = esMoneda(entrada.moneda) ? entrada.moneda : (canal.moneda_base ?? "ARS");
    const fecha = entrada.fecha ? entrada.fecha.slice(0, 10) : undefined;

    type Linea = { variacion_id: number; cantidad: number; lista_ars: number | null; lista_usd: number | null; descuento: number; unit_ars: number; unit_usd: number; titulo: string; sku: string };
    const lineas: Linea[] = [];
    for (const [i, l] of entrada.lineas.entries()) {
      const n = i + 1;
      if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) throw new ErrorErp(`Línea ${n}: la cantidad tiene que ser un entero mayor que cero.`);
      const v = (await c.query<{ id: string; sku: string; titulo: string }>(`
        select v.id, v.sku, titulo_variacion(v.id) titulo from variacion v
         where v.organizacion_id = $1 and ${l.variacion_id ? "v.id = $2" : "v.sku = $2"}`,
        [org, l.variacion_id ?? l.sku ?? ""])).rows[0];
      if (!v) throw new ErrorErp(`Línea ${n}: no existe la variación ${l.variacion_id ?? l.sku ?? "(sin id ni SKU)"}.`);
      const titulo = l.titulo?.trim() || v.titulo;
      if (l.precio_unitario != null) {
        if (!(l.precio_unitario >= 0)) throw new ErrorErp(`Línea ${n}: el precio no es válido.`);
        const otro = await convertir(org, l.precio_unitario, moneda, moneda === "ARS" ? "USD" : "ARS", fecha, c);
        const [ars, usd] = moneda === "ARS" ? [l.precio_unitario, otro] : [otro, l.precio_unitario];
        lineas.push({ variacion_id: Number(v.id), cantidad: l.cantidad, lista_ars: null, lista_usd: null, descuento: 0, unit_ars: ars, unit_usd: usd, titulo, sku: v.sku });
      } else {
        if (!listaId) throw new ErrorErp(`Línea ${n}: el canal no tiene lista de precios y la línea no trae precio.`);
        const p = await precioDe(org, Number(v.id), listaId, fecha, c);
        if (!p) throw new ErrorErp(`Línea ${n}: ${v.sku} no tiene precio en la lista del canal.`);
        lineas.push({ variacion_id: Number(v.id), cantidad: l.cantidad, lista_ars: p.lista.ars, lista_usd: p.lista.usd, descuento: p.descuentoPct, unit_ars: p.venta.ars, unit_usd: p.venta.usd, titulo, sku: v.sku });
      }
    }
    const total = {
      ars: Math.round(lineas.reduce((s, l) => s + l.unit_ars * l.cantidad, 0) * 100) / 100,
      usd: Math.round(lineas.reduce((s, l) => s + l.unit_usd * l.cantidad, 0) * 100) / 100,
    };
    const estado = entrada.estado_inicial ?? "nuevo";
    if (!esEstadoPedido(estado)) throw new ErrorErp("Estado inicial desconocido.");
    if (estado !== "nuevo" && entrada.afecta_stock !== false) {
      throw new ErrorErp("Un pedido que mueve stock nace 'nuevo'; después se cambia con su estado.");
    }
    const estadoPago = esEstadoPago(entrada.estado_pago) ? entrada.estado_pago : "pendiente";

    const p = (await c.query<{ id: string }>(`
      insert into pedido (organizacion_id, canal_id, cliente_id, id_externo, fecha, estado, moneda, total_ars, total_usd,
                          medio_pago, estado_pago, deposito_id, envio, notas, afecta_stock)
      values ($1, $2, $3, $4, coalesce($5::timestamptz, now()), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      returning id`,
      [org, canal.id, clienteId, entrada.id_externo ?? null, entrada.fecha ?? null, estado, moneda, total.ars, total.usd,
        entrada.medio_pago ?? null, estadoPago, entrada.deposito_id ?? null, JSON.stringify(entrada.envio ?? {}),
        entrada.notas ?? null, entrada.afecta_stock !== false])).rows[0];
    const pedidoId = Number(p.id);
    for (const [i, l] of lineas.entries()) {
      await c.query(`
        insert into pedido_linea (organizacion_id, pedido_id, variacion_id, cantidad, precio_lista_ars, precio_lista_usd,
                                  descuento_pct, precio_unit_ars, precio_unit_usd, titulo, sku, orden)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [org, pedidoId, l.variacion_id, l.cantidad, l.lista_ars, l.lista_usd, l.descuento, l.unit_ars, l.unit_usd, l.titulo, l.sku, i]);
    }
    await c.query(`insert into pedido_estado_historial (organizacion_id, pedido_id, estado_anterior, estado_nuevo, quien, nota)
                   values ($1, $2, null, $3, $4, 'pedido creado')`, [org, pedidoId, estado, quien]);
    await c.query("select emitir_evento($1, 'pedido_estado_cambiado', $2::jsonb)",
      [org, JSON.stringify({ pedido_id: pedidoId, canal_id: Number(canal.id), anterior: null, nuevo: estado, quien })]);
    return { pedidoId, clienteId, creado: true, total };
  };
  return cx ? correr(cx) : enTransaccion(correr);
}

/** Encuentra el cliente del pedido o lo crea. Orden: id dado → identidad en
 *  el canal → documento → email → nuevo. Si vino id_externo, deja enlazada
 *  la identidad para la próxima. */
async function clienteDelPedido(c: PoolClient, org: string, canalId: number, e: PedidoEntrada): Promise<number | null> {
  if (e.clienteId) {
    const r = await c.query("select id from cliente where id = $1 and organizacion_id = $2", [e.clienteId, org]);
    if (!r.rowCount) throw new ErrorErp("El cliente no existe.");
    return e.clienteId;
  }
  const d = e.cliente;
  if (!d) return null;
  let id: number | null = null;
  if (d.id_externo) {
    const r = await c.query<{ cliente_id: string }>("select cliente_id from cliente_identidad where canal_id = $1 and id_externo = $2", [canalId, d.id_externo]);
    if (r.rows[0]) id = Number(r.rows[0].cliente_id);
  }
  if (!id && d.documento_numero) {
    const doc = d.documento_numero.replace(/\D/g, "");
    const r = await c.query<{ id: string }>("select id from cliente where organizacion_id = $1 and regexp_replace(documento_numero, '\\D', '', 'g') = $2 order by id limit 1", [org, doc]);
    if (r.rows[0]) id = Number(r.rows[0].id);
  }
  if (!id && d.email) {
    const r = await c.query<{ id: string }>("select id from cliente where organizacion_id = $1 and lower(email) = lower($2) order by id limit 1", [org, d.email.trim()]);
    if (r.rows[0]) id = Number(r.rows[0].id);
  }
  if (!id) {
    const nombre = d.nombre?.trim() || d.email?.trim() || (d.id_externo ? `Cliente ${d.id_externo}` : "");
    if (!nombre) throw new ErrorErp("El cliente necesita al menos un nombre, un mail o su id en el canal.");
    const r = await c.query<{ id: string }>(`
      insert into cliente (organizacion_id, nombre, tipo, email, telefono, documento_tipo, documento_numero, condicion_iva)
      values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [org, nombre, d.tipo === "mayorista" ? "mayorista" : "consumidor_final", d.email?.trim() || null, d.telefono?.trim() || null,
        normalDoc(d.documento_tipo), d.documento_numero?.trim() || null, normalIva(d.condicion_iva)]);
    id = Number(r.rows[0].id);
    if (d.direccion && Object.values(d.direccion).some(Boolean)) {
      const x = d.direccion;
      await c.query(`
        insert into cliente_direccion (organizacion_id, cliente_id, calle, numero, piso_depto, localidad, provincia, codigo_postal, pais, principal)
        values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'AR'), true)`,
        [org, id, x.calle ?? null, x.numero ?? null, x.piso_depto ?? null, x.localidad ?? null, x.provincia ?? null, x.codigo_postal ?? null, x.pais ?? null]);
    }
  }
  if (d.id_externo) {
    await c.query(`insert into cliente_identidad (organizacion_id, cliente_id, canal_id, id_externo) values ($1, $2, $3, $4)
                   on conflict (canal_id, id_externo) do nothing`, [org, id, canalId, d.id_externo]);
  }
  return id;
}

const DOCS = ["DNI", "CUIT", "CUIL", "PASAPORTE", "OTRO"];
const normalDoc = (x?: string | null) => {
  const t = x?.trim().toUpperCase();
  return t ? (DOCS.includes(t) ? t : "OTRO") : null;
};
const IVAS = ["consumidor_final", "responsable_inscripto", "monotributo", "exento", "no_responsable"];
const normalIva = (x?: string | null) => {
  const t = x?.trim().toLowerCase().replace(/\s+/g, "_");
  return t && IVAS.includes(t) ? t : null;
};

// ── Leer ─────────────────────────────────────────────────

/** Un pedido completo (para el detalle y para GET /api/pedidos/:id). */
export async function pedidoCompleto(org: string, pedidoId: number) {
  const pedido = await una<Record<string, unknown>>(`
    select p.id::int, p.id_externo, p.fecha, p.estado, p.moneda, p.total_ars::float, p.total_usd::float, p.medio_pago,
           p.estado_pago, p.envio, p.notas, p.afecta_stock, p.canal_id::int, ca.nombre canal, p.cliente_id::int,
           cl.nombre cliente, cl.email cliente_email, cl.documento_tipo, cl.documento_numero,
           p.deposito_id::int, d.nombre deposito
      from pedido p join canal ca on ca.id = p.canal_id
      left join cliente cl on cl.id = p.cliente_id left join deposito d on d.id = p.deposito_id
     where p.id = $1 and p.organizacion_id = $2`, [pedidoId, org]);
  if (!pedido) return null;
  const lineas = await consulta(`
    select id::int, variacion_id::int, sku, titulo, cantidad, precio_lista_ars::float, precio_lista_usd::float,
           descuento_pct::float, precio_unit_ars::float, precio_unit_usd::float
      from pedido_linea where pedido_id = $1 order by orden, id`, [pedidoId]);
  const historial = await consulta(`
    select h.estado_anterior, h.estado_nuevo, h.quien, coalesce(u.nombre, h.quien) quien_nombre, h.nota, h.fecha
      from pedido_estado_historial h left join usuarios u on u.id = h.quien
     where h.pedido_id = $1 order by h.fecha, h.id`, [pedidoId]);
  return { ...pedido, lineas, historial };
}
