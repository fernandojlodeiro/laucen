"use client";

// Lo último que estuviste viendo (pedido de Fer, 4/10): sobre el margen
// izquierdo, por fuera del panel, una lista de las fichas que abriste
// (producto, cliente, pedido, factura, reclamo, proveedor…), la última arriba,
// para volver con un clic a lo que estabas mirando hace un rato. Guarda las
// últimas 15 en este navegador (no se comparte con otras personas ni equipos)
// y sólo se muestra si en la pantalla sobra lugar a la izquierda.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Visto = { href: string; titulo: string; tipo: string };
const CLAVE = "laucen_historial_v1";
const MAX = 15;
const ANCHO = 176;

/** Qué direcciones son una "ficha" y cómo se llama cada una. */
const FICHAS: [RegExp, string][] = [
  [/^\/catalogo\/productos\/\d+/, "Producto"],
  [/^\/ventas\/clientes\/\d+/, "Cliente"],
  [/^\/ventas\/pedidos\/\d+/, "Pedido"],
  [/^\/ventas\/reclamos\/(ml\/)?[^/]+$/, "Reclamo"],
  [/^\/administracion\/facturacion\/\d+/, "Factura"],
  [/^\/compras\/facturas\/\d+/, "Factura de compra"],
  [/^\/compras\/despachos\/\d+/, "Despacho"],
  [/^\/administracion\/tesoreria\/\d+/, "Cuenta"],
  [/^\/compras\/proveedores$/, "Proveedor"],
];

function tipoDe(ruta: string, busqueda: string): string | null {
  for (const [re, tipo] of FICHAS) {
    if (!re.test(ruta)) continue;
    if (tipo === "Proveedor" && !/[?&]id=\d+/.test(busqueda)) return null;
    return tipo;
  }
  return null;
}

const leer = (): Visto[] => {
  try { const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
const guardar = (v: Visto[]) => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* sin almacenamiento: no pasa nada */ } };

export default function Historial() {
  const ruta = usePathname();
  const [lista, setLista] = useState<Visto[]>([]);
  const [hayLugar, setHayLugar] = useState(false);
  const [actual, setActual] = useState("");

  const medir = useCallback(() => {
    const m = document.querySelector("main");
    setHayLugar(!!m && m.getBoundingClientRect().left >= ANCHO + 24);
  }, []);

  useEffect(() => {
    setLista(leer());
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  // Al entrar a una ficha: se espera a que dibuje su título y se anota arriba de todo.
  useEffect(() => {
    const busqueda = window.location.search;
    const tipo = tipoDe(ruta, busqueda);
    const href = ruta + (tipo === "Proveedor" ? (busqueda.match(/[?&]id=\d+/)?.[0].replace(/^&/, "?") ?? "") : "");
    setActual(tipo ? href : "");
    medir();
    if (!tipo) return;
    let intentos = 0;
    const t = setInterval(() => {
      intentos++;
      const h1 = document.querySelector("main h1")?.textContent?.trim();
      if (!h1 && intentos < 8) return;
      clearInterval(t);
      const titulo = (h1 || `${tipo} ${href.split("/").pop()}`).slice(0, 120);
      const nueva = [{ href, titulo, tipo }, ...leer().filter((x) => x.href !== href)].slice(0, MAX);
      guardar(nueva);
      setLista(nueva);
      medir();
    }, 250);
    return () => clearInterval(t);
  }, [ruta, medir]);

  if (!hayLugar || lista.length === 0) return null;
  return (
    <aside aria-label="Lo último que viste" className="hidden md:block print:hidden fixed left-2 top-14 bottom-12 z-20 overflow-y-auto" style={{ width: ANCHO }}>
      <div className="rounded-xl border border-[#E3E9F0] bg-white/90 backdrop-blur p-2 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold text-[#5C6B76]">Lo último que viste</span>
          <button type="button" onClick={() => { guardar([]); setLista([]); }} title="Borrar la lista" className="text-[11px] text-[#9AA7B3] hover:text-[#C03420]">✕</button>
        </div>
        <ul className="grid gap-0.5">
          {lista.map((v) => (
            <li key={v.href}>
              <Link href={v.href} className={`block rounded-md px-1.5 py-1 hover:bg-[#EEF3F8] ${v.href === actual ? "bg-[#EEF3F8]" : ""}`} title={v.titulo}>
                <span className="block text-[9px] uppercase tracking-wide text-[#9AA7B3] leading-3">{v.tipo}</span>
                <span className={`block text-[11px] leading-4 line-clamp-2 ${v.href === actual ? "font-bold text-[#16577F]" : "text-[#1E2A32]"}`}>{v.titulo}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
