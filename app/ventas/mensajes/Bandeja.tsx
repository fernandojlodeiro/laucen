"use client";
// La carpeta de mensajes, tipo WhatsApp Web (copiada de la Bandeja de
// CadaMes): a la izquierda los chats, del más nuevo al más viejo, con
// pestañas (Todos · Sin responder · En espera · Con persona) y buscador; a la
// derecha el chat abierto. Pregunta al servidor cada 5 segundos con un chat
// abierto (10 sin abrir) y sólo baja todo si algo cambió.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { FILTROS, type ChatAbierto, type FiltroBandeja, type FotoBandeja, type MensajeVista } from "@/lib/mensajes/bandeja-tipos";
import { accionEnviar, accionIa, accionNotas, accionResolverCaso } from "./acciones";
import Llave from "./Llave";

const CADA = 5000, CADA_SIN_ABRIR = 10000;
const SUAVE = "text-xs font-bold rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]";
const PRIMARIO = "text-xs font-bold rounded-lg px-3 py-2 bg-[#167655] text-white disabled:opacity-50";

const hora = (ts: string) => {
  const d = new Date(ts), hoy = new Date();
  const mismo = d.toDateString() === hoy.toDateString();
  return new Intl.DateTimeFormat("es-AR", mismo ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }).format(d);
};
const horaLarga = (ts: string) => new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

