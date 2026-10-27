"use client";
// La bandeja de Mensajes, tipo WhatsApp Web (como la Bandeja de CadaMes; Fer, 25/10): todas las conversaciones de los
// clientes —WhatsApp, Instagram, mensajes y preguntas de Mercado Libre, reclamos— en una lista, la más nueva primero,
// con dos pestañas —Para atender (lo que espera a una persona) y Todos— y botoncitos por canal; a la
// derecha, la conversación abierta. Pregunta al servidor cada 5 segundos con una conversación abierta (10 sin abrir)
// y sólo baja todo si algo cambió.
//
// En el celular, como la app de WhatsApp: la lista, y al tocar una conversación ésta tapa la pantalla (entre la franja
// de arriba y la barra de abajo) con la flecha para volver. Es la misma pantalla, que se acomoda al ancho.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FILTROS, ORIGENES, NOMBRE_ORIGEN,
  type ChatAbierto, type FiltroBandeja, type FiltroOrigen, type FotoBandeja, type MensajeVista,
} from "@/lib/mensajes/bandeja-tipos";
import { accionEnviarBandeja, accionIaBandeja, accionNotas, accionPedirleIa, accionProponerBandeja, accionResolverCaso, accionTerminar } from "./acciones";
import Llave from "./Llave";
import CajaConPublicaciones from "@/app/componentes/CajaConPublicaciones";
import CorregirIa from "@/app/componentes/CorregirIa";
import { LogoOrigen } from "@/app/componentes/LogosCanal";

const CADA = 5000, CADA_SIN_ABRIR = 10000;
const SUAVE = "text-xs font-bold rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F] disabled:opacity-50";
const PRIMARIO = "text-xs font-bold rounded-lg px-3 py-2 bg-[#167655] text-white disabled:opacity-50";

const hora = (ts: string) => {
  const d = new Date(ts), hoy = new Date();
  const mismo = d.toDateString() === hoy.toDateString();
  return new Intl.DateTimeFormat("es-AR", mismo ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }).format(d);
};
const horaLarga = (ts: string) => new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

