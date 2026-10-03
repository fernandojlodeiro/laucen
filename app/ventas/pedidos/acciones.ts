"use server";

// Pedidos: el alta a mano ("Nuevo pedido") y el arreglo de una vez que une los
// carritos de Mercado Libre que quedaron partidos. El alta pasa por la misma
// función única que usa POST /api/pedidos (crearPedido), así la reserva de
// stock, el estado y la facturación andan igual que en cualquier canal.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { entrarErp, patronBusqueda } from "@/app/componentes/erp";
import { consulta, una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { intentar, numero, texto } from "@/lib/erp/acciones";
import { crearPedido, cambiarEstado, type LineaEntrada } from "@/lib/pedidos";
import { precioDe } from "@/lib/precios";
import { confirmarPago } from "@/lib/tienda/pagos/confirmar";
import { unirPedidosPartidos } from "@/lib/mercadolibre/carritos";
import type { Moneda } from "@/lib/moneda";

/** Canales donde se carga un pedido a mano: todos menos Mercado Libre (sus
 *  pedidos entran solos) y las ventas históricas. */
const TIPOS_A_MANO = ["local", "web_minorista", "web_mayorista", "otro"];

export type ClienteHallado = {
  id: number; nombre: string; documento: string | null; email: string | null; cuentaCorriente: boolean;
  direccion: { calle: string | null; numero: string | null; localidad: string | null; provincia: string | null; codigo_postal: string | null } | null;
};

/** Clientes que coinciden con lo tipeado (nombre, razón social, documento,
 *  CUIT, mail o apodo de ML), hasta 20. */
export async function buscarClientesPedido(q: string, comienza: boolean): Promise<ClienteHallado[]> {
  const s = await entrarErp("pedidos_ver");
  const t = q.trim();
  if (t.length < 2) return [];
  const patron = patronBusqueda(t, comienza);
  const filas = await consulta<{ id: number; nombre: string; documento: string | null; email: string | null; cuenta_corriente: boolean; direccion: ClienteHallado["direccion"] }>(`
    select cl.id::int, cl.nombre, nullif(concat_ws(' ', cl.documento_tipo, cl.documento_numero), '') documento, cl.email,
           coalesce(cl.cuenta_corriente, false) cuenta_corriente,
           (select jsonb_build_object('calle', d.calle, 'numero', d.numero, 'localidad', d.localidad, 'provincia', d.provincia, 'codigo_postal', d.codigo_postal)
              from cliente_direccion d where d.cliente_id = cl.id order by (d.etiqueta = 'Envío') desc, d.principal desc, d.id limit 1) direccion
      from cliente cl
     where cl.organizacion_id = $1
       and (cl.nombre ilike $2 or cl.razon_social ilike $2 or cl.email ilike $2 or cl.apodo_ml ilike $2
            or cl.documento_numero ilike $2 or cl.cuit ilike $2 or cl.id::text = $3)
     order by cl.nombre limit 20`, [s.org.id, patron, t]);
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, documento: f.documento, email: f.email, cuentaCorriente: f.cuenta_corriente, direccion: f.direccion }));
}

export type ProductoHallado = { id: number; sku: string; titulo: string; precio: number | null; disponible: number };

/** La lista de precios que usa el pedido: la del cliente si tiene, si no la
 *  del canal (lo mismo que hace crearPedido). */
async function listaDelPedido(org: string, canalId: number, clienteId: number | null) {
  const r = await una<{ lista: string | null; moneda: Moneda | null }>(`
    select coalesce(cl.lista_precios_id, ca.lista_precios_id) lista, l.moneda_base moneda
      from canal ca left join cliente cl on cl.id = $3 and cl.organizacion_id = $1
      left join lista_precios l on l.id = coalesce(cl.lista_precios_id, ca.lista_precios_id)
     where ca.id = $2 and ca.organizacion_id = $1`, [org, canalId, clienteId]);
  return { listaId: r?.lista ? Number(r.lista) : null, moneda: (r?.moneda ?? "ARS") as Moneda };
}

async function precioSugerido(org: string, variacionId: number, listaId: number | null, moneda: Moneda) {
  if (!listaId) return null;
  const p = await precioDe(org, variacionId, listaId);
  return p ? (moneda === "USD" ? p.venta.usd : p.venta.ars) : null;
}

