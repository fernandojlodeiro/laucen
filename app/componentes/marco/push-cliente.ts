// Los avisos de Windows del lado del navegador (lib/avisos-push.ts): el
// permiso, el "portero" (public/sw-avisos.js) y avisarle a Laucen dónde
// mandar. Lo usan el cartel de la primera vez (<OfrecerAvisos>, en el marco) y
// Configuración › Mis avisos. Todo de ESTA computadora.

export type EstadoPush = "no_anda" | "bloqueado" | "activo" | "inactivo";

const PORTERO = "/sw-avisos.js";
/** El usuario los desactivó en esta computadora: no se vuelven a activar solos. */
const APAGADO = "laucen-push-apagado";
/** Ya se le ofreció en esta computadora (dijo "Ahora no"). */
const OFRECIDO = "laucen-push-ofrecido";

const guardado = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const guardar = (k: string, v: boolean) => { try { if (v) localStorage.setItem(k, "1"); else localStorage.removeItem(k); } catch { /* sin almacenamiento */ } };

export const anda = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function suscripcion(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  return (await reg?.pushManager.getSubscription().catch(() => null)) ?? null;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!anda()) return "no_anda";
  if (Notification.permission === "denied") return "bloqueado";
  return (await suscripcion()) ? "activo" : "inactivo";
}

export async function pedirAvisos(cuerpo: object): Promise<{ ok: boolean; error?: string; equipos?: number | null }> {
  try {
    const r = await fetch("/api/avisos/equipo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
    return await r.json();
  } catch {
    return { ok: false, error: "No se pudo: probá de nuevo en un rato." };
  }
}

/** Pide el permiso (si hace falta: sólo desde un clic) y deja esta computadora anotada. */
export async function activarPush(): Promise<{ estado: EstadoPush; equipos?: number | null; error?: string }> {
  if (!anda()) return { estado: "no_anda" };
  const permiso = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permiso !== "granted") return { estado: permiso === "denied" ? "bloqueado" : "inactivo" };
  const { publica } = await fetch("/api/avisos/equipo", { cache: "no-store" }).then((r) => r.json()) as { publica: string };
  const reg = await navigator.serviceWorker.register(PORTERO);
  await navigator.serviceWorker.ready;
  const sus = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(publica) });
  const r = await pedirAvisos({ accion: "alta", suscripcion: sus.toJSON(), equipo: nombreEquipo() });
  if (!r.ok) return { estado: "inactivo", error: r.error };
  guardar(APAGADO, false);
  return { estado: "activo", equipos: r.equipos };
}

export async function desactivarPush(): Promise<{ equipos?: number | null }> {
  guardar(APAGADO, true);
  const sus = await suscripcion();
  if (!sus) return {};
  const r = await pedirAvisos({ accion: "baja", endpoint: sus.endpoint });
  await sus.unsubscribe().catch(() => {});
  return { equipos: r.equipos };
}

/** Al entrar a Laucen: si el permiso ya está dado y no los apagó, quedan activados solos; si
 *  nunca se le preguntó en esta computadora, corresponde ofrecérselo. */
export async function alEntrar(): Promise<"ofrecer" | "listo"> {
  if (!anda() || guardado(APAGADO)) return "listo";
  if (Notification.permission === "granted") {
    if (!(await suscripcion())) await activarPush().catch(() => {});
    return "listo";
  }
  return Notification.permission === "default" && !guardado(OFRECIDO) ? "ofrecer" : "listo";
}

export const yaOfrecido = () => guardar(OFRECIDO, true);

/** La llave pública (base64 de URL) como bytes, como la pide el navegador. */
function aBytes(b64: string): Uint8Array<ArrayBuffer> {
  const t = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(t);
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

/** "Chrome en Windows", "Edge en Windows"…: para saber cuál es cuál. */
function nombreEquipo(): string {
  const ua = navigator.userAgent;
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const so = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Mac OS/.test(ua) ? "Mac" : "otro";
  return `${nav} en ${so}`;
}
