"use client";

// Explorador de categorías de Mercado Libre, para cualquier pantalla que
// tenga que elegir o ir a una categoría (Radar, piloto…):
// - baja el árbol entero una sola vez (unos 12 mil nombres) y después
//   navegar, ver lo de adentro y buscar es instantáneo;
// - navegar: migas arriba, hijas en una lista alta; al pasar el mouse por una
//   categoría, a la derecha aparece lo que tiene adentro;
// - buscar mientras se escribe (desde 2 letras) DENTRO de la rama donde uno
//   está parado; en todo el árbol sólo si está en la raíz;
// - modo "elegir": botón + y lista de elegidas (viaja en un campo oculto);
//   modo "ir": cada categoría es un link (irA + id).

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { accionArbol, type Fila } from "@/app/categorias-actions";
import { BORRAR, SUAVE } from "@/app/botones";

const RAIZ = "MLA";
type Elegida = { id: string; ruta: string };
type Nodo = { id: string; nombre: string; padre: string | null; nivel: number; publicaciones: number | null; esHoja: boolean; ruta: string; clave: string };
type Arbol = { porId: Map<string, Nodo>; hijos: Map<string, Nodo[]>; todos: Nodo[] };

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function armar(filas: Fila[]): Arbol {
  const porId = new Map<string, Nodo>();
  for (const [id, nombre, padre, nivel, publicaciones, esHoja] of filas) {
    porId.set(id, { id, nombre, padre, nivel, publicaciones, esHoja, ruta: "", clave: normal(nombre) });
  }
  const rutaDe = (n: Nodo): string => {
    if (n.ruta) return n.ruta;
    const p = n.padre ? porId.get(n.padre) : undefined;
    n.ruta = p ? `${rutaDe(p)} › ${n.nombre}` : n.nombre;
    return n.ruta;
  };
  const hijos = new Map<string, Nodo[]>();
  for (const n of porId.values()) {
    rutaDe(n);
    const k = n.padre ?? RAIZ;
    (hijos.get(k) ?? hijos.set(k, []).get(k)!).push(n);
  }
  for (const l of hijos.values()) l.sort((a, b) => (b.publicaciones ?? 0) - (a.publicaciones ?? 0) || a.nombre.localeCompare(b.nombre));
  return { porId, hijos, todos: [...porId.values()] };
}

// Una sola bajada por visita: si la pantalla vuelve a montar el explorador
// (por ejemplo al navegar en el Radar), usa el árbol ya bajado.
let arbolEnCamino: Promise<{ arbol: Arbol | null; error: string | null }> | null = null;
function bajarArbol() {
  arbolEnCamino ??= accionArbol().then((r) => ({ arbol: r.filas.length ? armar(r.filas) : null, error: r.error }))
    .catch(() => { arbolEnCamino = null; return { arbol: null, error: "No se pudo bajar el árbol de categorías." }; });
  return arbolEnCamino;
}

const MAS = "w-6 h-6 shrink-0 rounded-md border border-[#E3E9F0] bg-[#EEF3F8] text-[#16577F] text-sm font-bold leading-none disabled:bg-[#EEF7F1] disabled:text-[#1F6E4A]";

