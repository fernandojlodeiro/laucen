"use client";

// La barra de menú de PC (secciones que despliegan sus opciones hacia abajo,
// al hacer clic o al pasar el mouse) y el menú del celular (barra inferior
// con accesos directos + "Menú" con el árbol completo). El árbol viene de
// lib/menu.ts.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ItemMenu, SeccionMenu } from "@/lib/menu";

const activa = (ruta: string, href?: string) => !!href && (ruta === href || ruta.startsWith(`${href}/`));

export function BarraMenu({ menu }: { menu: SeccionMenu[] }) {
  const ruta = usePathname();
  const [abierta, setAbierta] = useState<string | null>(null);
  const caja = useRef<HTMLElement>(null);

  useEffect(() => setAbierta(null), [ruta]);
  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierta(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierta(null); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", cerrar); document.removeEventListener("keydown", esc); };
  }, []);

  return (
    <nav ref={caja} className="flex items-stretch h-full" onMouseLeave={() => setAbierta(null)}>
      {menu.map((s) => {
        const esActiva = activa(ruta, s.href) || s.items.some((i) => activa(ruta, i.href));
        const clase = `h-full flex items-center px-2.5 text-xs font-semibold border-b-2 ${esActiva ? "border-[#16577F] text-[#16577F]" : "border-transparent text-[#1E2A32] hover:bg-[#EEF3F8]"}`;
        if (s.href) return <Link key={s.texto} href={s.href} className={clase} onMouseEnter={() => setAbierta(null)}>{s.texto}</Link>;
        const abierto = abierta === s.texto;
        return (
          <div key={s.texto} className="relative h-full" onMouseEnter={() => setAbierta(s.texto)}>
            <button type="button" aria-expanded={abierto} onClick={() => setAbierta(abierto ? null : s.texto)}
              className={`${clase} ${abierto ? "bg-[#EEF3F8]" : ""}`}>
              {s.texto} <span className="ml-1 text-[9px] text-[#5C6B76]">▾</span>
            </button>
            {abierto && (
              <ul className="absolute left-0 top-full min-w-56 bg-white border border-[#E3E9F0] rounded-b-lg shadow-lg py-1 z-40">
                {s.items.map((i) => <li key={i.texto}><Opcion item={i} ruta={ruta} /></li>)}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Opcion({ item, ruta }: { item: ItemMenu; ruta: string }) {
  if (!item.href) {
    return (
      <span className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs text-[#9AA7B3] cursor-not-allowed" aria-disabled>
        {item.texto} <span className="text-[10px] italic">próximamente</span>
      </span>
    );
  }
  return (
    <Link href={item.href}
      className={`block px-3 py-1.5 text-xs hover:bg-[#EEF3F8] ${activa(ruta, item.href) ? "font-bold text-[#16577F]" : "text-[#1E2A32]"}`}>
      {item.texto}
    </Link>
  );
}

export function MenuCelular({ menu, accesos }: { menu: SeccionMenu[]; accesos: (ItemMenu & { href: string })[] }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => setAbierto(false), [ruta]);

  return (
    <>
      {abierto && (
        <div className="md:hidden fixed inset-0 z-40 bg-white overflow-y-auto pb-24">
          <div className="sticky top-0 bg-white border-b border-[#E3E9F0] px-3 h-11 flex items-center justify-between">
            <span className="text-sm font-bold">Menú</span>
            <button type="button" onClick={() => setAbierto(false)}
              className="text-xs font-bold rounded-lg px-3 py-2 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]">Cerrar</button>
          </div>
          <form action="/buscar" className="px-3 py-3">
            <input name="q" placeholder="Buscar producto, pedido, cliente…" aria-label="Buscar"
              className="w-full text-sm border border-[#E3E9F0] rounded-lg px-3 py-2" />
          </form>
          {menu.map((s) => (
            <section key={s.texto} className="px-3 py-2">
              {s.href ? (
                <Link href={s.href} className="block text-sm font-bold text-[#16577F] py-1">{s.texto}</Link>
              ) : (
                <>
                  <h2 className="text-[11px] font-bold uppercase tracking-wide text-[#5C6B76] mb-1">{s.texto}</h2>
                  <ul className="bg-white border border-[#E3E9F0] rounded-xl divide-y divide-[#E3E9F0]">
                    {s.items.map((i) => (
                      <li key={i.texto}>
                        {i.href
                          ? <Link href={i.href} className="block px-3 py-2.5 text-sm">{i.texto}</Link>
                          : <span className="flex justify-between px-3 py-2.5 text-sm text-[#9AA7B3]">{i.texto}<span className="text-[11px] italic">próximamente</span></span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ))}
        </div>
      )}
      <nav className="md:hidden print:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#E3E9F0] grid grid-cols-5 h-16">
        {accesos.slice(0, 4).map((a) => (
          <Link key={a.href} href={a.href}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${activa(ruta, a.href) ? "text-[#16577F] font-bold" : "text-[#5C6B76]"}`}>
            <span className="text-lg leading-none">{a.icono}</span>{a.texto}
          </Link>
        ))}
        {Array.from({ length: Math.max(0, 4 - accesos.length) }, (_, i) => <span key={i} />)}
        <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${abierto ? "text-[#16577F] font-bold" : "text-[#5C6B76]"}`}>
          <span className="text-lg leading-none">☰</span>Menú
        </button>
      </nav>
    </>
  );
}
