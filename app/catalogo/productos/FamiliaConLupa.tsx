"use client";

// La familia con su lupa (pedido de Fer, 10/10): el buscador de familias de
// siempre y, al lado, 🔍. La lupa le pregunta a Mercado Libre qué categoría
// sugiere para el título que está escrito en el formulario, y en un globo
// dice si coincide con la familia elegida; «Usar ésta» la pone (si la familia
// todavía no existe en el árbol, se crea con su camino).

import { useRef, useState } from "react";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import { accionSugerirCategoria, accionUsarCategoria, type RespuestaSugerencia } from "./acciones-categoria";

const AYUDA = "Comparar con Mercado Libre: con el título escrito, consulta qué categoría sugiere Mercado Libre y te dice si coincide con la familia elegida. Sirve para encontrar la categoría correcta.";

export default function FamiliaConLupa({ name, valor, etiqueta }: { name: string; valor: number | null; etiqueta: string | null }) {
  // Lo que se le pasa al buscador cambia sólo con «Usar ésta» (así muestra el camino nuevo); lo que elige
  // la persona en el buscador se sigue aparte, para comparar.
  const [puesta, setPuesta] = useState<{ id: number | null; camino: string | null }>({ id: valor, camino: etiqueta });
  const [actualId, setActualId] = useState<number | null>(valor);
  // Al usar una sugerencia el buscador se arma de nuevo (aunque sea la misma que tenía al abrir).
  const [vuelta, setVuelta] = useState(0);
  const [globo, setGlobo] = useState<RespuestaSugerencia | "buscando" | null>(null);
  const [usando, setUsando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const consultar = async () => {
    const form = caja.current?.closest("form");
    const titulo = (form?.elements.namedItem("titulo") as HTMLInputElement | null)?.value ?? "";
    setGlobo("buscando"); setError(null);
    setGlobo(await accionSugerirCategoria(titulo, actualId).catch(() => ({ error: "No se pudo consultar: probá de nuevo." })));
  };

  const usar = async (categoria: string) => {
    setUsando(categoria); setError(null);
    const r = await accionUsarCategoria(categoria).catch(() => ({ error: "No se pudo: probá de nuevo." }));
    setUsando(null);
    if ("error" in r) { setError(r.error); return; }
    setPuesta({ id: r.id, camino: r.camino }); setActualId(r.id); setVuelta((n) => n + 1);
    setGlobo(null);
  };

  const datos = globo && globo !== "buscando" && !("error" in globo) ? globo : null;
  const primera = datos?.sugerencias[0];

  return (
    <div ref={caja} className="relative">
      <div className="flex items-center gap-1">
        <ElegirFamilia key={vuelta} name={name} valor={puesta.id} etiqueta={puesta.camino} className="flex-1 min-w-0"
          alCambiar={(id) => { setActualId(id); setGlobo(null); }} />
        <button type="button" onClick={consultar} title={AYUDA} aria-label={AYUDA}
          className="shrink-0 h-[30px] w-8 rounded-lg border border-[#E3E9F0] bg-[#EEF3F8] text-sm leading-none hover:bg-[#E3EBF3]">🔍</button>
      </div>
      {globo && (
        <div role="dialog" className="absolute right-0 z-50 mt-1 w-80 max-w-[90vw] rounded-xl border border-[#C9D3DD] bg-white p-3 text-xs shadow-lg">
          <div className="flex items-start justify-between gap-2 mb-1">
            <b>Categoría según Mercado Libre</b>
            <button type="button" onClick={() => setGlobo(null)} aria-label="Cerrar" className="leading-none opacity-60 hover:opacity-100">×</button>
          </div>
          {globo === "buscando" && <p className="text-[#5C6B76]">Consultando a Mercado Libre…</p>}
          {globo !== "buscando" && "error" in globo && <p className="text-[#C03420]">{globo.error}</p>}
          {datos && !primera && <p className="text-[#5C6B76]">Mercado Libre no sugiere ninguna categoría para este título: probá con un título más descriptivo.</p>}
          {datos && primera && (
            <>
              {!datos.actual ? (
                <p className="mb-2 text-[#8a6100]">{actualId ? "La familia elegida no es una categoría de Mercado Libre." : "Todavía no tiene familia."}</p>
              ) : datos.actual === primera.categoria ? (
                <p className="mb-2 text-[#1F6E4A] font-semibold">✓ Coincide con la que sugiere Mercado Libre.</p>
              ) : datos.sugerencias.some((x) => x.categoria === datos.actual) ? (
                <p className="mb-2 text-[#8a6100]">La familia elegida está entre las sugeridas, pero no es la primera.</p>
              ) : (
                <p className="mb-2 text-[#C03420]">⚠ No coincide: Mercado Libre la ubica en otra categoría.</p>
              )}
              <ul className="grid gap-1.5">
                {datos.sugerencias.map((x, i) => (
                  <li key={x.categoria} className={`rounded-lg border px-2 py-1.5 ${x.categoria === datos.actual ? "border-[#BFE3CC] bg-[#EEF7F1]" : "border-[#E3E9F0]"}`}>
                    <span className="block text-[10px] text-[#5C6B76]">{i === 0 ? "La más probable" : "Otra posible"} · {x.categoria}</span>
                    <span className="block">{x.camino}</span>
                    {x.categoria !== datos.actual && (
                      <button type="button" onClick={() => usar(x.categoria)} disabled={!!usando}
                        className="mt-1 text-xs font-bold rounded-lg px-2 py-1 bg-[#16577F] text-white">
                        {usando === x.categoria ? "Trabajando…" : "Usar ésta"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-[#5C6B76]">Se graba con el resto de la ficha.</p>
            </>
          )}
          {error && <p className="mt-1 text-[#C03420]">{error}</p>}
        </div>
      )}
    </div>
  );
}