export default function Bandeja({ inicial, filtroInicial, abiertoInicial }: { inicial: FotoBandeja; filtroInicial: FiltroBandeja; abiertoInicial: number | null }) {
  const [foto, setFoto] = useState(inicial);
  const [filtro, setFiltro] = useState<FiltroBandeja>(filtroInicial);
  const [abierto, setAbierto] = useState<number | null>(inicial.abierto?.id ?? abiertoInicial);
  const [busca, setBusca] = useState("");
  const [cortado, setCortado] = useState(false);
  const fallos = useRef(0);
  const ahora = useRef({ filtro, abierto, sello: foto.sello, busca });
  useEffect(() => { ahora.current = { filtro, abierto, sello: foto.sello, busca }; });

  const traer = useCallback(async (deCero = false) => {
    const a = ahora.current;
    const url = new URL("/api/mensajes", window.location.origin);
    url.searchParams.set("filtro", a.filtro);
    if (a.abierto) url.searchParams.set("con", String(a.abierto));
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
    if (abierto) url.searchParams.set("con", String(abierto)); else url.searchParams.delete("con");
    if (filtro === "todos") url.searchParams.delete("filtro"); else url.searchParams.set("filtro", filtro);
    window.history.replaceState(null, "", url);
  }, [abierto, filtro]);

  useEffect(() => { const t = setTimeout(() => void traer(true), 300); return () => clearTimeout(t); }, [busca, filtro, abierto, traer]);

  const sinResponder = foto.cuantos.sin_responder;

  return (
    <div className="md:h-[calc(100dvh-13rem)] md:min-h-[480px] md:flex md:gap-3">
      {/* ── La lista ── */}
      <section aria-label="Chats" className={`${abierto ? "hidden md:flex" : "flex"} flex-col min-h-0 md:w-[22rem] md:shrink-0 bg-white border border-[#E3E9F0] rounded-xl overflow-hidden`}>
        <header className="px-3 pt-3 pb-2 border-b border-[#F0F3F8]">
          <p className="text-xs text-[#5C6B76]">
            {!foto.conectado && <span className="text-[#8a6100]">WhatsApp sin conectar. </span>}
            {foto.filas.length === 0 && filtro === "todos" ? "Todavía sin chats." : sinResponder > 0 ? `${sinResponder} sin responder.` : "Todo respondido."}
            {" "}{foto.iaActiva ? `${foto.nombreIa} está atendiendo.` : `${foto.nombreIa} está apagada.`}
          </p>
          <label className="relative block mt-2">
            <span className="sr-only">Buscar un chat</span>
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o teléfono…"
              className="w-full border border-[#E3E9F0] rounded-lg pl-3 pr-8 py-1.5 text-xs" />
            {busca && <button type="button" aria-label="Borrar" onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5C6B76] text-sm">×</button>}
          </label>
          <div className="flex items-end gap-0.5 mt-2 shadow-[inset_0_-1px_0_#D5DDE5] overflow-x-auto" role="tablist">
            {FILTROS.map((f) => (
              <button key={f.clave} type="button" role="tab" aria-selected={filtro === f.clave} onClick={() => setFiltro(f.clave)}
                className={`shrink-0 rounded-t-lg border px-2 py-1 text-[11px] font-semibold ${filtro === f.clave
                  ? "bg-white border-[#D5DDE5] border-b-white shadow-[inset_0_2px_0_#16577F] text-[#16577F]"
                  : "bg-gradient-to-b from-[#FBFCFD] to-[#E4E9EE] border-[#D5DDE5] text-[#5C6B76]"}`}>
                {f.texto} ({foto.cuantos[f.clave]})
              </button>
            ))}
          </div>
        </header>
        {cortado && <p className="text-xs bg-[#FDF0E6] text-[#8a6100] px-3 py-2">Se cortó la conexión: puede haber mensajes nuevos que no estás viendo.</p>}
        <div className="flex-1 overflow-y-auto">
          {foto.filas.length === 0 && <p className="text-xs text-[#5C6B76] p-4">{filtro === "todos" ? "Cuando un cliente escriba al WhatsApp, el chat aparece acá." : "No hay chats en esta pestaña."}</p>}
          {foto.filas.map((f) => (
            <button key={f.id} type="button" onClick={() => setAbierto(f.id)}
              className={`w-full text-left px-3 py-2 border-b border-[#F0F3F8] flex gap-2 items-start ${f.id === abierto ? "bg-[#EAF4EF]" : "hover:bg-[#F7F9FB]"}`}>
              <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-[#DCEFE6] text-[#167655] grid place-items-center text-xs font-bold">
                {f.canal === "prueba" ? "🧪" : (f.nombre.trim()[0] ?? "?").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`truncate text-xs ${f.sinResponder ? "font-bold" : "font-semibold"}`}>{f.nombre}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-[#5C6B76]">{hora(f.ultimoTs)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className={`truncate text-[11px] ${f.sinResponder ? "text-[#12212B]" : "text-[#5C6B76]"}`}>
                    {f.ultimoClase === "ia" ? "🤖 " : f.ultimoClase === "operador" || f.ultimoClase === "desde_el_telefono" ? "✓ " : ""}{f.ultimo}
                  </span>
                  <span className="ml-auto flex shrink-0 gap-1">
                    {f.casos > 0 && <span className="rounded-full bg-[#FDF0E6] text-[#8a6100] text-[10px] font-bold px-1.5">En espera</span>}
                    {f.atiendePersona && <span className="rounded-full bg-[#EEF3F8] text-[#16577F] text-[10px] font-bold px-1.5">Persona</span>}
                    {f.sinResponder && <span className="h-2 w-2 rounded-full bg-[#25D366] self-center" aria-label="Sin responder" />}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── El chat ── */}
      <section aria-label="El chat" className={`${abierto ? "flex" : "hidden md:flex"} flex-col min-h-0 flex-1 bg-white border border-[#E3E9F0] rounded-xl overflow-hidden h-[calc(100dvh-10rem)] md:h-auto`}>
        {foto.abierto && foto.abierto.id === abierto ? (
          <Conversacion key={foto.abierto.id} chat={foto.abierto} nombreIa={foto.nombreIa} iaActiva={foto.iaActiva}
            alVolver={() => setAbierto(null)} alCambiar={() => traer(true)} />
        ) : (
          <div className="grid place-items-center h-full text-center px-8">
            <div>
              <div className="text-4xl">💬</div>
              <p className="text-sm font-semibold mt-3">{abierto ? "Cargando…" : "Elegí un chat"}</p>
              {!abierto && <p className="text-xs text-[#5C6B76] mt-1 max-w-xs">A la izquierda están todos, del más nuevo al más viejo.</p>}
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
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  const [notas, setNotas] = useState(chat.notas);
  const [verNotas, setVerNotas] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const cuantos = chat.mensajes.length;

  useEffect(() => { fondo.current?.scrollTo({ top: fondo.current.scrollHeight }); }, [cuantos]);
  useLayoutEffect(() => {
    const t = caja.current; if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight + 2, 140)}px`;
    t.style.overflowY = t.scrollHeight + 2 > 140 ? "auto" : "hidden";
  }, [texto]);

  async function enviar() {
    if (!texto.trim() || mandando) return;
    setMandando(true); setError(null);
    const r = await accionEnviar(chat.id, texto);
    setMandando(false);
    if (r.ok) { setTexto(""); alCambiar(); } else setError(r.error);
  }
  async function ia(prender: boolean) {
    setError(null);
    const r = await accionIa(chat.id, prender);
    if (!r.ok) setError(r.error);
    alCambiar();
  }

  const iaPrendida = !chat.atiendePersona;
  return (
    <>
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[#E3E9F0] bg-[#F7F9FB]">
        <button type="button" onClick={alVolver} className={`${SUAVE} md:hidden`} aria-label="Volver a la lista">←</button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold truncate">
            {chat.clienteId ? <Link href={`/ventas/clientes/${chat.clienteId}`} className="text-[#16577F] hover:underline">{chat.nombre}</Link> : chat.nombre}
          </div>
          <div className="text-[11px] text-[#5C6B76]">{chat.telefono}{!chat.clienteId && chat.canal === "whatsapp" ? " · no es cliente cargado" : ""}</div>
        </div>
        <button type="button" onClick={() => setVerNotas(!verNotas)} className={SUAVE}>📝 Notas</button>
        <button type="button" role="switch" aria-checked={iaPrendida} onClick={() => ia(!iaPrendida)}
          className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0]"
          title={iaPrendida ? `Lo atiende ${nombreIa}. Apagala para atenderlo vos.` : `Lo atiende una persona. Prendela para que conteste ${nombreIa}.`}>
          <Llave prendido={iaPrendida} />
          <span className="font-semibold">{nombreIa}</span>
        </button>
      </header>
      {!iaActiva && <p className="text-[11px] bg-[#FDF0E6] text-[#8a6100] px-3 py-1.5">{nombreIa} está apagada para todos los chats (Configuración).</p>}
      {verNotas && (
        <div className="px-3 py-2 border-b border-[#E3E9F0] bg-[#FFFDF5]">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="Notas internas de este chat (el cliente no las ve)…"
            className="w-full border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs" />
          <button type="button" className={`${SUAVE} mt-1`} onClick={async () => { await accionNotas(chat.id, notas); setVerNotas(false); alCambiar(); }}>Grabar</button>
        </div>
      )}
      {chat.casos.map((k) => <Caso key={k.id} chatId={chat.id} caso={k} alCambiar={alCambiar} />)}

      <div ref={fondo} className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 bg-[#EFEAE2]">
        {chat.mensajes.map((m) => <Globo key={m.id} m={m} nombreIa={nombreIa} />)}
      </div>

      <footer className="border-t border-[#E3E9F0] p-2 bg-[#F7F9FB]">
        {error && <p className="text-xs text-[#C03420] mb-1">{error}</p>}
        {!chat.ventanaAbierta ? (
          <p className="text-xs text-[#5C6B76] px-1 py-2">Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle desde acá. Escribile desde el teléfono; cuando conteste, seguís desde acá.</p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea ref={caja} value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
              placeholder={iaPrendida ? `Escribí un mensaje (${nombreIa} sigue atendiendo; apagala si lo tomás vos)…` : "Escribí un mensaje…"}
              className="flex-1 resize-none border border-[#E3E9F0] rounded-lg px-2 py-2 text-xs bg-white overflow-hidden" />
            <button type="button" onClick={enviar} disabled={mandando || !texto.trim()} className={PRIMARIO}>{mandando ? "Mandando…" : "Enviar"}</button>
          </div>
        )}
      </footer>
    </>
  );
}

function Globo({ m, nombreIa }: { m: MensajeVista; nombreIa: string }) {
  const nuestro = m.clase !== "entrante";
  const quien = m.clase === "ia" ? `🤖 ${nombreIa}` : m.clase === "operador" ? (m.quien ?? "Panel") : m.clase === "desde_el_telefono" ? "📱 Desde el teléfono" : null;
  const estado = m.estado === "leido" ? <span className="text-[#34B7F1]">✓✓</span> : m.estado === "entregado" ? "✓✓" : m.estado === "enviado" ? "✓" : null;
  return (
    <div className={`flex ${nuestro ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs shadow-sm ${nuestro ? "bg-[#D9FDD3]" : "bg-white"}`}>
        {quien && <div className="text-[10px] font-bold text-[#167655] mb-0.5">{quien}</div>}
        <div className="whitespace-pre-wrap break-words">{m.texto}</div>
        <div className="mt-0.5 flex justify-end gap-1 text-[10px] text-[#5C6B76]">
          <span>{horaLarga(m.ts)}</span>{nuestro && estado}
        </div>
        {m.estado === "fallido" && <div className="text-[10px] text-[#C03420] font-semibold">NO ENTREGADO{m.motivo ? `: ${m.motivo}` : ""}</div>}
      </div>
    </div>
  );
}

function Caso({ chatId, caso, alCambiar }: { chatId: number; caso: ChatAbierto["casos"][number]; alCambiar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [como, setComo] = useState("");
  return (
    <div className="px-3 py-2 border-b border-[#F2D9B8] bg-[#FDF6EC] text-xs">
      <div className="flex items-start gap-2">
        <span>⏳</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold">En espera: {caso.asunto}</div>
          {caso.motivo && <div className="text-[11px] text-[#5C6B76]">{caso.motivo}</div>}
          <div className="text-[10px] text-[#5C6B76]">Desde {horaLarga(caso.abiertoTs)}{caso.asignado ? ` · lo tiene ${caso.asignado}` : ""}</div>
        </div>
        {!abierto && <button type="button" className={SUAVE} onClick={() => setAbierto(true)}>Resolver</button>}
      </div>
      {abierto && (
        <div className="mt-2 flex gap-2">
          <input value={como} onChange={(e) => setComo(e.target.value)} placeholder="Cómo se resolvió (opcional)" className="flex-1 border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white" />
          <button type="button" className={PRIMARIO} onClick={async () => { await accionResolverCaso(chatId, caso.id, como); alCambiar(); }}>Listo</button>
          <button type="button" className={SUAVE} onClick={() => setAbierto(false)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
