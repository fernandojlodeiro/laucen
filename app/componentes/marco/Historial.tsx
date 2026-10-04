"use client";

// Lo último que estuviste viendo (pedido de Fer, 4/10): sobre el margen
// izquierdo, por fuera del panel, una lista de las fichas que abriste
// (producto, cliente, pedido, factura, reclamo, proveedor, cucarda, publicación, canal…: cualquier registro de un ABM), la última arriba,
// para volver con un clic a lo que estabas mirando hace un rato. Guarda las
// últimas 15 de CADA usuario (en su preferencia: lo ve desde cualquier equipo y no se mezcla con otro usuario)
// y sólo se muestra si en la pantalla sobra lugar a la izquierda.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Visto } from "@/lib/historial";
import { claveVisto } from "@/lib/historial-clave";
import { accionAnotarVisto, accionBorrarHistorial } from "./historial-acciones";

const ANCHO = 176;

/** Las fichas con dirección propia y cómo se llama cada una. */
const FICHAS: [RegExp, string][] = [
  [/^\/catalogo\/productos\/\d+/, "Producto"],
  [/^\/ventas\/clientes\/\d+/, "Cliente"],
  [/^\/ventas\/pedidos\/\d+/, "Pedido"],
  [/^\/ventas\/reclamos\/(ml\/)?[^/]+$/, "Reclamo"],
  [/^\/administracion\/facturacion\/\d+/, "Factura"],
  [/^\/compras\/facturas\/(arca\/)?\d+/, "Factura de compra"],
  [/^\/compras\/despachos\/\d+/, "Despacho"],
  [/^\/administracion\/tesoreria\/\d+/, "Cuenta"],
  [/^\/deposito\/(recepcion|picking)\/[^/]+$/, "Depósito"],
];
/** Cualquier otra pantalla del panel que termine en un número (y no sea de la tienda pública ni de administración interna). */
const FICHA_GENERICA = /^\/(?!tienda\/|admin\/|api\/)[a-z\-/]+\/\d+$/;
/** Pantallas de ABM que abren un registro por la dirección: `?id=` (lista filtrada a uno), `?c=` (canal) o `?editar=<número>` (el lápiz de una fila). */
const PARAM_REGISTRO = /[?&](id|c|editar)=(\d+)/;

type Marca = { tipo: string | null; href: string; porFila: boolean; registro?: string };
function marcaDe(ruta: string, busqueda: string): Marca | null {
  for (const [re, tipo] of FICHAS) if (re.test(ruta)) return { tipo, href: ruta, porFila: false };
  if (FICHA_GENERICA.test(ruta)) return { tipo: null, href: ruta, porFila: false };
  const m = busqueda.match(PARAM_REGISTRO);
  if (m) return { tipo: null, href: `${ruta}?${m[1]}=${m[2]}`, porFila: true, registro: m[2] };
  return null;
}

/** El nombre del registro abierto: lo que dice su ficha; en una lista, el
 *  texto del enlace de la fila que abre ese mismo registro (?c=7, ?id=7…),
 *  o el campo de la fila que se está editando, o la primera celda con letras. */
function tituloDe(porFila: boolean, registro?: string): string {
  const h1 = document.querySelector("main h1")?.textContent?.trim() ?? "";
  if (!porFila) return h1;
  if (registro) {
    const enlace = Array.from(document.querySelectorAll<HTMLAnchorElement>("main tbody a[href]")).find((a) => {
      const q = new URL(a.href, location.href).searchParams;
      return ["c", "id"].some((k) => q.get(k) === registro) && /[A-Za-zÁ-ú]/.test(a.textContent ?? "");
    });
    if (enlace?.textContent?.trim()) return enlace.textContent.trim();
  }
  const campo = Array.from(document.querySelectorAll<HTMLInputElement>("main tbody input:not([type=hidden]):not([type=color]):not([type=checkbox]), main form input:not([type=hidden]):not([type=color]):not([type=checkbox])"))
    .find((i) => /[A-Za-zÁ-ú]/.test(i.value));
  if (campo) return campo.value.trim();
  const celda = Array.from(document.querySelectorAll("main tbody tr:first-child td")).map((t) => t.textContent?.trim() ?? "").find((t) => /[A-Za-zÁ-ú]{2}/.test(t));
  return celda ?? "";
}

