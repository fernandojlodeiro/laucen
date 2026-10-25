"use client";

// Los avisos de ESTE equipo, computadora o celular (app/componentes/marco/push-cliente.ts): activarlos y elegir si
// recibe todo o sólo lo derivado a una persona (Fer, 25/10: el celular, sólo eso).
// «Mandar un aviso de prueba» espera a que el portero confirme que llegó: así
// se sabe si el problema es de la entrega o de Windows, que no lo muestra.

import { useEffect, useState } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { activarPush, cambiarModoPush, desactivarPush, estadoPush, iphoneSinInstalar, modoPush, pedirAvisos, type EstadoPush } from "@/app/componentes/marco/push-cliente";

type Mensaje = { ok: boolean; texto: string; windows?: boolean };

export default function AvisosWindows() {
  const [estado, setEstado] = useState<EstadoPush | "cargando">("cargando");
  const [equipos, setEquipos] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [solo, setSolo] = useState<boolean | null>(null);
  const [iphone, setIphone] = useState(false);

  useEffect(() => {
    setIphone(iphoneSinInstalar());
    void estadoPush().then(setEstado);
    void modoPush().then(setSolo);
    fetch("/api/avisos/equipo", { cache: "no-store" }).then((r) => r.json()).then((d: { equipos?: number }) => setEquipos(d.equipos ?? null)).catch(() => {});
  }, []);

  async function activar() {
    setTrabajando(true); setMensaje(null);
    try {
      const r = await activarPush();
      setEstado(r.estado);
      if (r.equipos !== undefined) setEquipos(r.equipos ?? null);
      if (r.error) setMensaje({ ok: false, texto: r.error });
      else if (r.estado === "activo") { setMensaje({ ok: true, texto: "Listo: este equipo va a recibir los avisos." }); setSolo(await modoPush()); }
    } catch {
      setMensaje({ ok: false, texto: "No se pudo activar en este navegador." });
    } finally { setTrabajando(false); }
  }

  async function desactivar() {
    setTrabajando(true); setMensaje(null);
    try {
      const r = await desactivarPush();
      if (r.equipos !== undefined) setEquipos(r.equipos ?? null);
      setEstado("inactivo");
      setMensaje({ ok: true, texto: "Listo: este equipo ya no recibe avisos." });
    } catch {
      setMensaje({ ok: false, texto: "No se pudo desactivar: probá de nuevo." });
    } finally { setTrabajando(false); }
  }

  async function cambiarSolo(v: boolean) {
    setTrabajando(true); setMensaje(null);
    const r = await cambiarModoPush(v);
    setTrabajando(false);
    if (!r.ok) return setMensaje({ ok: false, texto: r.error ?? "No se pudo." });
    setSolo(v);
    setMensaje({ ok: true, texto: v ? "Listo: este equipo recibe sólo lo derivado a una persona." : "Listo: este equipo recibe todos los avisos." });
  }

  async function probar() {
    setTrabajando(true);
    setMensaje({ ok: true, texto: "Mandando…" });
    let llego = false;
    const alLlegar = (ev: MessageEvent) => {
      if ((ev.data as { tipo?: string })?.tipo !== "aviso-llego") return;
      llego = true;
      setMensaje({ ok: true, windows: true, texto: "El aviso llegó a este equipo. Si estás en una computadora y no viste el cartel abajo a la derecha, lo está tapando Windows:" });
    };
    navigator.serviceWorker?.addEventListener("message", alLlegar);
    const r = await pedirAvisos({ accion: "prueba" });
    if (!r.ok) {
      navigator.serviceWorker?.removeEventListener("message", alLlegar);
      setMensaje({ ok: false, texto: r.error ?? "No se pudo." });
      setTrabajando(false);
      return;
    }
    setTimeout(() => {
      navigator.serviceWorker?.removeEventListener("message", alLlegar);
      if (!llego) setMensaje({ ok: false, texto: estado === "activo"
        ? "Se mandó, pero no llegó a este equipo en 20 segundos. Probá «Desactivar en este equipo» y volvé a activarlo."
        : "Se mandó a tus otros equipos (este no tiene los avisos activados)." });
      setTrabajando(false);
    }, 20_000);
  }

  return (
    <div className="grid gap-2 text-xs">
      <p>
        <b>Este equipo: </b>
        {estado === "cargando" && "…"}
        {estado === "activo" && <span className="text-[#1F6E4A] font-semibold">avisos activados</span>}
        {estado === "inactivo" && <span className="text-[#5C6B76]">sin avisos</span>}
        {estado === "bloqueado" && <span className="text-[#C03420]">el navegador tiene bloqueadas las notificaciones de Laucen</span>}
        {estado === "no_anda" && <span className="text-[#C03420]">{iphone ? "en iPhone, los avisos sólo andan con Laucen agregado a la pantalla de inicio" : "este navegador no permite avisos"}</span>}
        {equipos !== null && <span className="text-[11px] text-[#5C6B76]"> · activados en {equipos} {equipos === 1 ? "equipo" : "equipos"} en total</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {estado === "inactivo" && <button type="button" onClick={activar} disabled={trabajando} className={PRIMARIO}>{trabajando ? "Trabajando…" : "Activar en este equipo"}</button>}
        {estado === "activo" && <button type="button" onClick={desactivar} disabled={trabajando} className={SUAVE}>Desactivar en este equipo</button>}
        {(estado === "activo" || (equipos ?? 0) > 0) && <button type="button" onClick={probar} disabled={trabajando} className={SUAVE}>{trabajando ? "Trabajando…" : "Mandar un aviso de prueba"}</button>}
      </div>
      {estado === "activo" && solo !== null && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={solo} disabled={trabajando} onChange={(e) => void cambiarSolo(e.target.checked)} className="h-4 w-4 mt-px shrink-0 accent-[#16577F]" />
          <span>
            <span className="font-semibold">En este equipo, sólo lo derivado a una persona</span>
            <span className="block text-[11px] text-[#5C6B76]">Mensajes de Mercado Libre que la IA derivó, WhatsApp que quedaron en espera y reclamos para atender. Los celulares empiezan así.</span>
          </span>
        </label>
      )}
      {estado === "no_anda" && iphone && (
        <ol className="list-decimal pl-5 text-[11px] text-[#5C6B76] grid gap-0.5">
          <li>Abrí laucen.com en Safari y tocá el botón Compartir (el cuadrado con la flecha para arriba, abajo en el medio).</li>
          <li>Elegí «Agregar a pantalla de inicio» y después «Agregar».</li>
          <li>Abrí Laucen desde el ícono nuevo, entrá a esta pantalla (Configuración › Mis avisos) y tocá «Activar en este equipo».</li>
        </ol>
      )}
      {estado === "bloqueado" && (
        <p className="text-[11px] text-[#5C6B76]">
          Para destrabarlo: tocá el candado 🔒 a la izquierda de la dirección (arriba, donde dice laucen.com), en «Notificaciones» elegí «Permitir» y volvé a cargar esta pantalla.
        </p>
      )}
      {mensaje && <p className={mensaje.ok ? "text-[#1F6E4A]" : "text-[#C03420]"}>{mensaje.texto}</p>}
      {mensaje?.windows && (
        <ol className="list-decimal pl-5 text-[11px] text-[#5C6B76] grid gap-0.5">
          <li>Inicio › Configuración › Sistema › Notificaciones: «Notificaciones» prendido y, más abajo en la lista, «Google Chrome» (o «Microsoft Edge») prendido.</li>
          <li>En esa misma pantalla, «No molestar» (o «Asistente de concentración») apagado.</li>
          <li>Los avisos que no se mostraron quedan en el centro de notificaciones: el globito al lado de la hora, abajo a la derecha.</li>
        </ol>
      )}
    </div>
  );
}
