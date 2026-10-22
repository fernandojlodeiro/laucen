"use server";

// Acciones del espacio personal: cada una vuelve a mirar que quien la manda
// tenga el espacio (entrarPersonal) y sólo toca filas de ese espacio.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { motivoErp } from "@/lib/erp/base";
import { entrarPersonal, autorizar, desautorizar } from "@/lib/personal/espacio";
import { desconectar, lanzarInventario, lanzarMes, exportarAnio } from "@/lib/personal/mercadopago";

const volver = (q: string) => redirect(`/personal?${q}`);

export async function accionAutorizar(fd: FormData) {
  const { sesion, espacio } = await entrarPersonal();
  let error: string | null = null;
  try { await autorizar(espacio, sesion.usuario.id, String(fd.get("email") ?? "")); } catch (e) { error = motivoErp(e); }
  volver(error ? `nuevo=autorizar-a-alguien&error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent("Autorizado: ya puede entrar al espacio personal.")}`);
}

export async function accionDesautorizar(fd: FormData) {
  const { espacio } = await entrarPersonal();
  let error: string | null = null;
  try { await desautorizar(espacio, String(fd.get("usuario") ?? "")); } catch (e) { error = motivoErp(e); }
  volver(error ? `error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent("Listo: ya no entra.")}`);
}

export async function accionDesconectar(fd: FormData) {
  const { espacio } = await entrarPersonal();
  if (!espacio.esDueno) volver(`error=${encodeURIComponent("Sólo el dueño del espacio desconecta una cuenta.")}`);
  await desconectar(espacio.id, Number(fd.get("conexion")));
  volver(`ok=${encodeURIComponent("Cuenta desconectada: se borraron su llave y lo que se había bajado.")}`);
}

/** Los botones que demoran: corren de fondo y la pantalla se actualiza sola. */
export async function accionInventario(fd: FormData): Promise<{ ok: boolean; mensaje?: string }> {
  const { sesion, espacio } = await entrarPersonal();
  try { await lanzarInventario(espacio.id, sesion.usuario.id, Number(fd.get("conexion"))); } catch (e) { return { ok: false, mensaje: motivoErp(e) }; }
  revalidatePath("/personal");
  return { ok: true };
}

export async function accionMes(fd: FormData): Promise<{ ok: boolean; mensaje?: string }> {
  const { sesion, espacio } = await entrarPersonal();
  try {
    await lanzarMes(espacio.id, sesion.usuario.id, Number(fd.get("conexion")), String(fd.get("mes") ?? ""), fd.get("bajar") === "1");
  } catch (e) { return { ok: false, mensaje: motivoErp(e) }; }
  revalidatePath("/personal");
  return { ok: true };
}

/** El año entero a la cola (la vuelta de fondo lo pide y lo baja de a poco). */
export async function accionExportarAnio(fd: FormData) {
  const { espacio } = await entrarPersonal();
  let error: string | null = null, n = 0;
  try { n = await exportarAnio(espacio.id, Number(fd.get("conexion")), String(fd.get("desde") ?? ""), String(fd.get("hasta") ?? "")); } catch (e) { error = motivoErp(e); }
  volver(error ? `error=${encodeURIComponent(error)}` : `ok=${encodeURIComponent(n ? `Listo: ${n} pedidos en la cola. Se van pidiendo y bajando solos; mirá «Exportación del año».` : "Esos meses ya estaban en la cola.")}`);
}