export default function Historial({ inicial }: { inicial: Visto[] }) {
  const ruta = usePathname();
  const busquedaActual = useSearchParams().toString();
  const [lista, setLista] = useState<Visto[]>(inicial);
  const [hayLugar, setHayLugar] = useState(false);
  const [actual, setActual] = useState("");

  const medir = useCallback(() => {
    const m = document.querySelector("main");
    setHayLugar(!!m && m.getBoundingClientRect().left >= ANCHO + 24);
  }, []);

  useEffect(() => {
    // Lo que se guardaba en el navegador (antes de que fuera por usuario) se borra: no es de nadie.
    try { localStorage.removeItem("laucen_historial_v1"); } catch { /* da igual */ }
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  // Al entrar a una ficha o abrir un registro: se espera a que dibuje y se anota arriba de todo.
  useEffect(() => {
    const marca = marcaDe(ruta, `?${busquedaActual}`);
    setActual(marca ? claveVisto(marca.href) : "");
    medir();
    if (!marca) return;
    let intentos = 0;
    const t = setInterval(() => {
      intentos++;
      const nombre = tituloDe(marca.porFila, marca.registro);
      if (!nombre && intentos < 8) return;
      clearInterval(t);
      const pantalla = (document.querySelector("main h1")?.textContent?.trim() ?? "").slice(0, 40);
      const tipo = marca.tipo ?? pantalla;
      const titulo = (nombre || `${tipo} ${marca.href.split(/[/=]/).pop()}`).slice(0, 120);
      const visto = { href: marca.href, titulo, tipo: tipo || "Ficha" };
      // Se ve al toque y se guarda en el usuario; si el servidor contesta otra lista (otro equipo), se toma ésa.
      setLista((l) => [visto, ...l.filter((x) => claveVisto(x.href) !== claveVisto(visto.href))].slice(0, 15));
      accionAnotarVisto(visto).then(setLista).catch(() => { /* no se pudo guardar: queda lo que se ve */ });
      medir();
    }, 250);
    return () => clearInterval(t);
  }, [ruta, busquedaActual, medir]);

  if (!hayLugar || lista.length === 0) return null;
  return (
    <aside aria-label="Lo último que viste" className="hidden md:block print:hidden fixed left-2 top-14 bottom-12 z-20 overflow-y-auto" style={{ width: ANCHO }}>
      <div className="rounded-xl border border-[#E3E9F0] bg-white/90 backdrop-blur p-2 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold text-[#5C6B76]">Lo último que viste</span>
          <button type="button" onClick={() => { setLista([]); accionBorrarHistorial().catch(() => { /* ya no se ve; se borra a la próxima */ }); }} title="Borrar la lista" className="text-[11px] text-[#9AA7B3] hover:text-[#C03420]">✕</button>
        </div>
        <ul className="grid gap-0.5">
          {lista.map((v) => (
            <li key={v.href}>
              <Link href={v.href} className={`block rounded-md px-1.5 py-1 hover:bg-[#EEF3F8] ${claveVisto(v.href) === actual ? "bg-[#EEF3F8]" : ""}`} title={v.titulo}>
                <span className="block text-[9px] uppercase tracking-wide text-[#9AA7B3] leading-3">{v.tipo}</span>
                <span className={`block text-[11px] leading-4 line-clamp-2 ${claveVisto(v.href) === actual ? "font-bold text-[#16577F]" : "text-[#1E2A32]"}`}>{v.titulo}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
