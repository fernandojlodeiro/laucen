"use server";
// Ventas › WhatsApp › Configuración: graba la IA de la tienda (nombre, lo que
// sabe, tope, límite por hora, marca del teléfono, espera) y el interruptor
// general; desconectar el número.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero } from "@/lib/erp/acciones";
import { configMensajes, guardarConfigMensajes } from "@/lib/mensajes/config";
import { revisarMarca } from "@/lib/mensajes/reglas";
import { pendienteDe, terminarAlta } from "@/lib/mensajes/alta";
import { redirect } from "next/navigation";

const VOLVER = "/ventas/mensajes/configuracion";

export async function accionGuardarMensajes(fd: FormData) {
  const s = await entrarErp("mensajes_config");
  await intentar(`${VOLVER}?editar=ficha`, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("La IA necesita un nombre.");
    if (nombre.length > 40) throw new ErrorErp("El nombre es muy largo (hasta 40 letras).");
    const tope = numero(fd, "tope");
    if (tope == null || tope < 0) throw new ErrorErp("Poné el tope de gasto por mes en dólares (0 la apaga).");
    const porHora = numero(fd, "por_hora");
    if (porHora == null || porHora < 1 || porHora > 200) throw new ErrorErp("El límite por hora va de 1 a 200 respuestas.");
    const espera = numero(fd, "espera");
    if (espera == null || espera < 0 || espera > 40) throw new ErrorErp("La espera va de 0 a 40 segundos.");
    const marca = revisarMarca(fd.get("marca"));
    if (!marca.ok) throw new ErrorErp(marca.motivo);
    const info = String(fd.get("info") ?? "").slice(0, 20_000);
    await guardarConfigMensajes(s.org.id, { ...(await configMensajes(s.org.id)), nombre, topeUsd: tope, porHora, esperaSeg: espera, marca: marca.marca, info });
    revalidatePath("/ventas/mensajes", "layout");
    return { ir: `${VOLVER}?ok=${encodeURIComponent("Grabado.")}` };
  });
}

/** La IA de todos los chats, con un clic. */
export async function accionIaGeneral(fd: FormData) {
  const s = await entrarErp("mensajes_config");
  await intentar(VOLVER, async () => {
    const prendido = fd.get("valor") === "1";
    await guardarConfigMensajes(s.org.id, { ...(await configMensajes(s.org.id)), iaActiva: prendido });
    revalidatePath("/ventas/mensajes", "layout");
    return prendido ? "La IA vuelve a contestar los mensajes." : "La IA quedó apagada: los mensajes los contestan ustedes.";
  });
}

export async function accionDesconectar() {
  const s = await entrarErp("mensajes_config");
  await intentar(VOLVER, async () => {
    await consulta("update wa_credencial set estado = 'desconectado' where organizacion_id = $1", [s.org.id]);
    return "Listo: Laucen dejó de recibir y contestar los mensajes de ese número. En el teléfono sigue andando.";
  });
}

/** Conecta el número que eligió la persona entre los que vinieron en el permiso de Meta (lib/mensajes/alta.ts). */
export async function accionElegirNumero(fd: FormData) {
  const s = await entrarErp("mensajes_config");
  const alta = Number(fd.get("alta")) || 0;
  const telefono = String(fd.get("telefono") ?? "");
  const p = await pendienteDe(s.org.id, alta);
  if (!p) redirect(`${VOLVER}?wa=estado`);
  const num = p.opciones.find((o) => o.id === telefono);
  if (!num) redirect(`${VOLVER}?wa=elegir&alta=${alta}`);
  const r = await terminarAlta(s.org.id, p.token, p.expira_el, num, p.coexistencia);
  if (r === "conectado") await consulta("delete from wa_alta_pendiente where id = $1", [alta]);
  revalidatePath("/ventas/mensajes", "layout");
  redirect(`${VOLVER}?wa=${r}${r === "conectado" ? "" : `&alta=${alta}`}`);
}

// ── Instagram (Fer, 25/10; lib/mensajes/instagram.ts) ────────────────

/** La app de Meta de Instagram de Laucen (id y clave secreta): sólo el dueño del sistema. La clave no se vuelve a
 *  mostrar; vacía, queda la que estaba. */
export async function accionGuardarAppInstagram(fd: FormData) {
  await entrarErp("mensajes_config");
  const { sosVos } = await import("@/lib/admin");
  await intentar(`${VOLVER}?editar=ig`, async () => {
    if (!(await sosVos())) throw new ErrorErp("Esto lo carga sólo el dueño del sistema.");
    const appId = (texto(fd, "app_id") ?? "").replace(/\s/g, "");
    if (!/^\d{6,25}$/.test(appId)) throw new ErrorErp("El identificador de la app de Instagram son sólo números (lo da Meta en la app, «Instagram» › «Configuración de la API»).");
    const secreto = (texto(fd, "app_secret") ?? "").trim();
    if (secreto && !/^[0-9a-f]{20,64}$/i.test(secreto)) throw new ErrorErp("La clave secreta de la app no tiene la forma de las de Meta (letras de la a a la f y números).");
    const { guardarAppInstagram, appInstagram } = await import("@/lib/mensajes/instagram");
    await guardarAppInstagram(appId, secreto || null);
    if (!(await appInstagram())?.appSecret) throw new ErrorErp("Falta la clave secreta de la app de Instagram.");
    // La misma app, para «Conectar anuncios de Meta» (embudo de publicidad): su identificador y clave propios y la
    // configuración del inicio de sesión de Facebook para empresas. Opcionales: se pueden cargar después.
    const fbId = (texto(fd, "fb_app_id") ?? "").replace(/\s/g, "");
    const fbSecreto = (texto(fd, "fb_app_secret") ?? "").trim();
    const configId = (texto(fd, "ads_config_id") ?? "").replace(/\s/g, "");
    if (fbId && !/^\d{6,25}$/.test(fbId)) throw new ErrorErp("El identificador de la app son sólo números (Configuración › Básica de la app en Meta).");
    if (fbSecreto && !/^[0-9a-f]{20,64}$/i.test(fbSecreto)) throw new ErrorErp("La clave secreta de la app no tiene la forma de las de Meta.");
    if (configId && !/^\d{6,25}$/.test(configId)) throw new ErrorErp("El identificador de la configuración son sólo números (Inicio de sesión con Facebook para empresas › Configuraciones).");
    if (fbId || configId) {
      const { guardarAppMetaAnuncios } = await import("@/lib/publicidad/meta-ads");
      await guardarAppMetaAnuncios({ appId: fbId, appSecret: fbSecreto || null, configId });
    }
    revalidatePath(VOLVER);
    return { ir: `${VOLVER}?ok=${encodeURIComponent("Listo: la app de Instagram quedó cargada.")}` };
  });
}

export async function accionDesconectarInstagram() {
  const s = await entrarErp("mensajes_config");
  await intentar(VOLVER, async () => {
    const { desconectar } = await import("@/lib/mensajes/instagram");
    await desconectar(s.org.id);
    revalidatePath(VOLVER);
    return "Listo: Instagram desconectado. Laucen ya no recibe ni contesta sus mensajes.";
  });
}
