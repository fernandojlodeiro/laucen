"use server";

// Pedidos: el alta a mano ("Nuevo pedido") y el arreglo de una vez que une los
// carritos de Mercado Libre que quedaron partidos. El alta pasa por la misma
// función única que usa POST /api/pedidos (crearPedido), así la reserva de
// stock, el estado y la facturación andan igual que en cualquier canal.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { camposCliente } from "@/app/ventas/clientes/lista";
import { consulta, una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { intentar, numero, texto } from "@/lib/erp/acciones";
import { crearPedidoAMano, type PedidoAMano } from "@/lib/pedidos/a-mano";
import { precioDe } from "@/lib/precios";
import { unirPedidosPartidos } from "@/lib/mercadolibre/carritos";
import type { Moneda } from "@/lib/moneda";
import { normalizarCuit } from "@/lib/clientes";
import { DOCUMENTOS } from "@/app/ventas/formato";


export type ClienteHallado = {
  id: number; nombre: string; documento: string | null; email: string | null; cuentaCorriente: boolean;
  direccion: { calle: string | null; numero: string | null; localidad: string | null; provincia: string | null; codigo_postal: string | null } | null;
};

/** Alta rápida de un cliente desde el pedido (no lo encontraron en el buscador). Devuelve el cliente
 *  ya listo para elegirlo, o el motivo por el que no se pudo. */
export async function crearClienteDesdePedido(d: {
  nombre: string; tipo: string; documentoTipo: string; documentoNumero: string; email: string; telefono: string;
}): Promise<{ cliente?: ClienteHallado; error?: string }> {
  const s = await entrarErp("pedidos_ver");
  try {
    const nombre = d.nombre.trim().slice(0, 200);
    if (!nombre) return { error: "El cliente necesita un nombre." };
    const docTipo = (DOCUMENTOS as readonly string[]).includes(d.documentoTipo) ? d.documentoTipo : null;
    // CUIT, CUIL y DNI se guardan sólo con números (el pasaporte u otro, tal cual).
    const docTxt = d.documentoNumero.trim().slice(0, 30);
    const docNum = (docTipo === "CUIT" || docTipo === "CUIL" || docTipo === "DNI" ? docTxt.replace(/\D/g, "") : docTxt) || null;
    let cuit: string | null = null;
    if (docNum && docTipo === "CUIT") {
      cuit = normalizarCuit(docNum);
      if (!cuit) return { error: "El CUIT tiene que tener 11 números." };
    }
    if (docNum) {
      const repetido = await una<{ id: number; nombre: string }>(
        "select id::int, nombre from cliente where organizacion_id = $1 and documento_numero = $2 limit 1", [s.org.id, docNum]);
      if (repetido) return { error: `Ya hay un cliente con ese documento: N.º ${repetido.id} · ${repetido.nombre}. Buscalo en el cuadro.` };
    }
    const r = await una<{ id: number }>(`
      insert into cliente (organizacion_id, nombre, tipo, email, telefono, documento_tipo, documento_numero, cuit)
      values ($1, $2, $3, $4, $5, $6, $7, $8) returning id::int`,
      [s.org.id, nombre, d.tipo === "mayorista" ? "mayorista" : "consumidor_final", d.email.trim() || null, d.telefono.trim() || null, docTipo, docNum, cuit]);
    revalidatePath("/ventas/clientes");
    return { cliente: { id: r!.id, nombre, documento: docNum ? `${docTipo ?? ""} ${docNum}`.trim() : null, email: d.email.trim() || null, cuentaCorriente: false, direccion: null } };
  } catch (e) {
    return { error: motivoErp(e) };
  }
}

/** Clientes que coinciden con lo tipeado (en todos sus datos: N.º, nombre, razón social,
 *  documento, CUIT, mail, teléfonos, apodo de ML, notas), hasta 20. */
export async function buscarClientesPedido(q: string, comienza: boolean): Promise<ClienteHallado[]> {
  const s = await entrarErp("pedidos_ver");
  const t = q.trim();
  if (t.length < 2) return [];
  const filas = await consulta<{ id: number; nombre: string; documento: string | null; email: string | null; cuenta_corriente: boolean; direccion: ClienteHallado["direccion"] }>(`
    select cl.id::int, cl.nombre, nullif(concat_ws(' ', cl.documento_tipo, cl.documento_numero), '') documento, cl.email,
           coalesce(cl.cuenta_corriente, false) cuenta_corriente,
           (select jsonb_build_object('calle', d.calle, 'numero', d.numero, 'localidad', d.localidad, 'provincia', d.provincia, 'codigo_postal', d.codigo_postal)
              from cliente_direccion d where d.cliente_id = cl.id order by (d.etiqueta = 'Envío') desc, d.principal desc, d.id limit 1) direccion
      from cliente cl
     where cl.organizacion_id = $1
       and ${sqlBusqueda("$2", camposCliente("cl"))}
     order by cl.nombre limit 20`, [s.org.id, parametroBusqueda(t, comienza)]);
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
  const filas = await consulta<{ id: number; sku: string; titulo: string; disponible: number }>(`
    select v.id::int, v.sku, titulo_variacion(v.id) titulo, stock_disponible_canal($1, v.id, $4) disponible
      from variacion v join producto p on p.id = v.producto_id
     where v.organizacion_id = $1 and v.estado <> 'archivada' and p.estado <> 'archivado'
       and (v.codigo_barras = $3 or ${sqlBusqueda("$2", ["v.sku", "titulo_variacion(v.id)", "p.sku_base", "v.codigo_barras", "p.codigo_barras"])})
     order by (v.codigo_barras = $3) desc, (v.sku ilike $3) desc, v.sku limit 20`, [s.org.id, parametroBusqueda(t, comienza), t, canalId]);
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


/** Crea el pedido cargado a mano. Si sale bien va a su ficha; si no, devuelve
 *  el error y el formulario queda como estaba. */
export async function accionNuevoPedido(fd: FormData): Promise<{ error: string }> {
  const s = await entrarErp("pedidos_ver");
  let pedidoId: number;
  try {
    const consumidorFinal = fd.get("quien") !== "cliente";
    const clienteId = consumidorFinal ? null : Number(fd.get("cliente_id")) || null;
    if (!consumidorFinal && !clienteId) throw new ErrorErp("Elegí el cliente (o marcá «Consumidor final»).");

    const lineas: PedidoAMano["lineas"] = [];
    for (const [i, clave] of fd.getAll("linea").map(String).entries()) {
      const precio = numero(fd, `l_${clave}_precio`);
      const sugerido = numero(fd, `l_${clave}_sugerido`);
      if (precio == null) throw new ErrorErp(`Línea ${i + 1}: falta el precio.`);
      // Si el precio es el de la lista, lo pone crearPedido con precioDe (queda
      // registrado el precio de lista y su descuento); si se cambió, va el escrito.
      const deLista = sugerido != null && Math.abs(precio - sugerido) < 0.005;
      lineas.push({
        variacionId: Number(fd.get(`l_${clave}_variacion`)) || 0, cantidad: numero(fd, `l_${clave}_cantidad`) ?? 0,
        precio: deLista ? null : precio, descuentoPct: numero(fd, `l_${clave}_descuento`) ?? 0,
      });
    }
    const esPresupuesto = fd.get("tipo") === "presupuesto";
    const pago = String(fd.get("pago") ?? "a_convenir") as PedidoAMano["pago"];
    const entrega = fd.get("entrega") === "envio" ? "envio" : "retiro";
    const creado = await crearPedidoAMano(s.org.id, s.usuario.id, {
      canalId: Number(fd.get("canal")) || 0,
      clienteId,
      lineas,
      pago,
      medio: pago === "cuenta_corriente" ? null : texto(fd, "medio_pago"),
      entrega,
      direccion: entrega === "envio" ? {
        calle: texto(fd, "calle"), numero: texto(fd, "numero"), piso_depto: texto(fd, "piso_depto"), localidad: texto(fd, "localidad"),
        provincia: texto(fd, "provincia"), codigo_postal: texto(fd, "codigo_postal"), referencia: texto(fd, "referencia"),
      } : null,
      costoEnvio: entrega === "envio" ? numero(fd, "costo_envio") : null,
      notas: texto(fd, "notas"),
      presupuesto: esPresupuesto ? { vigencia: texto(fd, "vigencia") } : null,
    });
    pedidoId = creado.pedidoId;
  } catch (e) {
    return { error: motivoErp(e) };
  }
  revalidatePath("/ventas/pedidos");
  redirect(`/ventas/pedidos/${pedidoId}?ok=${encodeURIComponent(`${fd.get("tipo") === "presupuesto" ? "Presupuesto" : "Pedido"} ${pedidoId} creado.`)}`);
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
