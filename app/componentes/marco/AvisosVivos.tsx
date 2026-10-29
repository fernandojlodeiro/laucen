"use client";

// Avisos de la barra de estado (pedido de Fer, 10/10; lib/avisos.ts):
//   · <ContadoresEstado> (en la barra de abajo): los contadores, que se
//     refrescan solos. Lo que entró y el usuario todavía no vio se pinta en
//     amarillo hasta que entra a esa pantalla.
//   · <VigiaAvisos> (en el marco, una sola vez): pregunta cada 15 segundos.
//     Si el usuario está en la pantalla de un contador y entró algo o
//     cambió la cantidad (otro operador resolvió un pendiente), la actualiza
//     (salvo que esté escribiendo). Según lo que eligió en
//     Configuración › Mis avisos: suena cuando entra algo (como mucho una vez
//     cada tantos minutos) y abre de prepo una ventana con lo que la IA no
//     contestó. Con la pestaña a la vista se lo dice al servidor (?vista=1):
//     así los avisos de Windows no se duplican con la pantalla.
//     Con varias pestañas de Laucen abiertas (Fer, 29/10), la ventana y los carteles aparecen sólo en la pestaña donde
//     estás trabajando (la última que tocaste) y, si cambiás de pestaña sin cerrarla, la ventana se pasa a la nueva.
//     Al cerrarla en una, se cierra en todas. Las pestañas se hablan por un canal del navegador (BroadcastChannel).

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { esPantallaDe, type AvisoIa, type Contador, type EstadoAvisos } from "@/lib/avisos-tipos";

const EVENTO = "laucen-contadores";
const CANAL_PESTANAS = "laucen-avisos";
const claveAviso = (a: AvisoIa) => `${a.tipo}:${a.id}`;

type MensajePestana = { tipo: "foco"; id: string; ts: number } | { tipo: "chau"; id: string } | { tipo: "cerrar"; claves: string[] };

/** ¿Esta pestaña es donde está trabajando? La que se tocó o se puso a la vista último, entre todas las de Laucen. Sin el
 *  canal del navegador (uno muy viejo), todas lo son, como antes. `canal` sirve también para avisar que se cerró algo. */
function usePestanaElegida(alCerrar: (claves: string[]) => void) {
  const id = useRef("");
  const focos = useRef(new Map<string, number>());
  const canal = useRef<BroadcastChannel | null>(null);
  const [elegida, setElegida] = useState(true);
  const cerrarRef = useRef(alCerrar);
  cerrarRef.current = alCerrar;
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    id.current = Math.random().toString(36).slice(2);
    const bc = new BroadcastChannel(CANAL_PESTANAS);
    canal.current = bc;
    const recalcular = () => {
      let mejor = id.current, ts = -1;
      for (const [k, v] of focos.current) if (v > ts || (v === ts && k > mejor)) { mejor = k; ts = v; }
      setElegida(mejor === id.current);
    };
    const anunciar = () => {
      const ts = Date.now();
      focos.current.set(id.current, ts);
      bc.postMessage({ tipo: "foco", id: id.current, ts } satisfies MensajePestana);
      recalcular();
    };
    bc.onmessage = (ev: MessageEvent<MensajePestana>) => {
      const m = ev.data;
      if (m.tipo === "foco") {
        // Una pestaña nueva pregunta quién está: las que están a la vista se vuelven a anunciar.
        const nueva = !focos.current.has(m.id);
        focos.current.set(m.id, m.ts);
        if (nueva) bc.postMessage({ tipo: "foco", id: id.current, ts: focos.current.get(id.current) ?? 0 } satisfies MensajePestana);
        recalcular();
      } else if (m.tipo === "chau") { focos.current.delete(m.id); recalcular(); }
      else if (m.tipo === "cerrar") cerrarRef.current(m.claves);
    };
    focos.current.set(id.current, document.hasFocus() ? Date.now() : 0);
    bc.postMessage({ tipo: "foco", id: id.current, ts: focos.current.get(id.current)! } satisfies MensajePestana);
    recalcular();
    const alVolver = () => { if (!document.hidden) anunciar(); };
    const chau = () => bc.postMessage({ tipo: "chau", id: id.current } satisfies MensajePestana);
    window.addEventListener("focus", anunciar);
    window.addEventListener("pointerdown", anunciar);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("pagehide", chau);
    return () => {
      chau();
      window.removeEventListener("focus", anunciar);
      window.removeEventListener("pointerdown", anunciar);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("pagehide", chau);
      bc.close();
      canal.current = null;
    };
  }, []);
  const avisarCerrados = useCallback((claves: string[]) => {
    if (claves.length) canal.current?.postMessage({ tipo: "cerrar", claves } satisfies MensajePestana);
  }, []);
  return { elegida, avisarCerrados };
}
const CADA_MS = 15_000;
const CADA_OCULTA_MS = 60_000;

