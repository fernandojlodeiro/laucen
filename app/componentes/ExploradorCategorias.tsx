"use client";

// Explorador de categorías de Mercado Libre, para cualquier pantalla que
// tenga que elegir o ir a una categoría (Radar, piloto…):
// - navegar el árbol: migas arriba, hijas en una lista alta;
// - buscar mientras se escribe (desde 2 letras) DENTRO de la rama donde uno
//   está parado; en todo el árbol sólo si está en la raíz;
// - modo "elegir": botón Agregar y lista de elegidas (viaja en un campo oculto);
//   modo "ir": cada categoría es un link (irA + id).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { accionBuscarEnRama, accionRama, type CatLigera } from "@/app/categorias-actions";
import { BORRAR, SUAVE } from "@/app/botones";

const RAIZ = "MLA";
type Elegida = { id: string; ruta: string };

export default function ExploradorCategorias({ modo, irA, campo = "cats", inicio = RAIZ, iniciales = [], alto = "70vh", soloBuscador = false }: {
  modo: "elegir" | "ir";
  irA?: string;          // modo ir: link = irA + id (ej: "/radar?cat=")
  campo?: string;        // modo elegir: nombre del campo oculto (JSON con [{id, ruta}])
  inicio?: string;       // rama donde arranca
  iniciales?: Elegida[];
  alto?: string;         // alto de la lista
  soloBuscador?: boolean; // sólo el buscador (la pantalla ya muestra el árbol, como el Radar)
}) {
  const [actual, setActual] = useState(inicio);
  const [camino, setCamino] = useState<CatLigera[]>([]);
  const [hijas, setHijas] = useState<CatLigera[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<CatLigera[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [elegidas, setElegidas] = useState<Elegida[]>(iniciales);
  const pedido = useRef(0);
  // Vista previa: al pasar el mouse por una categoría, sus hijas a la derecha.
  const [previa, setPrevia] = useState<CatLigera | null>(null);
  const [hijasPrevia, setHijasPrevia] = useState<CatLigera[] | null>(null);
  const cache = useRef(new Map<string, CatLigera[]>());
  const pausa = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previaId = useRef<string | null>(null);

  function mirar(c: CatLigera) {
    if (pausa.current) clearTimeout(pausa.current);
    pausa.current = setTimeout(() => {
      setPrevia(c);
      previaId.current = c.id;
      const ya = cache.current.get(c.id);
      if (ya || c.esHoja) { setHijasPrevia(ya ?? []); return; }
      setHijasPrevia(null);
      accionRama(c.id).then((r) => {
        cache.current.set(c.id, r.hijas);
        if (previaId.current === c.id) setHijasPrevia(r.hijas);
      });
    }, 120);
  }

  // Al cambiar de rama: migas e hijas.
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    accionRama(actual).then((r) => {
      if (!vigente) return;
      setCamino(r.camino);
      setHijas(r.hijas);
      setError(r.error);
      setCargando(false);
    });
    return () => { vigente = false; };
  }, [actual]);

  // Búsqueda mientras se escribe, dentro de la rama actual (con una pausa
  // corta para no pedir en cada letra; sólo vale la última respuesta).
  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) { pedido.current++; setResultados(null); setBuscando(false); return; }
    const n = ++pedido.current;
    setBuscando(true);
    const espera = setTimeout(() => {
      accionBuscarEnRama(t, actual === RAIZ ? null : actual).then((r) => {
        if (n !== pedido.current) return;
        setResultados(r);
        setBuscando(false);
      });
    }, 250);
    return () => clearTimeout(espera);
  }, [texto, actual]);

  const aqui = camino.at(-1);
  const prefijo = aqui ? `${aqui.ruta} › ` : "";
  const relativa = (c: CatLigera) => (prefijo && c.ruta.startsWith(prefijo) ? c.ruta.slice(prefijo.length) : c.ruta);
  const entrar = (id: string) => { setActual(id); setTexto(""); setPrevia(null); previaId.current = null; };
  const lista = resultados ?? hijas;

  function Fila({ c, conRuta }: { c: CatLigera; conRuta: boolean }) {
    const ya = elegidas.some((e) => e.id === c.id);
    return (
      <li onMouseEnter={() => mirar(c)}
        className={`flex items-center gap-2 px-3 py-1.5 border-b last:border-0 border-[#E3E9F0] text-xs ${previa?.id === c.id ? "bg-[#F5F8FB]" : ""}`}>
        {modo === "ir" ? (
          <Link href={`${irA ?? ""}${c.id}`} className="flex-1 text-[#16577F] hover:underline">{conRuta ? relativa(c) : c.nombre}</Link>
        ) : !c.esHoja ? (
          <button type="button" onClick={() => entrar(c.id)} className="flex-1 text-left text-[#16577F] hover:underline">
            {conRuta ? relativa(c) : c.nombre} <span className="text-[#9AA7B3]">›</span>
          </button>
        ) : (
          <span className="flex-1">{conRuta ? relativa(c) : c.nombre}</span>
        )}
        <span className="text-[10px] text-[#9AA7B3] whitespace-nowrap">{c.publicaciones != null ? c.publicaciones.toLocaleString("es-AR") : ""}</span>
        {modo === "elegir" && (
          <button type="button" disabled={ya} onClick={() => setElegidas([...elegidas, { id: c.id, ruta: c.ruta }])} className={`${SUAVE} !py-1 disabled:opacity-40`}>
            {ya ? "Elegida" : "Agregar"}
          </button>
        )}
      </li>
    );
  }

  return (
    <div className="grid gap-2 text-xs">
      {modo === "elegir" && <input type="hidden" name={campo} value={JSON.stringify(elegidas)} />}

      {/* Migas: dónde estoy parado */}
      {!soloBuscador && <nav className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => entrar(RAIZ)} className={actual === RAIZ ? "font-bold" : "text-[#16577F] underline"}>Todo Mercado Libre</button>
        {camino.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="text-[#9AA7B3]">›</span>
            <button type="button" onClick={() => entrar(c.id)} className={c.id === actual ? "font-bold" : "text-[#16577F] underline"}>{c.nombre}</button>
          </span>
        ))}
        {modo === "elegir" && actual !== RAIZ && aqui && (
          <button type="button" disabled={elegidas.some((e) => e.id === aqui.id)}
            onClick={() => setElegidas([...elegidas, { id: aqui.id, ruta: aqui.ruta }])} className={`${SUAVE} !py-1 ml-2 disabled:opacity-40`}>
            Agregar “{aqui.nombre}”
          </button>
        )}
      </nav>}

      <input value={texto} onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        placeholder={actual === RAIZ ? "Buscar en todo el árbol (desde 2 letras)" : `Buscar dentro de “${aqui?.nombre ?? ""}” (desde 2 letras)`}
        className="border border-[#E3E9F0] rounded-lg px-3 py-2 text-sm" />

      {(!soloBuscador || resultados) && <div className="flex gap-3 items-start">
      <div className="border border-[#E3E9F0] rounded-lg bg-white overflow-y-auto flex-1 min-w-0" style={{ maxHeight: alto, minHeight: "12rem" }}>
        <p className="px-3 py-1.5 text-[11px] font-bold text-[#5C6B76] border-b border-[#E3E9F0] sticky top-0 bg-white">
          {resultados
            ? `${buscando ? "Buscando… " : ""}${resultados.length}${resultados.length === 200 ? "+" : ""} con “${texto.trim()}”${actual === RAIZ ? " en todo el árbol" : ` dentro de ${aqui?.nombre ?? ""}`}`
            : cargando ? "Cargando…" : `SUBCATEGORÍAS (${hijas.length})`}
        </p>
        {error && <p className="px-3 py-2 text-[#C03420]">{error}</p>}
        {!cargando && !error && lista.length === 0 && (
          <p className="px-3 py-2 text-[#9AA7B3]">{resultados ? "Nada con ese texto en esta rama." : "No tiene subcategorías."}</p>
        )}
        <ul>{lista.map((c) => <Fila key={c.id} c={c} conRuta={!!resultados} />)}</ul>
      </div>
      {/* Lo que hay adentro de la categoría que tiene el mouse encima. */}
      <aside className="hidden md:block flex-1 min-w-0 border border-[#E3E9F0] rounded-lg bg-[#FBFCFD] overflow-y-auto sticky top-2" style={{ maxHeight: alto, minHeight: "12rem" }}>
        {!previa ? (
          <p className="px-3 py-2 text-[#9AA7B3]">Pasá el mouse por una categoría para ver lo que tiene adentro.</p>
        ) : (
          <>
            <p className="px-3 py-1.5 text-[11px] font-bold text-[#5C6B76] border-b border-[#E3E9F0] sticky top-0 bg-[#FBFCFD]">
              DENTRO DE “{previa.nombre.toUpperCase()}”{hijasPrevia ? ` (${hijasPrevia.length})` : ""}
            </p>
            {hijasPrevia === null && <p className="px-3 py-2 text-[#9AA7B3]">Cargando…</p>}
            {hijasPrevia?.length === 0 && <p className="px-3 py-2 text-[#9AA7B3]">No tiene subcategorías: es la última.</p>}
            <ul>
              {hijasPrevia?.map((h) => (
                <li key={h.id} className="flex items-center gap-2 px-3 py-1 border-b last:border-0 border-[#E3E9F0]">
                  {modo === "ir" ? (
                    <Link href={`${irA ?? ""}${h.id}`} className="flex-1 text-[#16577F] hover:underline">{h.nombre}</Link>
                  ) : (
                    <button type="button" onClick={() => entrar(h.esHoja ? previa.id : h.id)} className="flex-1 text-left text-[#16577F] hover:underline">
                      {h.nombre}{!h.esHoja && <span className="text-[#9AA7B3]"> ›</span>}
                    </button>
                  )}
                  <span className="text-[10px] text-[#9AA7B3] whitespace-nowrap">{h.publicaciones != null ? h.publicaciones.toLocaleString("es-AR") : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      </div>}

      {modo === "elegir" && (
        <div>
          <p className="mb-1 font-bold">Categorías elegidas ({elegidas.length})</p>
          {elegidas.length === 0 && <p className="text-[#9AA7B3]">Ninguna todavía.</p>}
          <ul className="grid gap-1">
            {elegidas.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="flex-1">{c.ruta}</span>
                <button type="button" onClick={() => setElegidas(elegidas.filter((e) => e.id !== c.id))} className={`${BORRAR} !py-1`} aria-label="Quitar">✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
