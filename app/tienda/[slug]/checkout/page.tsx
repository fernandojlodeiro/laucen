// Checkout de un paso: datos, entrega, medio de pago y resumen recotizado. El
// formulario es un componente de cliente (recotiza al cambiar envío, medio o
// provincia); acá se cargan los datos y se precarga lo del comprador con cuenta.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { consulta, una, motivoErp } from "@/lib/erp/base";
import { leerCarrito } from "@/lib/tienda/carrito";
import { mediosActivos } from "@/lib/tienda/checkout";
import { cuentaActual } from "@/lib/tienda/cuentas";
import { rutaTienda } from "@/lib/tienda/tienda";
import { abierta, cargarTienda } from "../catalogo";
import { Aviso, BOTON, TITULO } from "../piezas";
import { metodosEnvio, resumir, type Resumen } from "../resumen";
import Checkout, { type Precarga } from "./Checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finalizar compra" };

export default async function PaginaCheckout({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const carrito = await leerCarrito(t.slug);
  if (!carrito.length) redirect(rutaTienda(t, "/carrito"));
  if (!abierta(t)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <Aviso>La tienda no está tomando pedidos en este momento.</Aviso>
        <Link href={rutaTienda(t, "/carrito")} className={BOTON}>Volver al carrito</Link>
      </div>
    );
  }

  const cuenta = await cuentaActual(t);
  const [medios, metodos] = await Promise.all([mediosActivos(t), metodosEnvio(t)]);
  const mediosVisibles = medios.filter((m) => m.tipo !== "cuenta_corriente" || cuenta?.cuentaCorriente);

  // Precarga: los datos del cliente con cuenta (y su dirección principal).
  let precarga: Precarga = {};
  if (cuenta) {
    const c = await una<{ nombre: string; email: string | null; telefono: string | null; documento_numero: string | null; cuit: string | null; razon_social: string | null; condicion_iva: string | null }>(
      "select nombre, email, telefono, documento_numero, cuit, razon_social, condicion_iva from cliente where id = $1 and organizacion_id = $2", [cuenta.clienteId, t.organizacionId]);
    const d = (await consulta<{ calle: string | null; numero: string | null; piso_depto: string | null; localidad: string | null; provincia: string | null; codigo_postal: string | null }>(
      `select calle, numero, piso_depto, localidad, provincia, codigo_postal from cliente_direccion
        where cliente_id = $1 and organizacion_id = $2 order by principal desc, id desc limit 1`, [cuenta.clienteId, t.organizacionId]))[0];
    precarga = {
      nombre: c?.nombre ?? cuenta.nombre, email: cuenta.email, telefono: c?.telefono ?? "", documento: c?.cuit || c?.documento_numero || "",
      razon_social: c?.razon_social ?? "", condicion_iva: c?.condicion_iva ?? "",
      calle: d?.calle ?? "", numero: d?.numero ?? "", piso_depto: d?.piso_depto ?? "", localidad: d?.localidad ?? "", provincia: d?.provincia ?? "", codigo_postal: d?.codigo_postal ?? "",
    };
  }

  const primerMetodo = metodos.find((m) => m.disponible)?.id ?? null;
  const primerMedio = mediosVisibles[0]?.tipo ?? null;
  let resumen: Resumen | null = null, error: string | null = null;
  try {
    resumen = await resumir(t, carrito, { metodoEnvioId: primerMetodo, medio: primerMedio, provincia: precarga.provincia || null }, metodos);
  } catch (e) { error = motivoErp(e); }
  if (resumen && !resumen.lineas.length) redirect(rutaTienda(t, "/carrito"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={TITULO}>Finalizar compra</h1>
        {!cuenta && <Link href={`${rutaTienda(t, "/cuenta")}?volver=checkout`} className="text-sm font-semibold text-[var(--acento)] hover:underline">¿Ya tenés cuenta? Ingresá</Link>}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {resumen && (
        <Checkout slug={t.slug} medios={mediosVisibles} metodos={metodos} inicial={resumen} precarga={precarga}
          eleccion={{ metodoEnvioId: primerMetodo, medio: primerMedio, provincia: precarga.provincia || "" }} />
      )}
    </div>
  );
}