/** Productos por SKU, código de barras o título, con el precio de la lista
 *  del pedido (precioDe) y lo disponible para el canal. Hasta 20. */
export async function buscarProductosPedido(q: string, comienza: boolean, canalId: number, clienteId: number | null): Promise<ProductoHallado[]> {
  const s = await entrarErp("pedidos_ver");
  const t = q.trim();
  if (t.length < 2 || !canalId) return [];
  const patron = patronBusqueda(t, comienza);
  const filas = await consulta<{ id: number; sku: string; titulo: string; disponible: number }>(`
    select v.id::int, v.sku, titulo_variacion(v.id) titulo, stock_disponible_canal($1, v.id, $4) disponible
      from variacion v join producto p on p.id = v.producto_id
     where v.organizacion_id = $1 and v.estado <> 'archivada' and p.estado <> 'archivado'
       and (v.sku ilike $2 or v.codigo_barras = $3 or titulo_variacion(v.id) ilike $2)
     order by (v.codigo_barras = $3) desc, v.sku limit 20`, [s.org.id, patron, t, canalId]);
  const { listaId, moneda } = await listaDelPedido(s.org.id, canalId, clienteId);
  return Promise.all(filas.map(async (f) => ({ ...f, precio: await precioSugerido(s.org.id, f.id, listaId, moneda) })));
}

/** El precio de lista de varias variaciones (cuando cambia el canal o el cliente). */
export async function preciosPedido(canalId: number, clienteId: number | null, variaciones: number[]): Promise<{ moneda: Moneda; precios: Record<number, number | null> }> {
  const s = await entrarErp("pedidos_ver");
  const { listaId, moneda } = await listaDelPedido(s.org.id, canalId, clienteId);
  const precios: Record<number, number | null> = {};
  for (const v of variaciones.slice(0, 200)) precios[v] = await precioSugerido(s.org.id, v, listaId, moneda);
  return { moneda, precios };
}

const MEDIOS = ["Efectivo", "Transferencia", "Tarjeta de débito", "Tarjeta de crédito", "Mercado Pago", "Cheque", "Otro"];

/** Crea el pedido cargado a mano. Si sale bien va a su ficha; si no, devuelve
 *  el error y el formulario queda como estaba. */
