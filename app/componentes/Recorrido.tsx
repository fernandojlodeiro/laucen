"use client";

// El recorrido (pedido de Fer, 6/10): arriba, sobre el camino, las pantallas
// por las que fuiste pasando en ESTA pestaña, siguiendo enlaces: "Cambios en
// publicaciones › SKU01485 · Polea…". Cada parte se toca para volver a esa
// pantalla tal como estaba (con sus filtros, su búsqueda y su página).
//   - Volver a una pantalla que ya está en el recorrido lo corta ahí.
//   - Cambiar filtros o página en la misma pantalla no suma un paso: lo actualiza.
//   - Entrar por el menú de arriba (o la barra del celular, o "Lo último que
//     viste") arranca un recorrido nuevo.
//   - Una pestaña nueva (Ctrl + clic) arranca sin recorrido.
// Se guarda en el navegador, por pestaña (sessionStorage + window.name).

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type PasoRecorrido = { href: string; ruta: string; titulo: string };
const CLAVE = "laucen_recorrido";
const MAX = 8;

/** El id de esta pestaña: window.name no pasa a una pestaña nueva. */
function pestana(): string {
  if (!window.name.startsWith("laucen-")) window.name = `laucen-${Math.random().toString(36).slice(2)}`;
  return window.name;
}
function leer(): PasoRecorrido[] {
  try {
    const x = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null") as { pestana: string; pasos: PasoRecorrido[] } | null;
    return x && x.pestana === pestana() ? x.pasos : [];
  } catch { return []; }
}
function guardar(pasos: PasoRecorrido[]) {
  try { sessionStorage.setItem(CLAVE, JSON.stringify({ pestana: pestana(), pasos })); } catch { /* sin almacenamiento: no hay recorrido */ }
}

// Un clic en el menú de arriba, la barra del celular o "Lo último que viste"
// (lo marcado con data-reinicia-recorrido) arranca de cero.
let reiniciar = false;
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a");
    if (a && a.closest("[data-reinicia-recorrido]") && !(e.ctrlKey || e.metaKey || e.shiftKey)) reiniciar = true;
  }, true);
}

const SEP = <span className="text-[#9AA7B3]" aria-hidden>›</span>;

export default function Recorrido() {
  const ruta = usePathname();
  const busqueda = useSearchParams().toString();
  const [pasos, setPasos] = useState<PasoRecorrido[]>([]);

  useEffect(() => {
    const href = busqueda ? `${ruta}?${busqueda}` : ruta;
    let lista = reiniciar ? [] : leer();
    reiniciar = false;
    // Si esta pantalla ya está en el recorrido, se corta ahí (y se actualiza con sus filtros de ahora).
    const i = lista.findIndex((p) => p.ruta === ruta);
    lista = i >= 0 ? lista.slice(0, i) : lista;
    const nuevo: PasoRecorrido = { href, ruta, titulo: i >= 0 ? (leer()[i]?.titulo ?? "") : "" };
    lista = [...lista, nuevo].slice(-MAX);
    guardar(lista);
    setPasos(lista);
    // El nombre: el título de la pantalla, cuando termina de dibujarse.
    let intentos = 0;
    const t = setInterval(() => {
      intentos++;
      const h1 = document.querySelector("main h1")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!h1 && intentos < 10) return;
      clearInterval(t);
      const titulo = (h1 || ruta.split("/").pop() || "Pantalla").slice(0, 48);
      const actual = leer();
      if (actual.length && actual[actual.length - 1].ruta === ruta) {
        actual[actual.length - 1] = { ...actual[actual.length - 1], titulo };
        guardar(actual);
        setPasos(actual);
      }
    }, 200);
    return () => clearInterval(t);
  }, [ruta, busqueda]);

  // Con un solo paso no hay adónde volver.
  if (pasos.length < 2) return null;
  return (
    <nav aria-label="Recorrido" className="print:hidden flex flex-wrap items-center gap-1.5 text-[11px] mb-0.5 text-[#5C6B76]">
      <span title="Por dónde viniste en esta pestaña: tocá una parte para volver">↩</span>
      {pasos.map((p, i) => {
        const ultimo = i === pasos.length - 1;
        return (
          <span key={`${p.ruta}-${i}`} className="inline-flex items-center gap-1.5 min-w-0">
            {ultimo
              ? <span className="truncate max-w-[22rem]">{p.titulo || "…"}</span>
              : <Link href={p.href} className="text-[#16577F] hover:underline truncate max-w-[16rem]" title={p.titulo}>{p.titulo || "…"}</Link>}
            {!ultimo && SEP}
          </span>
        );
      })}
    </nav>
  );
}