export function ContadoresEstado({ inicial }: { inicial: Contador[] }) {
  const [contadores, setContadores] = useState(inicial);
  useEffect(() => {
    const cambio = (e: Event) => setContadores((e as CustomEvent<Contador[]>).detail);
    window.addEventListener(EVENTO, cambio);
    return () => window.removeEventListener(EVENTO, cambio);
  }, []);
  return (
    <span className="flex items-center gap-3">
      {contadores.map((c) => <UnContador key={c.clave} c={c} />)}
    </span>
  );
}

function UnContador({ c }: { c: Contador }) {
  if (c.n === null) return <span className="opacity-50" title="Próximamente">{c.texto}: —</span>;
  const marca = c.nuevo ? "bg-[#FFC94D] text-[#3A2A00] rounded px-1" : c.n > 0 ? "bg-white text-[#16577F] rounded px-1" : "";
  const cuerpo = <>{c.texto}: <b className={marca}>{c.n}</b>{c.persona ? <b className="ml-1 bg-[#FFC94D] text-[#3A2A00] rounded px-1" title={`${c.persona} esperan a una persona del equipo (la IA las derivó)`}>👤 {c.persona}</b> : null}</>;
  const ayuda = c.nuevo ? "Entró algo que todavía no viste" : undefined;
  return c.href ? <Link href={c.href} className="hover:underline" title={ayuda}>{cuerpo}</Link> : <span title={ayuda}>{cuerpo}</span>;
}

