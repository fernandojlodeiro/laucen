"use server";

// Acciones de la tienda pública: carrito, checkout, pagos y cuenta del
// comprador. Toda la lógica de negocio está en lib/tienda/*; acá se lee el
// formulario, se verifica contra la tienda (organización y canal) y se vuelve.

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { leerCarrito, sumarAlCarrito, fijarCantidad, vaciarCarrito } from "@/lib/tienda/carrito";
import { comprar, cobrarConPayway, mediosActivos, type DatosCompra } from "@/lib/tienda/checkout";
import { cuentaActual, crearCuentaDesdePedido, ingresar, cerrarSesion } from "@/lib/tienda/cuentas";
import { MARCAS_PAYWAY } from "@/lib/tienda/pagos/payway";
import { rutaTienda, type Tienda } from "@/lib/tienda/tienda";
import { abierta, cargarTienda } from "./catalogo";
import { preferenciaNueva } from "./pagos";
import { metodosEnvio, resumir, type Eleccion, type Resumen } from "./resumen";
import { sinDireccion, CONDICIONES_IVA } from "./comun";

async function tiendaDe(fd: FormData | string): Promise<Tienda> {
  return cargarTienda(typeof fd === "string" ? fd : String(fd.get("slug") ?? ""));
}

/** https://host de este request (para las direcciones de vuelta de los pagos). */
async function origen(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto.split(",")[0]}://${host.split(",")[0]}`;
}

const refrescar = (t: Tienda) => revalidatePath(rutaTienda(t), "layout");

/** Variación vendible en esta tienda: de la organización, activa, con producto activo y precio en la lista. */
async function vendible(t: Tienda, variacionId: number) {
  if (!t.listaId || !variacionId) return null;
  return una<{ disponible: number }>(`
    select greatest(stock_disponible_canal($1, v.id, $3), 0)::int disponible
      from variacion v join producto p on p.id = v.producto_id
     where v.id = $2 and v.organizacion_id = $1 and v.estado = 'activa' and p.estado = 'activo'
       and exists (select 1 from precio_de($1, v.id, $4))`, [t.organizacionId, variacionId, t.canalId, t.listaId]);
}

// ── Carrito ──────────────────────────────────────────────
export async function agregarAlCarrito(fd: FormData) {
  const t = await tiendaDe(fd);
  const variacionId = id(fd, "variacion");
  const volver = `${rutaTienda(t, `/producto/${id(fd, "producto")}`)}?v=${variacionId}`;
  await intentar(volver, async () => {
    if (!abierta(t)) throw new ErrorErp("La tienda no está tomando pedidos en este momento.");
    const cantidad = Math.min(999, Math.max(1, Math.trunc(Number(fd.get("cantidad"))) || 1));
    const v = await vendible(t, variacionId);
    if (!v) throw new ErrorErp("Ese producto no está disponible.");
    const ya = (await leerCarrito(t.slug)).find((l) => l.variacionId === variacionId)?.cantidad ?? 0;
    if (v.disponible <= 0) throw new ErrorErp("Ese producto está sin stock.");
    if (ya + cantidad > v.disponible) {
      throw new ErrorErp(v.disponible === 1 ? "Queda 1 sola unidad." : `Quedan ${v.disponible} unidades${ya ? ` y ya tenés ${ya} en el carrito` : ""}.`);
    }
    await sumarAlCarrito(t.slug, variacionId, cantidad);
    refrescar(t);
    // "Comprar ahora" va directo a finalizar la compra; "Agregar al carrito", al carrito.
    return { ir: rutaTienda(t, fd.get("ir") === "checkout" ? "/checkout" : "/carrito") };
  });
}

/** "Comprar ahora": lo mismo que agregar al carrito, pero sigue al checkout. */
export async function comprarAhora(fd: FormData) {
  fd.set("ir", "checkout");
  await agregarAlCarrito(fd);
}

/** El código postal del "Enviar a …" del encabezado (cookie de la tienda, un año). */
export async function guardarCodigoPostal(fd: FormData) {
  const t = await tiendaDe(fd);
  const cp = String(fd.get("cp") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const c = await cookies();
  if (cp.length >= 4) c.set(`cp_${t.slug}`, cp, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: true });
  else c.delete(`cp_${t.slug}`);
  refrescar(t);
}

export async function cambiarCantidad(fd: FormData) {
  const t = await tiendaDe(fd);
  await intentar(rutaTienda(t, "/carrito"), async () => {
    const cantidad = Math.min(999, Math.max(0, Math.trunc(Number(fd.get("cantidad"))) || 0));
    await fijarCantidad(t.slug, id(fd, "variacion"), cantidad);
    refrescar(t);
  });
}

// ── Checkout ─────────────────────────────────────────────
/** Recotiza el resumen del checkout al cambiar envío, medio o provincia. */
export async function cotizarAccion(slug: string, e: Eleccion): Promise<{ resumen: Resumen } | { error: string }> {
  try {
    const t = await tiendaDe(slug);
    const carrito = await leerCarrito(t.slug);
    const medio = typeof e.medio === "string" ? e.medio.slice(0, 30) : null;
    const provincia = typeof e.provincia === "string" ? e.provincia.slice(0, 60) : null;
    const metodoEnvioId = Number.isInteger(e.metodoEnvioId) ? e.metodoEnvioId : null;
    return { resumen: await resumir(t, carrito, { medio, provincia, metodoEnvioId }) };
  } catch (err) {
    return { error: motivoErp(err) };
  }
}

const MEDIOS = ["mercadopago", "payway", "transferencia", "efectivo", "cuenta_corriente"] as const;

