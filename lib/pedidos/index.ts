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
import { condicionIva, documentoValido, normalizarCuit } from "@/lib/clientes";

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
  razon_social?: string | null;
  cuit?: string | null;
  /** Apodo del comprador en Mercado Libre (buyer.nickname). */
  apodo_ml?: string | null;
  nombre_pila?: string | null;
  apellido?: string | null;
  telefono_movil?: string | null;
  /** El dato crudo tal como vino, por origen (ej. {"ml": {billing_info…}}): se guarda entero. */
  datos_externos?: Record<string, unknown> | null;
  direccion?: DireccionEntrada | null;
  /** Otra dirección (ej. la de envío, si la fiscal es otra). */
  direccion_envio?: DireccionEntrada | null;
};

export type DireccionEntrada = {
  calle?: string; numero?: string; piso_depto?: string; localidad?: string;
  provincia?: string; provincia_codigo?: string; codigo_postal?: string; pais?: string;
  /** Quién recibe y su teléfono, referencias para llegar, coordenadas, id de la dirección en el canal. */
  receptor?: string; receptor_telefono?: string; referencia?: string; latitud?: number; longitud?: number; id_externo?: string;
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
  /** Si una línea no encuentra su variación (un artículo de ML que todavía no
   *  está vinculado a un producto), en vez de rechazar el pedido la guarda
   *  sin variación (con su título, SKU y precio, sin tocar stock) y marca el
   *  pedido `sin_vincular`. Exige precio_unitario en esas líneas. */
  permitir_sin_vincular?: boolean;
  /** El dato crudo del canal ({"ml": {orden, facturación…}}): nada se pierde. */
  datos_externos?: Record<string, unknown> | null;
  /** Lo que cobra el canal por la venta (comisión de ML), en pesos. */
  comision_ars?: number | null;
  /** Costo de envío que paga el comprador, en la moneda del pedido (se suma al total). */
  costo_envio?: number | null;
  metodo_envio_id?: number | null;
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

    type Linea = { variacion_id: number | null; cantidad: number; lista_ars: number | null; lista_usd: number | null; descuento: number; unit_ars: number; unit_usd: number; titulo: string; sku: string };
    const lineas: Linea[] = [];
    for (const [i, l] of entrada.lineas.entries()) {
      const n = i + 1;
      if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) throw new ErrorErp(`Línea ${n}: la cantidad tiene que ser un entero mayor que cero.`);
      const v = (await c.query<{ id: string; sku: string; titulo: string }>(`
        select v.id, v.sku, titulo_variacion(v.id) titulo from variacion v
         where v.organizacion_id = $1 and ${l.variacion_id ? "v.id = $2" : "v.sku = $2"}`,
        [org, l.variacion_id ?? l.sku ?? ""])).rows[0];
      if (!v) {
        if (!entrada.permitir_sin_vincular || l.precio_unitario == null) {
          throw new ErrorErp(`Línea ${n}: no existe la variación ${l.variacion_id ?? l.sku ?? "(sin id ni SKU)"}.`);
        }
        const otro = await convertir(org, l.precio_unitario, moneda, moneda === "ARS" ? "USD" : "ARS", fecha, c);
        const [ars, usd] = moneda === "ARS" ? [l.precio_unitario, otro] : [otro, l.precio_unitario];
        lineas.push({ variacion_id: null, cantidad: l.cantidad, lista_ars: null, lista_usd: null, descuento: 0, unit_ars: ars, unit_usd: usd, titulo: l.titulo?.trim() || l.sku || "Artículo sin vincular", sku: l.sku ?? "" });
        continue;
      }
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
    let envioArs = 0, envioUsd = 0;
    if (entrada.costo_envio) {
      if (!(entrada.costo_envio >= 0)) throw new ErrorErp("El costo de envío no es válido.");
      const otro = await convertir(org, entrada.costo_envio, moneda, moneda === "ARS" ? "USD" : "ARS", fecha, c);
      [envioArs, envioUsd] = moneda === "ARS" ? [entrada.costo_envio, otro] : [otro, entrada.costo_envio];
    }
    const total = {
      ars: Math.round((lineas.reduce((s, l) => s + l.unit_ars * l.cantidad, 0) + envioArs) * 100) / 100,
      usd: Math.round((lineas.reduce((s, l) => s + l.unit_usd * l.cantidad, 0) + envioUsd) * 100) / 100,
    };
    const estado = entrada.estado_inicial ?? "nuevo";
    if (!esEstadoPedido(estado)) throw new ErrorErp("Estado inicial desconocido.");
    if (estado !== "nuevo" && entrada.afecta_stock !== false) {
      throw new ErrorErp("Un pedido que mueve stock nace 'nuevo'; después se cambia con su estado.");
    }
    const estadoPago = esEstadoPago(entrada.estado_pago) ? entrada.estado_pago : "pendiente";

    const p = (await c.query<{ id: string }>(`
      insert into pedido (organizacion_id, canal_id, cliente_id, id_externo, fecha, estado, moneda, total_ars, total_usd,
                          medio_pago, estado_pago, deposito_id, envio, notas, afecta_stock, sin_vincular, datos_externos, comision_ars,
                          costo_envio_ars, metodo_envio_id)
      values ($1, $2, $3, $4, coalesce($5::timestamptz, now()), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20)
      returning id`,
      [org, canal.id, clienteId, entrada.id_externo ?? null, entrada.fecha ?? null, estado, moneda, total.ars, total.usd,
        entrada.medio_pago ?? null, estadoPago, entrada.deposito_id ?? null, JSON.stringify(entrada.envio ?? {}),
        entrada.notas ?? null, entrada.afecta_stock !== false, lineas.some((l) => l.variacion_id == null),
        JSON.stringify(entrada.datos_externos ?? {}), entrada.comision_ars ?? null, envioArs, entrada.metodo_envio_id ?? null])).rows[0];
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
 *  el canal → CUIT → documento → apodo de ML → mail → nuevo. Si ya existía,
 *  completa los datos que le falten (nunca pisa uno cargado) y suma el dato
 *  crudo. Si vino id_externo, deja enlazada la identidad para la próxima. */
async function clienteDelPedido(c: PoolClient, org: string, canalId: number, e: PedidoEntrada): Promise<number | null> {
  if (e.clienteId) {
    const r = await c.query("select id from cliente where id = $1 and organizacion_id = $2", [e.clienteId, org]);
    if (!r.rowCount) throw new ErrorErp("El cliente no existe.");
    return e.clienteId;
  }
  const d = e.cliente;
  if (!d) return null;
  const cuit = normalizarCuit(d.cuit) ?? (documentoValido(d.documento_numero)?.length === 11 ? normalizarCuit(d.documento_numero) : null);
  const doc = documentoValido(d.documento_numero);
  let id: number | null = null;
  const buscar = async (sql: string, v: unknown[]) => {
    if (id) return;
    const r = await c.query<{ id: string }>(sql, v);
    if (r.rows[0]) id = Number(r.rows[0].id);
  };
  if (d.id_externo) await buscar("select cliente_id id from cliente_identidad where canal_id = $1 and id_externo = $2", [canalId, d.id_externo]);
  if (cuit) await buscar("select id from cliente where organizacion_id = $1 and regexp_replace(coalesce(cuit, ''), '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g') order by id limit 1", [org, cuit]);
  if (doc) await buscar("select id from cliente where organizacion_id = $1 and regexp_replace(documento_numero, '\\D', '', 'g') = $2 order by id limit 1", [org, doc]);
  if (d.apodo_ml) await buscar("select id from cliente where organizacion_id = $1 and lower(apodo_ml) = lower($2) order by id limit 1", [org, d.apodo_ml.trim()]);
  if (d.email) await buscar("select id from cliente where organizacion_id = $1 and lower(email) = lower($2) order by id limit 1", [org, d.email.trim()]);

  const limpio = (x?: string | null) => x?.trim() || null;
  const nombre = limpio(d.nombre) || limpio(d.razon_social)
    || [limpio(d.apellido), limpio(d.nombre_pila)].filter(Boolean).join(", ") || limpio(d.email) || limpio(d.apodo_ml)
    || (d.id_externo ? `Cliente ${d.id_externo}` : "");
  const valores = [org, nombre || null, d.tipo === "mayorista" ? "mayorista" : null, limpio(d.email), limpio(d.telefono),
    doc ? normalDoc(d.documento_tipo) ?? (doc.length === 11 ? "CUIT" : "DNI") : null, doc, condicionIva(d.condicion_iva),
    limpio(d.razon_social), cuit, limpio(d.apodo_ml), limpio(d.nombre_pila), limpio(d.apellido), limpio(d.telefono_movil),
    JSON.stringify(d.datos_externos ?? {})];
  if (id) {
    await c.query(`
      update cliente set nombre = coalesce(nombre, $2), tipo = coalesce($3, tipo), email = coalesce(email, $4), telefono = coalesce(telefono, $5),
             documento_tipo = coalesce(documento_tipo, $6), documento_numero = coalesce(documento_numero, $7),
             condicion_iva = coalesce(condicion_iva, $8), razon_social = coalesce(razon_social, $9), cuit = coalesce(cuit, $10),
             apodo_ml = coalesce(apodo_ml, $11), nombre_pila = coalesce(nombre_pila, $12), apellido = coalesce(apellido, $13),
             telefono_movil = coalesce(telefono_movil, $14), datos_externos = datos_externos || $15::jsonb
       where id = $16 and organizacion_id = $1`, [...valores, id]);
  } else {
    if (!nombre) throw new ErrorErp("El cliente necesita al menos un nombre, un mail o su id en el canal.");
    const r = await c.query<{ id: string }>(`
      insert into cliente (organizacion_id, nombre, tipo, email, telefono, documento_tipo, documento_numero, condicion_iva,
                           razon_social, cuit, apodo_ml, nombre_pila, apellido, telefono_movil, datos_externos)
      values ($1, $2, coalesce($3, 'consumidor_final'), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb) returning id`, valores);
    id = Number(r.rows[0].id);
  }
  for (const [etiqueta, x] of [["Fiscal", d.direccion], ["Envío", d.direccion_envio]] as const) {
    if (!x || !Object.values(x).some((v) => v != null && v !== "")) continue;
    // No repite una dirección que ya tiene (mismo id en el canal, o misma calle, número y localidad).
    await c.query(`
      insert into cliente_direccion (organizacion_id, cliente_id, etiqueta, calle, numero, piso_depto, localidad, provincia, provincia_codigo,
                                     codigo_postal, pais, receptor, receptor_telefono, referencia, latitud, longitud, id_externo, principal)
      select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce($11, 'AR'), $12, $13, $14, $15, $16, $17,
             not exists (select 1 from cliente_direccion where cliente_id = $2)
       where not exists (select 1 from cliente_direccion where cliente_id = $2
                           and (($17::text is not null and id_externo = $17)
                                or (lower(coalesce(calle, '')) = lower(coalesce($4, '')) and coalesce(numero, '') = coalesce($5, '')
                                    and lower(coalesce(localidad, '')) = lower(coalesce($7, '')))))`,
      [org, id, etiqueta, x.calle ?? null, x.numero ?? null, x.piso_depto ?? null, x.localidad ?? null, x.provincia ?? null,
        x.provincia_codigo ?? null, x.codigo_postal ?? null, x.pais ?? null, x.receptor ?? null, x.receptor_telefono ?? null,
        x.referencia ?? null, x.latitud ?? null, x.longitud ?? null, x.id_externo != null ? String(x.id_externo) : null]);
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
