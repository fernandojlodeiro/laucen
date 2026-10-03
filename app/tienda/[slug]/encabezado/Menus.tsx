"use client";

// Menú de categorías del encabezado.
// - Compu: "Categorías ▾" abre (al pasar el mouse o con clic) una columna
//   oscura con las categorías de primer nivel; al pasar por una, a la derecha
//   aparecen sus subcategorías en columnas, cada una con sus hijas.
// - Celular: la hamburguesa abre un cajón con los links de la tienda y las
//   categorías, que se recorren nivel por nivel ("‹ Volver").
// Sólo aparecen categorías con productos en la tienda (lo arma catalogo.ts).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ItemMenu } from "../catalogo";

const chevron = (clase: string) => (
  <svg viewBox="0 0 24 24" className={clase} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
);

export function MenuCategorias({ arbol, base }: { arbol: ItemMenu[]; base: string }) {
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState<number | null>(arbol[0]?.id ?? null);
  const caja = useRef<HTMLDivElement>(null);
  const tiempo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ruta = usePathname();

  useEffect(() => { setAbierto(false); }, [ruta]);
  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", cerrar); document.removeEventListener("keydown", esc); };
  }, []);

  if (!arbol.length) return null;
  const sel = arbol.find((x) => x.id === activa) ?? arbol[0];
  const entrar = () => { if (tiempo.current) clearTimeout(tiempo.current); tiempo.current = setTimeout(() => setAbierto(true), 120); };
  const salir = () => { if (tiempo.current) clearTimeout(tiempo.current); tiempo.current = setTimeout(() => setAbierto(false), 200); };
  const href = (id: number) => `${base}/familia/${id}`;

  return (
    <div ref={caja} className="relative" onMouseEnter={entrar} onMouseLeave={salir}>
      <button type="button" aria-expanded={abierto} aria-haspopup="true" onClick={() => setAbierto((x) => !x)}
        className="flex h-8 items-center gap-1 text-sm text-[var(--marca-texto)] opacity-80 hover:opacity-100">
        Categorías {chevron(`h-3.5 w-3.5 transition ${abierto ? "rotate-180" : ""}`)}
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-50 flex pt-2">
          {/* La flechita de arriba del menú. */}
          <span aria-hidden className="absolute left-6 top-0.5 h-3 w-3 rotate-45 bg-[var(--menu-oscuro)]" />
          <ul className="max-h-[70vh] w-[260px] overflow-y-auto rounded-l bg-[var(--menu-oscuro)] py-3 text-sm text-white shadow-xl [scrollbar-width:thin]">
            {arbol.map((r) => (
              <li key={r.id}>
                <Link href={href(r.id)} onMouseEnter={() => setActiva(r.id)} onFocus={() => setActiva(r.id)}
                  className={`flex items-center justify-between px-5 py-2 ${r.id === sel.id ? "bg-[var(--boton)]" : "hover:bg-[var(--boton)]"}`}>
                  <span className="line-clamp-1">{r.nombre}</span>
                  {r.hijas.length > 0 && chevron("h-3.5 w-3.5 -rotate-90 opacity-70")}
                </Link>
              </li>
            ))}
          </ul>
          <div className="max-h-[70vh] w-[min(720px,calc(100vw-320px))] overflow-y-auto rounded-r bg-white px-7 py-5 shadow-xl">
            <Link href={href(sel.id)} className="text-lg font-semibold text-[var(--texto)] hover:text-[var(--boton)]">{sel.nombre}</Link>
            {sel.hijas.length > 0 ? (
              <div className="mt-4 columns-3 gap-6">
                {sel.hijas.map((h) => (
                  <div key={h.id} className="mb-5 break-inside-avoid">
                    <Link href={href(h.id)} className="block text-sm font-semibold text-[var(--texto)] hover:text-[var(--boton)]">{h.nombre}</Link>
                    {h.hijas.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {h.hijas.slice(0, 6).map((n) => (
                          <li key={n.id}><Link href={href(n.id)} className="text-sm text-[var(--texto-2)] hover:text-[var(--boton)]">{n.nombre}</Link></li>
                        ))}
                        {h.hijas.length > 6 && <li><Link href={href(h.id)} className="text-sm text-[var(--boton)]">Ver todo</Link></li>}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--texto-2)]">{sel.total === 1 ? "1 producto" : `${sel.total} productos`} · <Link href={href(sel.id)} className="text-[var(--boton)]">Ver todo</Link></p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Enlace = { nombre: string; href: string };

export function MenuMovil({ arbol, base, saludo, cuenta, enlaces }: {
  arbol: ItemMenu[]; base: string; saludo: string; cuenta: Enlace; enlaces: Enlace[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [pila, setPila] = useState<ItemMenu[]>([]);
  const [enCategorias, setEnCategorias] = useState(false);
  const ruta = usePathname();

  useEffect(() => { setAbierto(false); }, [ruta]);
  useEffect(() => {
    document.body.style.overflow = abierto ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [abierto]);

  const actual = pila[pila.length - 1];
  const items = actual ? actual.hijas : arbol;
  const fila = "flex w-full items-center justify-between border-b border-[var(--linea)] px-5 py-3.5 text-left text-[15px] text-[var(--texto)]";
  const cerrar = () => { setAbierto(false); setPila([]); setEnCategorias(false); };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto}
        className="grid h-10 w-10 place-items-center text-[var(--marca-texto)]">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {abierto && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" aria-label="Cerrar menú" onClick={cerrar} className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-start justify-between bg-[var(--marca)] px-5 pb-4 pt-5 text-[var(--marca-texto)]">
              <div>
                <p className="text-base font-semibold">{saludo}</p>
                <Link href={cuenta.href} onClick={cerrar} className="text-sm underline-offset-2 hover:underline">{cuenta.nombre}</Link>
              </div>
              <button type="button" onClick={cerrar} aria-label="Cerrar menú" className="-mr-2 grid h-9 w-9 place-items-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto">
              {!enCategorias ? (
                <ul>
                  {enlaces.map((e) => <li key={e.href}><Link href={e.href} onClick={cerrar} className={fila}>{e.nombre}</Link></li>)}
                  {arbol.length > 0 && (
                    <li>
                      <button type="button" onClick={() => setEnCategorias(true)} className={fila}>
                        Categorías {chevron("h-4 w-4 -rotate-90 text-[var(--texto-2)]")}
                      </button>
                    </li>
                  )}
                </ul>
              ) : (
                <div>
                  <button type="button" onClick={() => (pila.length ? setPila(pila.slice(0, -1)) : setEnCategorias(false))}
                    className="flex w-full items-center gap-2 border-b border-[var(--linea)] bg-black/[.03] px-5 py-3 text-sm font-semibold text-[var(--boton)]">
                    {chevron("h-4 w-4 rotate-90")} {actual ? (pila.length > 1 ? pila[pila.length - 2].nombre : "Categorías") : "Menú"}
                  </button>
                  <p className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-[var(--texto-2)]">{actual ? actual.nombre : "Categorías"}</p>
                  <ul>
                    {actual && <li><Link href={`${base}/familia/${actual.id}`} onClick={cerrar} className={`${fila} font-semibold`}>Ver todo en {actual.nombre}</Link></li>}
                    {items.map((x) => (
                      <li key={x.id}>
                        {x.hijas.length > 0 ? (
                          <button type="button" onClick={() => setPila([...pila, x])} className={fila}>
                            <span>{x.nombre}</span>{chevron("h-4 w-4 -rotate-90 text-[var(--texto-2)]")}
                          </button>
                        ) : (
                          <Link href={`${base}/familia/${x.id}`} onClick={cerrar} className={fila}>{x.nombre}</Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