/** Confirma la compra: crea el pedido (comprar), vacía el carrito y dice a dónde seguir. */
export async function confirmarCompra(fd: FormData): Promise<{ ir: string } | { error: string }> {
  try {
    const t = await tiendaDe(fd);
    const carrito = await leerCarrito(t.slug);
    const cuenta = await cuentaActual(t);
    const medio = MEDIOS.find((m) => m === fd.get("medio"));
    if (!medio) throw new ErrorErp("Elegí un medio de pago.");
    if (medio === "cuenta_corriente" && !cuenta?.cuentaCorriente) throw new ErrorErp("La cuenta corriente es sólo para clientes habilitados.");
    if (!(await mediosActivos(t)).some((m) => m.tipo === medio)) throw new ErrorErp("Ese medio de pago no está disponible. Elegí otro.");
    const metodoId = id(fd, "metodo_envio");
    const metodo = (await metodosEnvio(t)).find((m) => m.id === metodoId && m.disponible);
    if (!metodo) throw new ErrorErp("Elegí cómo lo recibís.");
    const doc = (texto(fd, "documento") ?? "").replace(/\D/g, "");
    const esCuit = doc.length === 11;
    const conDireccion = !sinDireccion(metodo.tipo);
    const condicion = texto(fd, "condicion_iva");
    const datos: DatosCompra = {
      carrito,
      cliente: {
        nombre: texto(fd, "nombre") ?? "", email: (texto(fd, "email") ?? "").toLowerCase(), telefono: texto(fd, "telefono"),
        documento: doc || null, cuit: esCuit ? doc : null,
        razon_social: esCuit ? texto(fd, "razon_social") : null,
        condicion_iva: esCuit && condicion && CONDICIONES_IVA.some(([k]) => k === condicion) ? condicion : null,
      },
      entrega: {
        metodoEnvioId: metodo.id,
        calle: conDireccion ? texto(fd, "calle") : null, numero: conDireccion ? texto(fd, "numero") : null,
        piso_depto: conDireccion ? texto(fd, "piso_depto") : null, localidad: conDireccion ? texto(fd, "localidad") : null,
        provincia: conDireccion ? texto(fd, "provincia") : null, codigo_postal: conDireccion ? texto(fd, "codigo_postal") : null,
        referencia: conDireccion ? texto(fd, "referencia") : null,
      },
      medio,
      notas: texto(fd, "notas"),
    };
    const r = await comprar(t, datos, { origen: await origen(), clienteId: cuenta?.clienteId ?? null });
    await vaciarCarrito(t.slug);
    refrescar(t);
    return { ir: r.ir };
  } catch (err) {
    return { error: motivoErp(err) };
  }
}

// ── Pagos desde la página del pedido ────────────────────
export async function reintentarMercadoPago(fd: FormData) {
  const t = await tiendaDe(fd);
  const codigo = String(fd.get("codigo") ?? "");
  let ir: string;
  try {
    ir = await preferenciaNueva(t, codigo, await origen());
  } catch (err) {
    redirect(`${rutaTienda(t, `/pedido/${encodeURIComponent(codigo)}`)}?pago=fallo&error=${encodeURIComponent(motivoErp(err))}`);
  }
  redirect(ir);
}

export async function pagarConTarjeta(slug: string, codigo: string, tarjeta: { token: string; bin: string; marca: number; cuotas: number }):
  Promise<{ aprobado: boolean; detalle: string } | { error: string }> {
  try {
    const t = await tiendaDe(slug);
    const token = String(tarjeta?.token ?? "");
    const bin = String(tarjeta?.bin ?? "").replace(/\D/g, "").slice(0, 8);
    const marca = Number(tarjeta?.marca);
    const cuotas = Math.trunc(Number(tarjeta?.cuotas)) || 1;
    if (!token || token.length > 200) throw new ErrorErp("No se pudo leer la tarjeta. Revisá los datos.");
    if (!MARCAS_PAYWAY.some((m) => m.id === marca)) throw new ErrorErp("Elegí la tarjeta.");
    if (cuotas < 1 || cuotas > 24) throw new ErrorErp("Elegí las cuotas.");
    const r = await cobrarConPayway(t, String(codigo), { token, bin, marca, cuotas });
    revalidatePath(rutaTienda(t, `/pedido/${codigo}`));
    return r;
  } catch (err) {
    return { error: motivoErp(err) };
  }
}

// ── Cuenta del comprador ────────────────────────────────
export async function crearCuenta(fd: FormData) {
  const t = await tiendaDe(fd);
  const codigo = String(fd.get("codigo") ?? "");
  await intentar(rutaTienda(t, `/pedido/${encodeURIComponent(codigo)}`), async () => {
    await crearCuentaDesdePedido(t, codigo, String(fd.get("clave") ?? ""));
    refrescar(t);
    return "¡Listo! Ya tenés tu cuenta: la próxima compra es más rápida.";
  });
}

export async function ingresarAccion(fd: FormData) {
  const t = await tiendaDe(fd);
  const volver = fd.get("volver") === "checkout" ? rutaTienda(t, "/checkout") : null;
  await intentar(rutaTienda(t, `/cuenta${volver ? "?volver=checkout" : ""}`), async () => {
    const email = texto(fd, "email"), clave = String(fd.get("clave") ?? "");
    if (!email || !clave) throw new ErrorErp("Completá tu mail y tu contraseña.");
    await ingresar(t, email, clave);
    refrescar(t);
    return volver ? { ir: volver } : undefined;
  });
}

export async function salirAccion(fd: FormData) {
  const t = await tiendaDe(fd);
  await cerrarSesion(t);
  refrescar(t);
  redirect(rutaTienda(t, "/cuenta"));
}