export default function Bandeja({ inicial, filtroInicial, origenInicial, abiertoInicial }: {
  inicial: FotoBandeja; filtroInicial: FiltroBandeja; origenInicial: FiltroOrigen; abiertoInicial: string | null;
}) {
  const [foto, setFoto] = useState(inicial);
  const [filtro, setFiltro] = useState<FiltroBandeja>(filtroInicial);
  const [origen, setOrigen] = useState<FiltroOrigen>(origenInicial);
  const [abierto, setAbierto] = useState<string | null>(inicial.abierto?.clave ?? abiertoInicial);
  const [busca, setBusca] = useState("");
  const [cortado, setCortado] = useState(false);
  const fallos = useRef(0);
  const ahora = useRef({ filtro, origen, abierto, sello: foto.sello, busca });
  useEffect(() => { ahora.current = { filtro, origen, abierto, sello: foto.sello, busca }; });

  const traer = useCallback(async (deCero = false) => {
    const a = ahora.current;
    const url = new URL("/api/mensajes", window.location.origin);
    url.searchParams.set("filtro", a.filtro);
    url.searchParams.set("origen", a.origen);
    if (a.abierto) url.searchParams.set("con", a.abierto);
    if (a.busca) url.searchParams.set("q", a.busca);
    if (!deCero) url.searchParams.set("sello", a.sello);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      fallos.current = 0; setCortado(false);
      if (!d.igual) setFoto(d as FotoBandeja);
    } catch {
      fallos.current += 1;
      if (fallos.current >= 2) setCortado(true);
    }
  }, []);

  useEffect(() => {
    const preguntar = () => { if (document.visibilityState === "visible") void traer(); };
    const reloj = setInterval(preguntar, abierto ? CADA : CADA_SIN_ABRIR);
    document.addEventListener("visibilitychange", preguntar);
    return () => { clearInterval(reloj); document.removeEventListener("visibilitychange", preguntar); };
  }, [abierto, traer]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierto) url.searchParams.set("con", abierto); else url.searchParams.delete("con");
    if (filtro === "atender") url.searchParams.delete("filtro"); else url.searchParams.set("filtro", filtro);
    if (origen === "todos") url.searchParams.delete("origen"); else url.searchParams.set("origen", origen);
    window.history.replaceState(null, "", url);
  }, [abierto, filtro, origen]);

  useEffect(() => { const t = setTimeout(() => void traer(true), 300); return () => clearTimeout(t); }, [busca, filtro, origen, abierto, traer]);

  const origenes = ORIGENES.filter((o) => o.clave === "todos" || o.clave === origen || foto.porOrigen[o.clave] > 0);

  return (
    <div className="md:h-[calc(100dvh-13rem)] md:min-h-[480px] md:flex md:gap-3">
      {/* ── La lista ── */}
      <section aria-label="Conversaciones" className={`${abierto ? "hidden md:flex" : "flex"} flex-col min-h-0 md:w-[24rem] md:shrink-0 bg-white border border-[#E3E9F0] rounded-xl overflow-hidden`}>
        <header className="px-3 pt-3 pb-2 border-b border-[#F0F3F8]">
          <p className="text-xs text-[#5C6B76]">
            {!foto.conectado && <span className="text-[#8a6100]">WhatsApp sin conectar. </span>}
            {foto.cuantos.atender > 0 ? <b className="text-[#8a6100]">{foto.cuantos.atender} para atender. </b> : "Nada para atender. "}
            {foto.iaActiva ? `${foto.nombreIa} está atendiendo.` : `${foto.nombreIa} está apagada.`}
          </p>
          <label className="relative block mt-2">
            <span className="sr-only">Buscar una conversación</span>
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre, teléfono, producto…"
              className="w-full border border-[#E3E9F0] rounded-lg pl-3 pr-8 py-2 text-sm md:text-xs" />
            {busca && <button type="button" aria-label="Borrar" onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5C6B76] text-sm">×</button>}
          </label>
          <div className="flex items-end gap-0.5 mt-2 shadow-[inset_0_-1px_0_#D5DDE5] overflow-x-auto" role="tablist">
            {FILTROS.map((f) => (
              <button key={f.clave} type="button" role="tab" aria-selected={filtro === f.clave} onClick={() => { if (f.clave !== filtro) { setFiltro(f.clave); setAbierto(null); } }} title={f.ayuda}
                className={`shrink-0 rounded-t-lg border px-2 py-1.5 text-xs md:text-[11px] font-semibold ${filtro === f.clave
                  ? "bg-white border-[#D5DDE5] border-b-white shadow-[inset_0_2px_0_#16577F] text-[#16577F]"
                  : "bg-gradient-to-b from-[#FBFCFD] to-[#E4E9EE] border-[#D5DDE5] text-[#5C6B76]"}`}>
                {f.texto} ({foto.cuantos[f.clave]})
              </button>
            ))}
          </div>
          {origenes.length > 2 && (
            <div role="group" className="flex flex-wrap gap-1 mt-2" aria-label="Por canal">
              {origenes.map((o) => (
                <button key={o.clave} type="button" onClick={() => setOrigen(o.clave)} aria-pressed={origen === o.clave} title={o.nombre}
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${origen === o.clave ? "bg-[#16577F] border-[#16577F] text-white" : "bg-white border-[#D5DDE5] text-[#5C6B76]"}`}>
                  <LogoOrigen origen={o.clave} />
                  {o.texto ? <span>{o.texto}</span> : <span className="sr-only">{o.nombre}</span>}
                  <span>{foto.porOrigen[o.clave]}</span>
                </button>
              ))}
            </div>
          )}
        </header>
        {cortado && <p className="text-xs bg-[#FDF0E6] text-[#8a6100] px-3 py-2">Se cortó la conexión: puede haber mensajes nuevos que no estás viendo.</p>}
        <div className="flex-1 overflow-y-auto">
          {foto.filas.length === 0 && (
            <p className="text-xs text-[#5C6B76] p-4">
              {filtro === "atender" ? "No hay nada esperando a una persona. 🎉" : "Cuando un cliente escriba, la conversación aparece acá."}
            </p>
          )}
          {foto.filas.map((f) => (
            <button key={f.clave} type="button" onClick={() => setAbierto(f.clave)}
              className={`w-full text-left px-3 py-2.5 md:py-2 border-b border-[#F0F3F8] flex gap-2 items-start ${f.clave === abierto ? "bg-[#EAF4EF]" : "hover:bg-[#F7F9FB]"}`}>
              <span className="mt-0.5 h-10 w-10 md:h-8 md:w-8 shrink-0 rounded-full bg-[#DCEFE6] text-[#167655] grid place-items-center text-sm md:text-xs font-bold relative" title={NOMBRE_ORIGEN[f.origen]}>
                {(f.nombre.replace(/^Pregunta: /, "").trim()[0] ?? "?").toUpperCase()}
                <span className="absolute -bottom-1 -right-1 text-[11px] leading-none"><LogoOrigen origen={f.origen} clase="h-3.5 w-3.5" /></span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`truncate text-sm md:text-xs ${f.sinResponder ? "font-bold" : "font-semibold"}`}>{f.nombre}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-[#5C6B76]">{hora(f.ultimoTs)}</span>
                </span>
                {f.detalle && <span className="block truncate text-[10px] text-[#8A97A3]">{f.detalle}</span>}
                <span className="flex items-center gap-1">
                  <span className={`truncate text-xs md:text-[11px] ${f.sinResponder ? "text-[#12212B]" : "text-[#5C6B76]"}`}>
                    {f.ultimoClase === "ia" ? "🤖 " : f.ultimoClase === "operador" || f.ultimoClase === "desde_el_telefono" ? "✓ " : f.ultimoClase === "ml" ? "ML: " : ""}{f.ultimo}
                  </span>
                  <span className="ml-auto flex shrink-0 gap-1">
                    {f.enEspera && <span className="rounded-full bg-[#FFC94D] text-[#3A2A00] text-[10px] font-bold px-1.5">👤 En espera</span>}
                    {!f.enEspera && f.atiendePersona && f.origen !== "reclamo" && <span className="rounded-full bg-[#EEF3F8] text-[#16577F] text-[10px] font-bold px-1.5">{f.origen === "ml" ? "IA" : foto.nombreIa} apagada</span>}
                    {f.sinResponder && <span className="h-2.5 w-2.5 rounded-full bg-[#25D366] self-center" aria-label="Sin responder" />}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── La conversación: en el celular tapa la pantalla, entre la franja de arriba y la barra de abajo ── */}
      <section aria-label="La conversación"
        className={`${abierto ? "flex fixed inset-x-0 top-12 bottom-16 z-40 md:static md:z-auto" : "hidden md:flex"} flex-col min-h-0 flex-1 bg-white md:border border-[#E3E9F0] md:rounded-xl overflow-hidden`}>
        {foto.abierto && foto.abierto.clave === abierto ? (
          <Conversacion key={foto.abierto.clave} chat={foto.abierto} nombreIa={foto.nombreIa} iaActiva={foto.iaActiva}
            alVolver={() => setAbierto(null)} alCambiar={() => traer(true)} />
        ) : (
          <div className="grid place-items-center h-full text-center px-8">
            <div>
              <div className="text-4xl">💬</div>
              <p className="text-sm font-semibold mt-3">{abierto ? "Cargando…" : "Elegí una conversación"}</p>
              {abierto && <button type="button" onClick={() => setAbierto(null)} className={`${SUAVE} mt-3 md:hidden`}>← Volver a la lista</button>}
              {!abierto && <p className="text-xs text-[#5C6B76] mt-1 max-w-xs">A la izquierda están todas: WhatsApp, Mercado Libre, preguntas y reclamos, la más nueva primero.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Conversacion({ chat, nombreIa, iaActiva, alVolver, alCambiar }: {
  chat: ChatAbierto; nombreIa: string; iaActiva: boolean; alVolver: () => void; alCambiar: () => void;
}) {
  const [texto, setTexto] = useState(chat.escribir.sugerencia ?? "");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<"" | "enviar" | "proponer" | "pedirle" | "sugerir">("");
  const [notas, setNotas] = useState(chat.notas ?? "");
  const [verNotas, setVerNotas] = useState(false);
  const [verMas, setVerMas] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const cuantos = chat.mensajes.length;
  // Una propuesta nueva de la IA (llegó con el refresco) entra a la caja si no estabas escribiendo otra cosa.
  const ultimaSugerencia = useRef(chat.escribir.sugerencia);
  useEffect(() => {
    const s = chat.escribir.sugerencia;
    if (s && s !== ultimaSugerencia.current) setTexto((t) => (t.trim() === "" || t === ultimaSugerencia.current ? s : t));
    ultimaSugerencia.current = s;
  }, [chat.escribir.sugerencia]);

  useEffect(() => { fondo.current?.scrollTo({ top: fondo.current.scrollHeight }); }, [cuantos]);
  useLayoutEffect(() => {
    const t = caja.current; if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight + 2, 160)}px`;
    t.style.overflowY = t.scrollHeight + 2 > 160 ? "auto" : "hidden";
  }, [texto]);

  async function enviar() {
    if (!texto.trim() || trabajando) return;
    setTrabajando("enviar"); setError(null); setAviso(null);
    const r = await accionEnviarBandeja(chat.clave, texto);
    setTrabajando("");
    if (r.ok) { setTexto(""); ultimaSugerencia.current = null; if ("aviso" in r && r.aviso) setAviso(r.aviso); alCambiar(); } else setError(r.error);
  }
  async function proponer() {
    setTrabajando("proponer"); setError(null); setAviso(null);
    const r = await accionProponerBandeja(chat.clave);
    setTrabajando("");
    if (r.ok && r.texto) { setTexto(r.texto); ultimaSugerencia.current = r.texto; } else if (!r.ok) setError(r.error);
    alCambiar();
  }
  // «Pedirle a Estela» (Fer, 26/10): su propia caja, aparte de la del cliente, para que nunca le llegue al cliente.
  const [verIa, setVerIa] = useState(false);
  const [indicacion, setIndicacion] = useState("");
  async function pedirle(modo: "mandar" | "sugerir") {
    if (trabajando) return;
    if (!indicacion.trim()) { setAviso(null); setError(`Escribí qué querés que haga ${nombreIa}.`); return; }
    setTrabajando(modo === "mandar" ? "pedirle" : "sugerir"); setError(null); setAviso(null);
    const r = await accionPedirleIa(chat.clave, indicacion, modo);
    setTrabajando("");
    if (!r.ok) { setError(r.error); return; }
    setIndicacion(""); setVerIa(false);
    if (modo === "mandar") { setAviso(`${nombreIa} ya le escribió.`); alCambiar(); }
    else { setTexto(r.texto ?? ""); ultimaSugerencia.current = r.texto ?? null; setAviso(`${nombreIa} lo dejó escrito en la caja: revisalo y apretá «Enviar».`); setTimeout(() => caja.current?.focus(), 30); }
  }
  // «Terminado» (Fer, 27/10): no hay nada más que decirle; sale de «Para atender» hasta que vuelva a escribir.
  const [terminado, setTerminado] = useState(false);
  async function terminar() {
    if (trabajando) return;
    setError(null);
    const r = await accionTerminar(chat.clave);
    if (!r.ok) { setError(r.error); return; }
    setTerminado(true);
    setTimeout(() => setTerminado(false), 4000);
    alCambiar();
  }
  async function ia(prender: boolean) {
    setError(null);
    const r = await accionIaBandeja(chat.clave, prender);
    if (!r.ok) setError(r.error);
    alCambiar();
  }

  const largo = texto.trim().length;
  const pasado = chat.escribir.tope != null && largo > chat.escribir.tope;
  return (
    <>
      <header className="flex items-center gap-2 px-2 md:px-3 py-2 border-b border-[#E3E9F0] bg-[#F7F9FB]">
        <button type="button" onClick={alVolver} className="md:hidden text-xl px-2 py-1 text-[#16577F]" aria-label="Volver a la lista">←</button>
        <button type="button" onClick={() => setVerMas(!verMas)} className="min-w-0 flex-1 text-left" aria-expanded={verMas} title="Ver los datos y los enlaces">
          <div className="text-sm font-bold truncate">{chat.nombre}</div>
          <div className="text-[11px] text-[#5C6B76] truncate flex items-center gap-1"><LogoOrigen origen={chat.origen} clase="h-3 w-3 shrink-0" /><span className="truncate">{chat.detalle}</span></div>
        </button>
        {terminado ? <span className="text-xs font-bold text-[#167655] px-1" role="status">✓ Terminado</span>
          : chat.terminar && <button type="button" onClick={terminar} disabled={!!trabajando} className={SUAVE} title={`No hay nada más que decirle: sale de «Para atender»${chat.ia ? ` y ${chat.origen === "ml" ? "la IA" : nombreIa} vuelve a atender` : ""}. Si vuelve a escribir, aparece de nuevo.`}>✓ Terminado</button>}
        {chat.notas != null && <button type="button" onClick={() => setVerNotas(!verNotas)} className={SUAVE} title="Notas internas">📝<span className="hidden md:inline"> Notas</span></button>}
        {chat.ia && (
          <button type="button" role="switch" aria-checked={chat.ia.prendida} onClick={() => ia(!chat.ia!.prendida)}
            className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0]"
            title={chat.ia.prendida ? `Contesta la IA. Apagala para atenderlo vos.` : `Lo atiende una persona. Prendela para que conteste la IA.`}>
            <Llave prendido={chat.ia.prendida} />
            <span className="font-semibold">{chat.origen === "ml" ? "IA" : nombreIa}</span>
          </button>
        )}
      </header>
      {(verMas || chat.enlaces.length > 0) && (
        <div className={`${verMas ? "flex" : "hidden md:flex"} flex-wrap gap-x-3 gap-y-1 px-3 py-1.5 border-b border-[#E3E9F0] text-[11px]`}>
          {chat.enlaces.map((e) => e.afuera
            ? <a key={e.href} href={e.href} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">{e.texto} ↗</a>
            : <Link key={e.href} href={e.href} className="text-[#16577F] hover:underline">{e.texto}</Link>)}
          {chat.enlaces.length === 0 && <span className="text-[#5C6B76]">Sin datos para enlazar.</span>}
        </div>
      )}
      {chat.ia && !iaActiva && chat.origen !== "ml" && <p className="text-[11px] bg-[#FDF0E6] text-[#8a6100] px-3 py-1.5">{nombreIa} está apagada para todos los chats (Configuración).</p>}
      {verNotas && chat.notas != null && (
        <div className="px-3 py-2 border-b border-[#E3E9F0] bg-[#FFFDF5]">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="Notas internas de esta conversación (el cliente no las ve)…"
            className="w-full border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs" />
          <button type="button" className={`${SUAVE} mt-1`} onClick={async () => { await accionNotas(Number(chat.clave.slice(2)), notas); setVerNotas(false); alCambiar(); }}>Grabar</button>
        </div>
      )}
      {chat.casos.map((k) => <Caso key={`${k.id}-${k.asunto}`} clave={chat.clave} caso={k} alCambiar={alCambiar} />)}
      {chat.comprador && (chat.comprador.cliente || chat.comprador.anteriores.length > 0) && <Comprador key={chat.clave} c={chat.comprador} />}

      <div ref={fondo} className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 bg-[#EFEAE2]">
        {chat.mensajes.map((m) => <Globo key={m.id} m={m} nombreIa={nombreIa} />)}
      </div>

      <footer className="border-t border-[#E3E9F0] p-2 bg-[#F7F9FB]">
        {chat.aviso && <p className="text-[11px] text-[#8a6100] mb-1">{chat.aviso}</p>}
        {error && <p className="text-xs text-[#C03420] mb-1">{error}</p>}
        {aviso && <p className="text-xs text-[#167655] mb-1">{aviso}</p>}
        {verIa && (
          <div className="mb-2 rounded-lg border border-[#C9B8E8] bg-[#F5F0FC] p-2">
            <label className="block">
              <span className="block text-[11px] font-semibold text-[#5B3E96] mb-1">Indicación para {nombreIa} — no le llega al cliente</span>
              <textarea value={indicacion} onChange={(e) => setIndicacion(e.target.value)} rows={2} autoFocus
                placeholder={`Ej.: armale el presupuesto formal de lo que pidió que tenemos`}
                className="w-full resize-y border border-[#C9B8E8] rounded-lg px-2 py-1.5 text-sm md:text-xs bg-white" />
            </label>
            <div className="flex flex-wrap gap-2 mt-1">
              <button type="button" onClick={() => pedirle("sugerir")} disabled={!!trabajando} className={SUAVE}>{trabajando === "sugerir" ? `${nombreIa} está escribiendo…` : "Que me lo sugiera"}</button>
              <button type="button" onClick={() => pedirle("mandar")} disabled={!!trabajando} className={PRIMARIO}>{trabajando === "pedirle" ? `${nombreIa} está escribiendo…` : `Que lo mande ${nombreIa}`}</button>
              <button type="button" onClick={() => { setVerIa(false); setIndicacion(""); }} disabled={!!trabajando} className={SUAVE}>Cancelar</button>
            </div>
          </div>
        )}
        {!chat.escribir.puede ? (
          <p className="text-xs text-[#5C6B76] px-1 py-2">{chat.escribir.porQueNo}</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <CajaConPublicaciones cajaRef={caja} value={texto} onChange={setTexto} rows={1} canalId={chat.escribir.canalId ?? undefined} plan={chat.escribir.plan ?? null} web={chat.escribir.web}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) { e.preventDefault(); void enviar(); } }}
                placeholder={chat.ia?.prendida ? `Escribí un mensaje (la IA sigue atendiendo; apagala si lo tomás vos). Con # buscás ${chat.escribir.web ? "un producto de la tienda" : "una publicación"}…` : `Escribí un mensaje. Con # buscás ${chat.escribir.web ? "un producto de la tienda" : "una publicación"}…`}
                className="w-full resize-none border border-[#E3E9F0] rounded-lg px-2 py-2 text-sm md:text-xs bg-white overflow-hidden" />
              <button type="button" onClick={enviar} disabled={!!trabajando || !texto.trim() || pasado} className={PRIMARIO}>{trabajando === "enviar" ? "Mandando…" : "Enviar"}</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {chat.escribir.proponer && (
                <button type="button" onClick={proponer} disabled={!!trabajando} className={SUAVE}>{trabajando === "proponer" ? "Proponiendo…" : "Proponer con IA"}</button>
              )}
              {chat.ia && chat.origen !== "ml" && !verIa && (
                <button type="button" onClick={() => { setVerIa(true); setError(null); }} disabled={!!trabajando} className={SUAVE}>🤖 Pedirle a {nombreIa}</button>
              )}
              {chat.escribir.tope != null && <span className={`text-[10px] ${pasado ? "text-[#C03420] font-bold" : "text-[#5C6B76]"}`}>{largo}/{chat.escribir.tope}</span>}
              {chat.escribir.ayuda && <span className="text-[10px] text-[#5C6B76]">{chat.escribir.ayuda}</span>}
            </div>
          </>
        )}
      </footer>
    </>
  );
}

function Globo({ m, nombreIa }: { m: MensajeVista; nombreIa: string }) {
  const nuestro = m.clase !== "entrante";
  const quien = m.clase === "ia" ? `🤖 ${nombreIa}` : m.clase === "operador" ? (m.quien ?? "Panel") : m.clase === "desde_el_telefono" ? (m.quien ?? "📱 Desde el teléfono") : m.clase === "ml" ? "Mercado Libre" : null;
  const estado = m.estado === "leido" ? <span className="text-[#34B7F1]">✓✓</span> : m.estado === "entregado" ? "✓✓" : m.estado === "enviado" ? "✓" : null;
  return (
    <div className={`flex ${m.clase === "ml" ? "justify-center" : nuestro ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] md:max-w-[80%] rounded-lg px-2.5 py-1.5 text-sm md:text-xs shadow-sm ${m.clase === "ml" ? "bg-[#FFF6D6]" : nuestro ? "bg-[#D9FDD3]" : "bg-white"}`}>
        {quien && <div className="text-[10px] font-bold text-[#167655] mb-0.5">{quien}</div>}
        {/* Un archivo que se le mandó (el PDF de un presupuesto o una factura): se ve como archivo, no como un link suelto. */}
        {(() => {
          const doc = /^📄 (.+?): (https?:\/\/\S+)$/.exec(m.texto ?? "");
          if (!doc) return <div className="whitespace-pre-wrap break-words">{m.texto}</div>;
          return (
            <div className="flex items-center gap-2 rounded-md border border-[#C8E6C0] bg-white/70 px-2 py-1.5">
              <span className="text-xl leading-none">📄</span>
              <span className="min-w-0 flex-1"><b className="block truncate">{doc[1]}</b><span className="text-[10px] text-[#5C6B76]">Archivo PDF{nuestro ? " que le llegó al cliente" : ""}</span></span>
              <a href={doc[2]} target="_blank" rel="noopener" className={SUAVE}>Ver el PDF ↗</a>
            </div>
          );
        })()}
        <div className="mt-0.5 flex justify-end gap-1 text-[10px] text-[#5C6B76]">
          <span>{horaLarga(m.ts)}</span>{nuestro && estado}
        </div>
        {m.estado === "fallido" && <div className="text-[10px] text-[#C03420] font-semibold">NO ENTREGADO{m.motivo ? `: ${m.motivo}` : ""}</div>}
        {m.corregir && m.texto && <div className="mt-1 text-right"><CorregirIa origen={m.corregir.origen} id={m.corregir.id} /></div>}
      </div>
    </div>
  );
}

function Caso({ clave, caso, alCambiar }: { clave: string; caso: ChatAbierto["casos"][number]; alCambiar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [como, setComo] = useState("");
  return (
    <div className="px-3 py-2 border-b border-[#F2D9B8] bg-[#FDF6EC] text-xs">
      <div className="flex items-start gap-2">
        <span>👤</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold">En espera: {caso.asunto}</div>
          {caso.motivo && <div className="text-[11px] text-[#5C6B76]">{caso.motivo}</div>}
          {caso.abiertoTs && <div className="text-[10px] text-[#5C6B76]">Desde {horaLarga(caso.abiertoTs)}{caso.asignado ? ` · lo tiene ${caso.asignado}` : ""}</div>}
        </div>
        {caso.resolver && !abierto && <button type="button" className={SUAVE} onClick={() => setAbierto(true)}>Resolver</button>}
      </div>
      {abierto && (
        <div className="mt-2 flex gap-2">
          <input value={como} onChange={(e) => setComo(e.target.value)} placeholder="Cómo se resolvió (opcional)" className="flex-1 border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white" />
          <button type="button" className={PRIMARIO} onClick={async () => { await accionResolverCaso(Number(clave.slice(2)), caso.id, como); alCambiar(); }}>Listo</button>
          <button type="button" className={SUAVE} onClick={() => setAbierto(false)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

/** En una pregunta: si el comprador ya nos compró y sus preguntas anteriores, con lo que se le contestó (Fer, 26/10). */
function Comprador({ c }: { c: NonNullable<ChatAbierto["comprador"]> }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="px-3 py-1.5 border-b border-[#E3E9F0] text-[11px] space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {c.cliente && <Link href={c.cliente.href} className="rounded-full bg-[#E8F5EE] text-[#167655] font-semibold px-2 py-0.5 hover:underline">{c.cliente.texto}</Link>}
        {c.anteriores.length > 0 && (
          <button type="button" onClick={() => setVer(!ver)} aria-expanded={ver} className={SUAVE}>
            {ver ? "Ocultar" : "Ver"} sus preguntas anteriores ({c.anteriores.length})
          </button>
        )}
      </div>
      {ver && (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto">
          {c.anteriores.map((a) => (
            <li key={a.id} className="rounded-lg bg-[#F7F9FB] border border-[#E3E9F0] px-2 py-1.5">
              <div className="text-[10px] text-[#5C6B76]">{horaLarga(a.fecha)}{a.canal ? ` · ${a.canal}` : ""}{a.titulo ? ` · ${a.titulo}` : ""}</div>
              <div><span className="text-[#5C6B76]">Preguntó: </span>{a.texto}</div>
              <div><span className="text-[#5C6B76]">Respuesta: </span>{a.respuesta ?? "sin responder"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
