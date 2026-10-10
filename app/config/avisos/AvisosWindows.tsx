"use client";

// Los avisos de Windows de ESTA computadora (lib/avisos-push.ts): pide el
// permiso del navegador, anota el "portero" (public/sw-avisos.js) y le pasa a
// Laucen la dirección donde avisarle. Cada computadora o celular se activa
// por separado.

import { useCallback, useEffect, useState } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";

type Estado = "cargando" | "no_anda" | "bloqueado" | "activo" | "inactivo";

const PORTERO = "/sw-avisos.js";

export default function AvisosWindows() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [equipos, setEquipos] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const mirar = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setEstado("no_anda"); return; }
    fetch("/api/avisos/equipo", { cache: "no-store" }).then((r) => r.json()).then((d: { equipos?: number }) => setEquipos(d.equipos ?? null)).catch(() => {});
    if (Notification.permission === "denied") { setEstado("bloqueado"); return; }
    const reg = await navigator.serviceWorker.getRegistration(PORTERO).catch(() => undefined);
    const sus = await reg?.pushManager.getSubscription().catch(() => null);
    setEstado(sus ? "activo" : "inactivo");
  }, []);

  useEffect(() => { void mirar(); }, [mirar]);

  async function pedir(cuerpo: object): Promise<{ ok: boolean; error?: string; equipos?: number | null }> {
    const r = await fetch("/api/avisos/equipo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
    return r.json().catch(() => ({ ok: false, error: "No se pudo: probá de nuevo en un rato." }));
  }

  async function activar() {
    setTrabajando(true); setMensaje(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") { setEstado(permiso === "denied" ? "bloqueado" : "inactivo"); return; }
      const { publica } = await fetch("/api/avisos/equipo", { cache: "no-store" }).then((r) => r.json()) as { publica: string };
      const reg = await navigator.serviceWorker.register(PORTERO);
      await navigator.serviceWorker.ready;
      const sus = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(publica) });
      const r = await pedir({ accion: "alta", suscripcion: sus.toJSON(), equipo: nombreEquipo() });
      if (!r.ok) throw new Error(r.error);
      setEquipos(r.equipos ?? null);
      setEstado("activo");
      setMensaje({ ok: true, texto: "Listo: esta computadora va a recibir los avisos." });
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error && e.message ? e.message : "No se pudo activar en este navegador." });
    } finally { setTrabajando(false); }
  }

  async function desactivar() {
    setTrabajando(true); setMensaje(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(PORTERO);
      const sus = await reg?.pushManager.getSubscription();
      if (sus) { await pedir({ accion: "baja", endpoint: sus.endpoint }).then((r) => setEquipos(r.equipos ?? null)); await sus.unsubscribe(); }
      setEstado("inactivo");
      setMensaje({ ok: true, texto: "Listo: esta computadora ya no recibe avisos." });
    } catch {
      setMensaje({ ok: false, texto: "No se pudo desactivar: probá de nuevo." });
    } finally { setTrabajando(false); }
  }

  async function probar() {
    setTrabajando(true); setMensaje(null);
    const r = await pedir({ accion: "prueba" }).catch(() => ({ ok: false, error: "No se pudo: probá de nuevo en un rato." }));
    setMensaje(r.ok ? { ok: true, texto: "Mandado: en unos segundos aparece el cartel abajo a la derecha." } : { ok: false, texto: r.error ?? "No se pudo." });
    setTrabajando(false);
  }

  return (
    <div className="grid gap-2 text-sm">
      <p>
        <b>Esta computadora: </b>
        {estado === "cargando" && "…"}
        {estado === "activo" && <span className="text-[#1F6E4A] font-semibold">avisos activados</span>}
        {estado === "inactivo" && <span className="text-[#5C6B76]">sin avisos</span>}
        {estado === "bloqueado" && <span className="text-[#C03420]">el navegador tiene bloqueadas las notificaciones de Laucen</span>}
        {estado === "no_anda" && <span className="text-[#C03420]">este navegador no permite avisos</span>}
        {equipos !== null && <span className="text-[11px] text-[#5C6B76]"> · activados en {equipos} {equipos === 1 ? "equipo" : "equipos"} en total</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {estado === "inactivo" && <button type="button" onClick={activar} disabled={trabajando} className={PRIMARIO}>{trabajando ? "Trabajando…" : "Activar en esta computadora"}</button>}
        {estado === "activo" && <button type="button" onClick={desactivar} disabled={trabajando} className={SUAVE}>Desactivar en esta computadora</button>}
        {(estado === "activo" || (equipos ?? 0) > 0) && <button type="button" onClick={probar} disabled={trabajando} className={SUAVE}>Mandar un aviso de prueba</button>}
      </div>
      {estado === "bloqueado" && (
        <p className="text-[11px] text-[#5C6B76]">
          Para destrabarlo: tocá el candado 🔒 a la izquierda de la dirección (arriba, donde dice laucen.com), en «Notificaciones» elegí «Permitir» y volvé a cargar esta pantalla.
        </p>
      )}
      {mensaje && <p className={`text-xs ${mensaje.ok ? "text-[#1F6E4A]" : "text-[#C03420]"}`}>{mensaje.texto}</p>}
    </div>
  );
}

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