export async function accionNuevoPedido(fd: FormData): Promise<{ error: string }> {
  const s = await entrarErp("pedidos_ver");
  const org = s.org.id;
  let pedidoId: number;
  let aviso = "";
  try {
    const canalId = Number(fd.get("canal")) || 0;
    const canal = await una<{ tipo: string; estado: string }>("select tipo, estado from canal where id = $1 and organizacion_id = $2", [canalId, org]);
    if (!canal) throw new ErrorErp("Elegí el canal.");
    if (!TIPOS_A_MANO.includes(canal.tipo)) {
      throw new ErrorErp(canal.tipo === "mercadolibre" ? "Los pedidos de Mercado Libre entran solos: no se cargan a mano." : "En ese canal no se cargan pedidos a mano.");
    }
    if (canal.estado !== "activo") throw new ErrorErp("Ese canal no está activo.");

    const consumidorFinal = fd.get("quien") !== "cliente";
    const clienteId = consumidorFinal ? null : Number(fd.get("cliente_id")) || null;
    if (!consumidorFinal && !clienteId) throw new ErrorErp("Elegí el cliente (o marcá «Consumidor final»).");

    const lineas: LineaEntrada[] = [];
    for (const [i, clave] of fd.getAll("linea").map(String).entries()) {
      const n = i + 1;
      const variacionId = Number(fd.get(`l_${clave}_variacion`)) || 0;
      const cantidad = numero(fd, `l_${clave}_cantidad`);
      const precio = numero(fd, `l_${clave}_precio`);
      const sugerido = numero(fd, `l_${clave}_sugerido`);
      const descuento = numero(fd, `l_${clave}_descuento`) ?? 0;
      if (!variacionId) throw new ErrorErp(`Línea ${n}: falta el producto.`);
      if (cantidad == null || !Number.isInteger(cantidad) || cantidad <= 0) throw new ErrorErp(`Línea ${n}: la cantidad tiene que ser un entero mayor que cero.`);
      if (precio == null) throw new ErrorErp(`Línea ${n}: falta el precio.`);
      // Si el precio es el de la lista, lo pone crearPedido con precioDe (queda
      // registrado el precio de lista y su descuento); si se cambió, va el escrito.
      const deLista = sugerido != null && Math.abs(precio - sugerido) < 0.005;
      lineas.push({ variacion_id: variacionId, cantidad, precio_unitario: deLista ? null : precio, descuento_pct: descuento || null });
    }
    if (!lineas.length) throw new ErrorErp("Agregá al menos un producto.");

    const pago = String(fd.get("pago") ?? "a_convenir");
    if (!["a_convenir", "pagado", "cuenta_corriente"].includes(pago)) throw new ErrorErp("Elegí el estado del pago.");
    const medio = pago === "cuenta_corriente" ? "Cuenta corriente" : texto(fd, "medio_pago");
    if (medio && pago !== "cuenta_corriente" && !MEDIOS.includes(medio)) throw new ErrorErp("Medio de pago desconocido.");
    if (pago === "pagado" && !medio) throw new ErrorErp("Elegí con qué pagó.");
    if (pago === "cuenta_corriente" && !clienteId) throw new ErrorErp("La cuenta corriente necesita un cliente (no consumidor final).");

    const entrega = fd.get("entrega") === "envio" ? "envio" : "retiro";
    const direccion = entrega === "envio" ? {
      calle: texto(fd, "calle"), numero: texto(fd, "numero"), piso_depto: texto(fd, "piso_depto"), localidad: texto(fd, "localidad"),
      provincia: texto(fd, "provincia"), codigo_postal: texto(fd, "codigo_postal"), referencia: texto(fd, "referencia"),
    } : null;
    if (direccion && (!direccion.calle || !direccion.localidad)) throw new ErrorErp("Para el envío completá al menos la calle y la localidad.");
    const costoEnvio = entrega === "envio" ? numero(fd, "costo_envio") : null;

    const creado = await crearPedido(org, {
      canalId,
      clienteId,
      lineas,
      medio_pago: medio,
      estado_pago: pago === "pagado" ? "pendiente" : "a_convenir",
      envio: { metodo: entrega === "envio" ? "Envío" : "Retira", a_mano: true, direccion },
      costo_envio: costoEnvio || null,
      notas: texto(fd, "notas"),
      datos_externos: { a_mano: { usuario: s.usuario.id, pago } },
    }, s.usuario.id);
    pedidoId = creado.pedidoId;

    if (pago === "pagado") {
      // Igual que «Confirmar pago» de la ficha: queda el pago, el pedido pagado y la reserva.
      await confirmarPago(org, pedidoId, { medio: medio!, importe: creado.total.ars }, s.usuario.id);
    } else if (pago === "cuenta_corriente") {
      // Venta cerrada a cuenta: el pedido queda confirmado (reserva el stock) y el pago, a convenir.
      await cambiarEstado(org, pedidoId, "pagado", s.usuario.id, "a cuenta corriente");
    }
    aviso = `Pedido ${pedidoId} creado.`;
  } catch (e) {
    return { error: motivoErp(e) };
  }
  revalidatePath("/ventas/pedidos");
  redirect(`/ventas/pedidos/${pedidoId}?ok=${encodeURIComponent(aviso)}`);
}

/** Une los carritos de Mercado Libre que quedaron partidos en varios pedidos
 *  (arreglo de una vez; lo dispara Fer). Informa los que no pudo unir. */
export async function accionUnirCarritos() {
  const s = await entrarErp("pedidos_ver");
  await intentar("/ventas/pedidos", async () => {
    const r = await unirPedidosPartidos(s.org.id, s.usuario.id);
    revalidatePath("/ventas/pedidos");
    const partes = [];
    if (r.unidos.length) partes.push(`Se unieron ${r.unidos.length === 1 ? "1 carrito" : `${r.unidos.length} carritos`}: ${r.unidos.map((u) => `pedido ${u.pedidoId} (+${u.absorbidos.join(", ")})`).join("; ")}.`);
    else partes.push("No se unió ningún carrito.");
    if (r.sinUnir.length) partes.push(`No se pudieron unir: ${r.sinUnir.map((x) => `carrito ${x.pack} (pedidos ${x.pedidos.join(", ")}): ${x.motivo}`).join("; ")}.`);
    return partes.join(" ");
  });
}
