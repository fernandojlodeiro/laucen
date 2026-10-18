"use server";

// Clasificar un gasto desde el espacio personal. Un movimiento de una cuenta de la empresa (marcado
// como personal) se puede reclasificar desde acá sólo si quien lo hace es el dueño de la organización.

import { redirect } from "next/navigation";
import { motivoErp } from "@/lib/erp/base";
import { entrarPersonal } from "@/lib/personal/espacio";
import { marcarPersonal, marcarEmpresa, leerMarca, orgsDelDueno } from "@/lib/mercadopago/gastos-datos";
import { OPCIONES_CATEGORIA } from "@/app/componentes/RevisarGastos";
import { consulta } from "@/lib/erp/base";
import { crearProveedor, asignarCuenta, editarProveedor, borrarProveedor } from "@/lib/personal/destinatarios";
import type { Opcion } from "@/app/componentes/ElegirDeLista";

export async function accionClasificarPersonal(fd: FormData) {
  const { sesion, espacio } = await entrarPersonal();
  const volver = String(fd.get("volver") ?? "/personal/gastos/revisar");
  let error: string | null = null;
  try {
    const m = leerMarca(fd, OPCIONES_CATEGORIA);
    if (fd.get("lado") === "empresa") {
      if (!espacio.esDueno) throw new Error("Sólo el dueño reclasifica un pago de la empresa desde acá.");
      const orgs = await orgsDelDueno(sesion.usuario.id);
      const c = await consulta<{ organizacion_id: string }>("select organizacion_id from mp_conexion where id = $1", [m.conexionId]);
      if (!c[0] || !orgs.includes(c[0].organizacion_id)) throw new Error("Esa cuenta no es de una organización tuya.");
      await marcarEmpresa(c[0].organizacion_id, sesion.usuario.id, m);
    } else await marcarPersonal(espacio.id, sesion.usuario.id, m);
  } catch (e) { error = motivoErp(e); }
  redirect(`${volver}${volver.includes("?") ? "&" : "?"}${error ? `error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent("Clasificado.")}`}`);
}

// Destinatarios y proveedores (lib/personal/destinatarios.ts): cada cuenta destino se asigna a un proveedor con su
// tipo de gasto; el tipo de gasto es del proveedor y vale para todas sus cuentas.

function leerTipo(fd: FormData) {
  const cat = OPCIONES_CATEGORIA.find((o) => o.id === Number(fd.get("categoria")))?.texto ?? null;
  return { categoria: cat, ambito: String(fd.get("ambito") ?? "") || null, recurrencia: String(fd.get("recurrencia") ?? "") || null };
}

function volverCon(fd: FormData, base: string, error: string | null, ok: string): never {
  const volver = String(fd.get("volver") ?? base);
  redirect(`${volver}${volver.includes("?") ? "&" : "?"}${error ? `error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent(ok)}`}`);
}

/** «+ Crear «…»» del elegir proveedor. */
export async function accionCrearProveedor(nombre: string): Promise<Opcion | { error: string }> {
  const { espacio } = await entrarPersonal();
  try {
    const p = await crearProveedor(espacio.id, nombre);
    return { id: p.id, texto: p.nombre };
  } catch (e) {
    return { error: motivoErp(e) };
  }
}

export async function accionAsignarDestino(fd: FormData) {
  const { sesion, espacio } = await entrarPersonal();
  let error: string | null = null;
  try {
    const proveedor = Number(fd.get("proveedor")) || null;
    await asignarCuenta(espacio.id, sesion.usuario.id, String(fd.get("cuenta") ?? ""), proveedor, proveedor ? leerTipo(fd) : undefined);
  } catch (e) { error = motivoErp(e); }
  volverCon(fd, "/personal/gastos/destinatarios", error, "Grabado.");
}

export async function accionEditarProveedor(fd: FormData) {
  const { espacio } = await entrarPersonal();
  let error: string | null = null;
  try {
    await editarProveedor(espacio.id, Number(fd.get("id")), { nombre: String(fd.get("nombre") ?? ""), ...leerTipo(fd) });
  } catch (e) { error = motivoErp(e); }
  volverCon(fd, "/personal/gastos/proveedores", error, "Grabado.");
}

export async function accionBorrarProveedor(fd: FormData) {
  const { espacio } = await entrarPersonal();
  let error: string | null = null;
  try {
    await borrarProveedor(espacio.id, Number(fd.get("id")));
  } catch (e) { error = motivoErp(e); }
  volverCon(fd, "/personal/gastos/proveedores", error, "Proveedor borrado: sus cuentas quedaron sin proveedor.");
}