export default function ExploradorCategorias({ modo, irA, campo = "cats", inicio = RAIZ, iniciales = [], alto = "70vh", soloBuscador = false }: {
  modo: "elegir" | "ir";
  irA?: string;           // modo ir: link = irA + id (ej: "/radar?cat=")
  campo?: string;         // modo elegir: nombre del campo oculto (JSON con [{id, ruta}])
  inicio?: string;        // rama donde arranca
  iniciales?: Elegida[];
  alto?: string;          // alto de la lista
  soloBuscador?: boolean; // sólo el buscador (la pantalla ya muestra el árbol, como el Radar)
}) {
  const [arbol, setArbol] = useState<Arbol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actual, setActual] = useState(inicio);
  const [texto, setTexto] = useState("");
  const [elegidas, setElegidas] = useState<Elegida[]>(iniciales);
  const [previa, setPrevia] = useState<Nodo | null>(null);
  const pausa = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vigente = true;
    bajarArbol().then((r) => { if (vigente) { setArbol(r.arbol); setError(r.error); } });
    return () => { vigente = false; };
  }, []);

  const aqui = arbol?.porId.get(actual) ?? null;
  const camino = useMemo(() => {
    const c: Nodo[] = [];
    for (let n = aqui; n; n = n.padre ? arbol!.porId.get(n.padre) ?? null : null) c.unshift(n);
    return c;
  }, [aqui, arbol]);
  const hijas = arbol?.hijos.get(actual) ?? [];

  // Búsqueda dentro de la rama actual: por nombre, sin importar acentos.
  const t = normal(texto.trim());
  const resultados = useMemo(() => {
    if (!arbol || t.length < 2) return null;
    const prefijo = aqui ? `${aqui.ruta} › ` : "";
    return arbol.todos.filter((n) => n.clave.includes(t) && (!prefijo || n.ruta.startsWith(prefijo)))
      .sort((a, b) => a.nivel - b.nivel || (b.publicaciones ?? 0) - (a.publicaciones ?? 0)).slice(0, 300);
  }, [arbol, t, aqui]);

  const prefijo = aqui ? `${aqui.ruta} › ` : "";
  const relativa = (n: Nodo) => (prefijo && n.ruta.startsWith(prefijo) ? n.ruta.slice(prefijo.length) : n.ruta);
  const entrar = (id: string) => { setActual(id); setTexto(""); setPrevia(null); };
  const agregar = (n: Nodo) => setElegidas((e) => (e.some((x) => x.id === n.id) ? e : [...e, { id: n.id, ruta: n.ruta }]));
  // El + agrega y, si ya estaba, el ✓ la saca (por si se tocó el renglón equivocado).
  const alternar = (n: Nodo) => setElegidas((e) => (e.some((x) => x.id === n.id) ? e.filter((x) => x.id !== n.id) : [...e, { id: n.id, ruta: n.ruta }]));
  const elegida = (id: string) => elegidas.some((e) => e.id === id);
  const mirar = (n: Nodo) => {
    if (pausa.current) clearTimeout(pausa.current);
    pausa.current = setTimeout(() => setPrevia(n), 60);
  };
  const lista = resultados ?? hijas;
  const hijasPrevia = previa ? arbol?.hijos.get(previa.id) ?? [] : [];
  const cantidad = (n: Nodo) => <span className="text-[10px] text-[#9AA7B3] whitespace-nowrap">{n.publicaciones != null ? n.publicaciones.toLocaleString("es-AR") : ""}</span>;
  const botonMas = (n: Nodo) => modo === "elegir" && (
    <button type="button" onClick={() => alternar(n)} className={`${MAS} ${elegida(n.id) ? "!bg-[#EEF7F1] !text-[#1F6E4A]" : ""}`}
      aria-label={elegida(n.id) ? `Quitar ${n.nombre}` : `Agregar ${n.nombre}`} title={elegida(n.id) ? "Quitar" : "Agregar"}>
      {elegida(n.id) ? "✓" : "+"}
    </button>
  );
  const nombre = (n: Nodo, texto: string) => modo === "ir" ? (
    <Link href={`${irA ?? ""}${n.id}`} className="flex-1 min-w-0 text-[#16577F] hover:underline">{texto}</Link>
  ) : !n.esHoja ? (
    <button type="button" onClick={() => entrar(n.id)} className="flex-1 min-w-0 text-left text-[#16577F] hover:underline">
      {texto} <span className="text-[#9AA7B3]">›</span>
    </button>
  ) : (
    <span className="flex-1 min-w-0">{texto}</span>
  );

  if (!arbol) {
    return (
      <p className={`text-xs rounded-lg px-3 py-2 ${error ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF3F8] text-[#16577F]"}`}>
        {error ?? "Cargando el árbol de categorías (unos segundos, una sola vez)…"}
      </p>
    );
  }

  return (
    <div className="grid gap-2 text-xs">
      {modo === "elegir" && <input type="hidden" name={campo} value={JSON.stringify(elegidas)} />}

      {/* Migas: dónde estoy parado */}
      {!soloBuscador && (
        <nav className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => entrar(RAIZ)} className={actual === RAIZ ? "font-bold" : "text-[#16577F] underline"}>Todo Mercado Libre</button>
          {camino.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-[#9AA7B3]">›</span>
              <button type="button" onClick={() => entrar(c.id)} className={c.id === actual ? "font-bold" : "text-[#16577F] underline"}>{c.nombre}</button>
            </span>
          ))}
          {modo === "elegir" && aqui && (
            <button type="button" disabled={elegida(aqui.id)} onClick={() => agregar(aqui)} className={`${SUAVE} !py-1 ml-2 disabled:opacity-40`}>
              {elegida(aqui.id) ? `“${aqui.nombre}” elegida` : `Agregar “${aqui.nombre}”`}
            </button>
          )}
        </nav>
      )}

      <input value={texto} onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        placeholder={actual === RAIZ ? "Buscar en todo el árbol (desde 2 letras)" : `Buscar dentro de “${aqui?.nombre ?? ""}” (desde 2 letras)`}
        className="border border-[#E3E9F0] rounded-lg px-3 py-2 text-sm" />

      {(!soloBuscador || resultados) && (
        <div className="flex gap-3 items-start">
          <div className="border border-[#E3E9F0] rounded-lg bg-white overflow-y-auto flex-1 min-w-0" style={{ maxHeight: alto, minHeight: "12rem" }}>
            <p className="px-3 py-1.5 text-[11px] font-bold text-[#5C6B76] border-b border-[#E3E9F0] sticky top-0 bg-white">
              {resultados
                ? `${resultados.length}${resultados.length === 300 ? "+" : ""} con “${texto.trim()}”${actual === RAIZ ? " en todo el árbol" : ` dentro de ${aqui?.nombre ?? ""}`}`
                : `SUBCATEGORÍAS (${hijas.length})`}
            </p>
            {lista.length === 0 && (
              <p className="px-3 py-2 text-[#9AA7B3]">{resultados ? "Nada con ese texto en esta rama." : "No tiene subcategorías."}</p>
            )}
            <ul>
              {lista.map((n) => (
                <li key={n.id} onMouseEnter={() => mirar(n)}
                  className={`flex items-center gap-2 px-3 py-1 border-b last:border-0 border-[#E3E9F0] ${previa?.id === n.id ? "bg-[#F5F8FB]" : ""}`}>
                  {nombre(n, resultados ? relativa(n) : n.nombre)}
                  {cantidad(n)}
                  {botonMas(n)}
                </li>
              ))}
            </ul>
          </div>

          {/* Lo que hay adentro de la categoría que tiene el mouse encima. */}
          <aside className="hidden md:block flex-1 min-w-0 border border-[#E3E9F0] rounded-lg bg-[#FBFCFD] overflow-y-auto sticky top-2" style={{ maxHeight: alto, minHeight: "12rem" }}>
            {!previa ? (
              <p className="px-3 py-2 text-[#9AA7B3]">Pasá el mouse por una categoría para ver lo que tiene adentro.</p>
            ) : (
              <>
                <p className="px-3 py-1.5 text-[11px] font-bold text-[#5C6B76] border-b border-[#E3E9F0] sticky top-0 bg-[#FBFCFD]">
                  DENTRO DE “{previa.nombre.toUpperCase()}” ({hijasPrevia.length})
                </p>
                {hijasPrevia.length === 0 && <p className="px-3 py-2 text-[#9AA7B3]">No tiene subcategorías: es la última.</p>}
                <ul>
                  {hijasPrevia.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 px-3 py-1 border-b last:border-0 border-[#E3E9F0]">
                      {nombre(h, h.nombre)}
                      {cantidad(h)}
                      {botonMas(h)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      )}

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
