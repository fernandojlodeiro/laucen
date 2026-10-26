"use client";

// Una caja de texto que, al escribir "#", se vuelve un buscador de publicaciones propias (Fer, 13/10): lo que se
// escribe después del "#" busca productos y muestra sus publicaciones de Mercado Libre (primero las del mismo plan que
// la de la pregunta); al elegir una, el "#…" se reemplaza por su link. Sirve en Preguntas y en WhatsApp.

import { useEffect, useRef, useState, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from "react";
import { accionBuscarPublicaciones } from "@/app/componentes/publicaciones-buscar";
import type { PublicacionEncontrada } from "@/lib/mercadolibre/buscar-publicaciones";
import { pedidoDePublicacion } from "@/lib/pedido-publicacion";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "ref"> & {
  value: string; onChange: (v: string) => void;
  /** Si hay cuenta, sólo sus publicaciones de Mercado Libre; sin cuenta, las de todas. */
  canalId?: number | null;
  /** Fuera de Mercado Libre (WhatsApp, Instagram…): los productos de nuestra tienda web, no las publicaciones de ML. */
  web?: boolean;
  /** El plan de la publicación de la pregunta: sus publicaciones del mismo plan salen primero. */
  plan?: string | null;
  cajaRef?: Ref<HTMLTextAreaElement>;
};

export default function CajaConPublicaciones({ value, onChange, canalId, plan, web = false, cajaRef, onKeyDown, ...resto }: Props) {
  const interna = useRef<HTMLTextAreaElement | null>(null);
  const [pedido, setPedido] = useState<{ desde: number; busqueda: string } | null>(null);
  const [lista, setLista] = useState<PublicacionEncontrada[]>([]);
  const [activa, setActiva] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultima = useRef(0);

  const ponerRef = (el: HTMLTextAreaElement | null) => {
    interna.current = el;
    if (typeof cajaRef === "function") cajaRef(el);
    else if (cajaRef) (cajaRef as { current: HTMLTextAreaElement | null }).current = el;
  };

  const buscar = (p: { desde: number; busqueda: string } | null) => {
    setPedido(p);
    if (espera.current) clearTimeout(espera.current);
    if (!p || p.busqueda.trim().length < 2) { setLista([]); setBuscando(false); return; }
    setBuscando(true);
    const n = ++ultima.current;
    espera.current = setTimeout(async () => {
      const r = await accionBuscarPublicaciones(p.busqueda, { canalId, plan, web }).catch(() => []);
      if (n !== ultima.current) return; // llegó una búsqueda más nueva
      setLista(r); setActiva(0); setBuscando(false);
    }, 250);
  };
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);

  function elegir(p: PublicacionEncontrada) {
    const el = interna.current;
    if (!pedido || !el) return;
    const fin = el.selectionStart ?? value.length;
    const nuevo = `${value.slice(0, pedido.desde)}${p.permalink} ${value.slice(fin)}`;
    const cursor = pedido.desde + p.permalink.length + 1;
    onChange(nuevo);
    setPedido(null); setLista([]);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (pedido) {
      if (e.key === "Escape") { e.preventDefault(); setPedido(null); setLista([]); return; }
      if (lista.length) {
        if (e.key === "ArrowDown") { e.preventDefault(); setActiva((i) => (i + 1) % lista.length); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setActiva((i) => (i - 1 + lista.length) % lista.length); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); elegir(lista[activa]); return; }
      }
    }
    onKeyDown?.(e);
  }

  const sinPlanPedido = !plan;
  const tiene = lista.some((x) => x.mismoPlan);
  return (
    <div className="relative flex-1 min-w-0">
      <textarea {...resto} ref={ponerRef} value={value} onKeyDown={alTeclear}
        onChange={(e) => { onChange(e.target.value); buscar(pedidoDePublicacion(e.target.value, e.target.selectionStart ?? e.target.value.length)); }}
        onClick={(e) => buscar(pedidoDePublicacion(value, e.currentTarget.selectionStart ?? value.length))} />
      {pedido && (
        <div className="absolute left-0 right-0 bottom-full mb-1 z-30 bg-white border border-[#E3E9F0] rounded-lg shadow-lg max-h-72 overflow-y-auto text-xs">
          {pedido.busqueda.trim().length < 2
            ? <p className="p-2 text-[#5C6B76]">Escribí el producto que buscás (ej. <b>#notebook asus</b>) y elegí {web ? "el de la tienda web" : "la publicación"}: queda su link en el texto.</p>
            : buscando && !lista.length ? <p className="p-2 text-[#5C6B76]">Buscando…</p>
            : !lista.length ? <p className="p-2 text-[#5C6B76]">{web ? "No hay productos en la tienda web con eso." : `No hay publicaciones activas de ese producto${canalId ? " en esta cuenta" : ""}.`}</p>
            : lista.map((p, i) => (
              <button type="button" key={`${p.canal_id}-${p.item_id}`} onMouseDown={(e) => { e.preventDefault(); elegir(p); }} onMouseEnter={() => setActiva(i)}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 border-t first:border-t-0 border-[#E3E9F0] ${i === activa ? "bg-[#EEF3F8]" : "hover:bg-[#FAFBFC]"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.foto ? <img src={p.foto} alt="" className="h-9 w-9 rounded object-cover border border-[#E3E9F0] shrink-0" /> : <span className="h-9 w-9 rounded border border-[#E3E9F0] shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.titulo}</span>
                  <span className="block truncate text-[#5C6B76]">{!canalId && !web && <>{p.cuenta} · </>}{p.sku ? `${p.sku} · ` : ""}{p.item_id}</span>
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${p.mismoPlan ? "bg-[#E8F5EE] text-[#167655]" : "bg-[#EEF3F8] text-[#16577F]"}`}>
                  {p.planTexto ?? "—"}{p.mismoPlan ? " · mismo plan" : ""}
                </span>
              </button>
            ))}
          {!sinPlanPedido && lista.length > 0 && !tiene && <p className="px-2 py-1 border-t border-[#E3E9F0] text-[#8a6100]">Ninguna es del mismo plan que la publicación de la pregunta: van las demás.</p>}
        </div>
      )}
    </div>
  );
}