export function VigiaAvisos({ inicial }: { inicial: EstadoAvisos }) {
  const router = useRouter();
  const ruta = usePathname();
  const ver = useSearchParams().get("ver");
  const ultimos = useRef(inicial.contadores);
  const [ventana, setVentana] = useState<AvisoIa[]>([]);
  const [carteles, setCarteles] = useState<AvisoIa[]>([]);
  const abiertos = useRef<AvisoIa[]>([]);
  abiertos.current = ventana;
  // Lo que se cerró (acá o en otra pestaña): no se vuelve a abrir aunque llegue en una consulta que ya estaba en camino.
  const cerrados = useRef(new Set<string>());
  const sacar = useCallback((claves: string[]) => {
    for (const k of claves) cerrados.current.add(k);
    setVentana((v) => v.filter((a) => !claves.includes(claveAviso(a))));
    setCarteles((c) => c.filter((a) => !claves.includes(claveAviso(a))));
  }, []);
  const { elegida, avisarCerrados } = usePestanaElegida(sacar);
  const marcas = useRef(new Map(inicial.contadores.map((c) => [c.clave, c.marca])));
  const cantidades = useRef(new Map(inicial.contadores.map((c) => [c.clave, c.n])));
  const vistos = useRef(new Set<string>());
  const donde = useRef({ ruta, ver });
  donde.current = { ruta, ver };

  // Entrar a la pantalla de un contador = verlo (también si entra algo mientras se está ahí).
  const marcarVistos = useCallback((cs: Contador[]) => {
    const { ruta: r, ver: v } = donde.current;
    let cambio = false;
    const nuevos = cs.map((c) => {
      if (!c.nuevo || !esPantallaDe(c.clave, r, v)) return c;
      const llave = `${c.clave}:${c.marca}`;
      if (!vistos.current.has(llave)) {
        vistos.current.add(llave);
        fetch("/api/avisos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visto: c.clave }) }).catch(() => {});
      }
      cambio = true;
      return { ...c, nuevo: false };
    });
    return cambio ? nuevos : cs;
  }, []);

  const publicar = useCallback((cs: Contador[]) => {
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: cs }));
  }, []);

  const mirar = useCallback(async () => {
    let e: EstadoAvisos;
    try {
      const r = await fetch(`/api/avisos${document.hidden ? "" : "?vista=1"}`, { cache: "no-store" });
      if (!r.ok) return;
      e = await r.json() as EstadoAvisos;
    } catch { return; /* sin red: se reintenta */ }

    // ¿Entró algo desde la última vez?
    const entraron = e.contadores.filter((c) => {
      const antes = marcas.current.get(c.clave);
      return antes !== undefined && c.marca > antes && c.n !== null && c.n > 0;
    });
    // ¿Cambió la cantidad de pendientes? Si bajó es que otro operador (o este mismo en otra pestaña) ya lo resolvió.
    const cambiaron = e.contadores.filter((c) => cantidades.current.has(c.clave) && cantidades.current.get(c.clave) !== c.n);
    cantidades.current = new Map(e.contadores.map((c) => [c.clave, c.n]));
    marcas.current = new Map(e.contadores.map((c) => [c.clave, c.marca]));
    const contadores = marcarVistos(e.contadores);
    ultimos.current = contadores;
    publicar(contadores);

    // Si está en la pantalla de lo que entró (o de lo que se resolvió: cambió la cantidad), se actualiza sola
    // (WhatsApp ya se actualiza por su cuenta). Si está escribiendo, espera.
    const { ruta: r, ver: v } = donde.current;
    if ([...entraron, ...cambiaron].some((c) => c.clave !== "atender" && esPantallaDe(c.clave, r, v)) && !escribiendo()) router.refresh();

    // Lo que la IA no contestó: con la ventana apagada, queda como avisado sin mostrarse.
    if (e.ventana.length) {
      // Cada tipo según lo elegido en Mis avisos; los que no abren ventana quedan como avisados.
      // Un pedido sin «Ver el detalle del pedido»: sólo un cartel de que llegó, sin ventana.
      const soloCartel = (a: AvisoIa) => a.tipo === "pedidos" && !e.prefs.pedidoDetalle;
      const nuevo = (a: AvisoIa) => !cerrados.current.has(claveAviso(a));
      const mostrar = e.ventana.filter((a) => e.prefs.ventana[a.tipo] && !soloCartel(a) && nuevo(a));
      const carteles = e.ventana.filter((a) => e.prefs.ventana[a.tipo] && soloCartel(a) && nuevo(a));
      if (mostrar.length) setVentana((actual) => [...actual, ...mostrar.filter((a) => !actual.some((x) => x.tipo === a.tipo && x.id === a.id))]);
      if (carteles.length) {
        setCarteles((c) => [...c, ...carteles.filter((a) => !c.some((x) => x.id === a.id))]);
        for (const a of carteles) setTimeout(() => setCarteles((c) => c.filter((x) => x.id !== a.id)), 20_000);
      }
      avisar(e.ventana.filter((a) => !mostrar.includes(a) && nuevo(a)));
    }
    if (e.prefs.sonido && (entraron.length || e.ventana.length)) sonarConLimite(e.prefs.cadaMin);
  }, [marcarVistos, publicar, router]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let vivo = true;
    const vuelta = async () => {
      await mirar();
      if (vivo) timer = setTimeout(vuelta, document.hidden ? CADA_OCULTA_MS : CADA_MS);
    };
    timer = setTimeout(vuelta, 2000);
    const alVolver = () => { if (!document.hidden) { clearTimeout(timer); vuelta(); } };
    document.addEventListener("visibilitychange", alVolver);
    // El navegador deja sonar sólo después de que la persona tocó algo en la página.
    const despertar = () => prepararSonido();
    window.addEventListener("pointerdown", despertar, { once: true });
    window.addEventListener("keydown", despertar, { once: true });
    return () => {
      vivo = false; clearTimeout(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("pointerdown", despertar);
      window.removeEventListener("keydown", despertar);
    };
  }, [mirar]);

  // Al cambiar de pantalla: si es la de un contador con algo nuevo, queda visto.
  useEffect(() => {
    const contadores = marcarVistos(ultimos.current);
    if (contadores === ultimos.current) return;
    ultimos.current = contadores;
    publicar(contadores);
  }, [ruta, ver, marcarVistos, publicar]);

  const cerrar = useCallback(() => {
    avisar(abiertos.current);
    const claves = abiertos.current.map(claveAviso);
    sacar(claves);
    avisarCerrados(claves);
  }, [sacar, avisarCerrados]);
  const cerrarCartel = useCallback((a: AvisoIa) => { sacar([claveAviso(a)]); avisarCerrados([claveAviso(a)]); }, [sacar, avisarCerrados]);

  useEffect(() => {
    if (!ventana.length || !elegida) return;
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") cerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ventana.length, elegida, cerrar]);

  // En las otras pestañas no se dibuja nada: queda guardado por si pasás a trabajar en una de ellas.
  if (!elegida) return null;
  const cartelesPedidos = carteles.length > 0 && (
    <div className="fixed bottom-20 md:bottom-12 right-4 z-[60] grid gap-2 w-72 max-w-[calc(100vw-2rem)] print:hidden" aria-live="polite">
      {carteles.map((a) => (
        <div key={a.id} role="status" className="rounded-xl border border-[#BFD3E6] bg-[#EEF3F8] px-3 py-2 text-xs text-[#16577F] shadow-md flex items-start justify-between gap-2">
          <Link href={a.href} onClick={() => cerrarCartel(a)} className="hover:underline">
            🛒 <b>Llegó un pedido</b>{a.titulo.replace(/^Pedido nuevo/, "")}
          </Link>
          <button type="button" onClick={() => cerrarCartel(a)} aria-label="Cerrar" className="leading-none opacity-60 hover:opacity-100">×</button>
        </div>
      ))}
    </div>
  );
  if (!ventana.length) return cartelesPedidos || null;
  return (
    <>
    {cartelesPedidos}
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="aviso-ia-titulo">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-[#E3E9F0] px-4 py-3">
          <h2 id="aviso-ia-titulo" className="text-sm font-bold">
            {ventana.every((a) => a.tipo === "pedidos")
              ? (ventana.length === 1 ? "Entró un pedido nuevo" : `Entraron ${ventana.length} pedidos nuevos`)
              : ventana.length === 1 ? "Esto te necesita" : `${ventana.length} cosas te necesitan`}
          </h2>
          <button type="button" onClick={cerrar} className={SUAVE}>Cerrar</button>
        </div>
        <div className="overflow-y-auto px-4 py-3 grid gap-3">
          {ventana.map((a) => (
            <div key={`${a.tipo}:${a.id}`} className="rounded-lg border border-[#E3E9F0] p-3 text-xs grid gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <b className="text-[13px]">{a.titulo}</b>
                  {a.detalle && <div className="text-[#5C6B76]">{a.detalle}</div>}
                </div>
                <Link href={a.href} onClick={cerrar} className={`${PRIMARIO} shrink-0`}>{a.tipo === "pedidos" || a.tipo === "facturas" ? "Ver el pedido" : a.tipo === "reclamos" ? "Ver el reclamo" : "Ir a responder"}</Link>
              </div>
              {a.texto && <p className="whitespace-pre-wrap rounded-lg bg-[#F7F9FB] border border-[#E3E9F0] px-2 py-1.5 text-[13px]">{a.texto}</p>}
              {a.motivo && <p className="text-[#8a6100]">⚠ {a.motivo}</p>}
              {a.propuesta && <p className="text-[#5C6B76]"><b>La IA propone:</b> {a.propuesta}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}

/** Guarda que ya se mostró (o que no hacía falta mostrarlo): no se vuelve a abrir. */
function avisar(avisos: AvisoIa[]) {
  if (!avisos.length) return;
  const marcas: Record<string, number> = {};
  for (const a of avisos) marcas[a.tipo] = Math.max(marcas[a.tipo] ?? 0, a.marca);
  fetch("/api/avisos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ avisado: marcas }) }).catch(() => {});
}

/** ¿Está escribiendo en un campo? Entonces no se le actualiza la pantalla abajo de los dedos. */
function escribiendo(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

// ── El sonido: dos notas cortas (un tercio de segundo), sin archivo ──

const ULTIMO_SONIDO = "laucen-ultimo-sonido";

/** Suena como mucho una vez cada `cadaMin` minutos (también entre pestañas). */
function sonarConLimite(cadaMin: number) {
  let ultimo = 0;
  try { ultimo = Number(localStorage.getItem(ULTIMO_SONIDO)) || 0; } catch { /* sin almacenamiento */ }
  if (Date.now() - ultimo < Math.max(1, cadaMin) * 60_000 - 2000) return;
  try { localStorage.setItem(ULTIMO_SONIDO, String(Date.now())); } catch { /* sin almacenamiento */ }
  sonar();
}
let audio: AudioContext | null = null;

function prepararSonido() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch { /* sin audio */ }
}

export function sonar() {
  prepararSonido();
  if (!audio) return;
  const t = audio.currentTime;
  for (const [i, f] of [880, 1320].entries()) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
    o.connect(g).connect(audio.destination);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 0.18);
  }
}
