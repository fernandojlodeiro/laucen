"use server";
// El embudo de publicidad: leer los anuncios de Meta en el momento y desconectar la cuenta (lib/publicidad/meta-ads.ts).

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar } from "@/lib/erp/acciones";
import { deFondo } from "@/lib/tareas-fondo";
import { ErrorErp } from "@/lib/erp/base";
import { desconectarAnunciosMeta, elegirCuentaMeta, leerAnunciosMeta } from "@/lib/publicidad/meta-ads";
import { desconectarGoogleAds, elegirCuentaGoogle, guardarAppGoogleAds, leerGoogleAds } from "@/lib/publicidad/google-ads";
import { texto } from "@/lib/erp/acciones";

const VOLVER = "/informes/embudo-publicidad";

/** «Leer los anuncios ahora»: Meta y Google, los que estén conectados. */
export async function accionLeerAnuncios() {
  const s = await entrarErp("publicidad_ver");
  return deFondo(s, "anuncios", "Anuncios de Meta y Google", async () => {
    const [m, g] = await Promise.all([leerAnunciosMeta(s.org.id), leerGoogleAds(s.org.id)]);
    revalidatePath(VOLVER);
    const mal = [m.estado === "rechazo" ? "Meta" : null, g.estado === "rechazo" ? "Google" : null].filter(Boolean);
    if (mal.length) throw new ErrorErp(`${mal.join(" y ")} no dejó leer los anuncios: volvé a conectar la cuenta.`);
    return "Listo: anuncios leídos.";
  });
}

export async function accionDesconectarGoogle() {
  const s = await entrarErp("publicidad_ver");
  await intentar(VOLVER, async () => {
    await desconectarGoogleAds(s.org.id);
    revalidatePath(VOLVER);
    return "Listo: la cuenta de Google Ads quedó desconectada.";
  });
}

/** Leer o no una cuenta de anuncios conectada (la caja «Leer» de cada cuenta). */
export async function accionElegirCuenta(fd: FormData) {
  const s = await entrarErp("publicidad_ver");
  await intentar(VOLVER, async () => {
    const plataforma = texto(fd, "plataforma");
    const id = (texto(fd, "cuenta") ?? "").trim();
    if (!/^[\w-]{1,40}$/.test(id) || (plataforma !== "meta" && plataforma !== "google")) throw new ErrorErp("No se sabe qué cuenta.");
    const leer = fd.get("valor") === "1";
    await (plataforma === "meta" ? elegirCuentaMeta : elegirCuentaGoogle)(s.org.id, id, leer);
    revalidatePath(VOLVER);
    return leer ? "Listo: esa cuenta vuelve a entrar al embudo." : "Listo: esa cuenta ya no entra al embudo.";
  });
}

/** La app de Google de Laucen (el cliente OAuth): sólo el dueño del sistema. Las claves no se
 *  vuelven a mostrar; vacías, quedan las que estaban. */
export async function accionGuardarAppGoogle(fd: FormData) {
  await entrarErp("publicidad_ver");
  const { sosVos } = await import("@/lib/admin");
  await intentar(`${VOLVER}?editar=google`, async () => {
    if (!(await sosVos())) throw new ErrorErp("Esto lo carga sólo el dueño del sistema.");
    const clientId = (texto(fd, "client_id") ?? "").trim();
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new ErrorErp("El ID de cliente de Google termina en «.apps.googleusercontent.com» (Google Cloud › APIs y servicios › Credenciales).");
    const secreto = (texto(fd, "client_secret") ?? "").trim();
    if (secreto && !/^[\w-]{10,80}$/.test(secreto)) throw new ErrorErp("El secreto del cliente no tiene la forma de los de Google.");
    await guardarAppGoogleAds({ clientId, clientSecret: secreto || null });
    const { appGoogleAds } = await import("@/lib/publicidad/google-ads");
    if (!(await appGoogleAds())) throw new ErrorErp("Falta el secreto del cliente.");
    revalidatePath(VOLVER);
    return { ir: `${VOLVER}?ok=${encodeURIComponent("Listo: la app de Google quedó cargada.")}` };
  });
}

export async function accionDesconectarMeta() {
  const s = await entrarErp("publicidad_ver");
  await intentar(VOLVER, async () => {
    await desconectarAnunciosMeta(s.org.id);
    revalidatePath(VOLVER);
    return "Listo: la cuenta de anuncios de Meta quedó desconectada.";
  });
}
