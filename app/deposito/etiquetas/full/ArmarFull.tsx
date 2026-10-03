"use client";

// Armar la tanda de etiquetas de Full: el buscador (al tipear, desde la
// segunda letra) muestra publicaciones de ML con su Código ML; "Agregar"
// la suma a la lista (si Laucen no tiene el código, se lo pide a ML). En la
// lista, cuántas etiquetas de cada una y el tacho para sacarla. Abajo, la
// impresora y "Imprimir", que abre el PDF en otra pestaña.

import { useRef, useState } from "react";
import { PRIMARIO, SUAVE, ICONO_BORRAR, BORRAR } from "@/app/botones";
import { IMPRESORAS_FULL, POR_HOJA_FULL, type PublicacionFull } from "@/lib/deposito/etiquetas-full-tipos";
import { accionBuscarFull, accionCodigoFull } from "./acciones";

// Los de app/componentes/erp.tsx (que es del servidor).
const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-3";
const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";

type Renglon = PublicacionFull & { cantidad: string };
const clave = (p: { item_id: string; variation_id: string }) => `${p.item_id}~${p.variation_id}`;

export default function ArmarFull({ canales, impresora }: { canales: { id: number; nombre: string }[]; impresora: "termica" | "a4" }) {
  const [canal, setCanal] = useState(canales[0].id);
  const [texto, setTexto] = useState("");
  const [comienza, setComienza] = useState(true);
  const [resultados, setResultados] = useState<PublicacionFull[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<Renglon[]>([]);
  const [agregando, setAgregando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [imp, setImp] = useState(impresora);
  const [desde, setDesde] = useState("1");
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turno = useRef(0);

  const buscar = (t: string, c = comienza, cn = canal) => {
    setTexto(t);
    if (espera.current) clearTimeout(espera.current);
    if (t.trim().length < 2) { setResultados([]); return; }
    espera.current = setTimeout(async () => {
      const mio = ++turno.current;
      setBuscando(true);
      const r = await accionBuscarFull(cn, t, c);
      if (mio !== turno.current) return;
      setBuscando(false);
      if (r.ok) { setResultados(r.filas); setError(null); } else setError(r.mensaje);
    }, 300);
  };

  async function agregar(p: PublicacionFull) {
    const k = clave(p);
    const ya = lista.find((x) => clave(x) === k);
    if (ya) { setLista(lista.map((x) => (clave(x) === k ? { ...x, cantidad: String((Number(x.cantidad) || 0) + 1) } : x))); return; }
    setAgregando(k);
    const r = p.codigo ? { ok: true as const, fila: p } : await accionCodigoFull(canal, p.item_id, p.variation_id);
    setAgregando(null);
    setLista((l) => [...l, { ...(r.ok ? r.fila : p), cantidad: "1" }]);
    if (!r.ok) setError(r.mensaje);
  }

  const imprimibles = lista.filter((x) => x.codigo && Number(x.cantidad) > 0);
  const total = imprimibles.reduce((a, x) => a + Number(x.cantidad), 0);
  const url = () => {
    const q = new URLSearchParams({ canal: String(canal), imp });
    for (const x of imprimibles) q.append("e", `${x.item_id}~${x.variation_id}~${Number(x.cantidad)}`);
    if (imp === "a4") q.set("desde", String(Math.min(Math.max(Number(desde) || 1, 1), POR_HOJA_FULL)));
    return `/deposito/etiquetas/full/pdf?${q}`;
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-[#5C6B76]">
        La etiqueta que Mercado Libre pide en cada unidad (o pack) que se manda a Full. El código es el <b>Código ML</b> de la publicación: es siempre el mismo, no depende del envío.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {canales.length > 1 && (
          <select value={canal} onChange={(e) => { const c = Number(e.target.value); setCanal(c); setLista([]); buscar(texto, comienza, c); }}
            className={`${CAMPO} text-base py-2`} aria-label="Cuenta de Mercado Libre">
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        <span className="relative inline-flex flex-1 min-w-56">
          <input value={texto} onChange={(e) => buscar(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} autoFocus
            placeholder="SKU, título o Código ML" className="border border-[#E3E9F0] rounded-lg pl-2 pr-7 py-2 text-sm bg-white w-full" />
          {texto && <button type="button" onClick={() => buscar("")} aria-label="Borrar la búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>}
        </span>
        <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] whitespace-nowrap">
          <input type="checkbox" checked={comienza} onChange={(e) => { setComienza(e.target.checked); buscar(texto, e.target.checked); }} className="h-4 w-4 accent-[#16577F]" />
          Comienza por
        </label>
      </div>

      {error && <p role="alert" className="text-sm font-semibold rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">{error}</p>}
      {texto.trim().length >= 2 && !buscando && !resultados.length && !error && <p className="text-sm text-[#5C6B76]">No encontré publicaciones con eso.</p>}

      {resultados.length > 0 && (
        <ul className="bg-white border border-[#E3E9F0] rounded-xl divide-y divide-[#E3E9F0] max-h-80 overflow-y-auto">
          {resultados.map((p) => (
            <li key={clave(p)} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 min-w-0">
                <b className={p.codigo ? "" : "text-[#5C6B76]"}>{p.codigo ?? "sin Código ML guardado"}</b> <span className="text-xs">{p.titulo}</span>
                <span className="block text-[11px] text-[#5C6B76]">{[p.sku, p.item_id, p.atributos, p.logistica === "fulfillment" ? "en Full" : null].filter(Boolean).join(" · ")}</span>
              </span>
              <button type="button" onClick={() => agregar(p)} disabled={agregando === clave(p)} className={`${SUAVE} shrink-0 disabled:opacity-60`}>
                {agregando === clave(p) ? "Buscando el código…" : "Agregar"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="text-sm font-bold mb-2">Para imprimir ({lista.length})</h2>
        {!lista.length ? <p className="text-sm text-[#5C6B76]">Buscá una publicación y apretá "Agregar".</p> : (
          <ul className="bg-white border border-[#E3E9F0] rounded-xl divide-y divide-[#E3E9F0]">
            {lista.map((x) => (
              <li key={clave(x)} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0">
                  {x.codigo ? <b>{x.codigo}</b> : <b className="text-[#C03420]">Sin Código ML: no se imprime</b>} <span className="text-xs">{x.titulo}</span>
                  <span className="block text-[11px] text-[#5C6B76]">
                    {x.codigo ? [x.sku, x.item_id, x.atributos].filter(Boolean).join(" · ")
                      : `${x.item_id}: Mercado Libre no le dio código de Full (nunca estuvo en Full, o la cuenta está desconectada).`}
                  </span>
                </span>
                <label className="shrink-0 text-right">
                  <span className="block text-[10px] text-[#5C6B76]">Etiquetas</span>
                  <input value={x.cantidad} inputMode="numeric" disabled={!x.codigo}
                    onChange={(e) => setLista(lista.map((y) => (clave(y) === clave(x) ? { ...y, cantidad: e.target.value.replace(/\D/g, "").slice(0, 4) } : y)))}
                    className={`${CAMPO} w-16 text-base text-right tabular-nums disabled:opacity-50`} />
                </label>
                {borrando === clave(x) ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => { setLista(lista.filter((y) => clave(y) !== clave(x))); setBorrando(null); }} className={BORRAR}>Sí</button>
                    <button type="button" onClick={() => setBorrando(null)} className={SUAVE}>No</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setBorrando(clave(x))} className={`${ICONO_BORRAR} shrink-0`} aria-label="Sacar de la lista" title="Sacar de la lista">🗑</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={`${CAJA} space-y-3`}>
        <fieldset>
          <legend className={ETIQUETA}>Impresora</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {IMPRESORAS_FULL.map(([k, t, anda]) => (
              <label key={k} className={`flex items-center gap-2 rounded-xl border border-[#E3E9F0] bg-white px-3 py-2.5 text-sm has-[:checked]:border-[#16577F] has-[:checked]:bg-[#EEF3F8] ${anda ? "" : "opacity-50"}`}>
                <input type="radio" name="imp" value={k} checked={imp === k} disabled={!anda} onChange={() => anda && setImp(k as "termica" | "a4")} className="h-5 w-5 accent-[#16577F]" />{t}
              </label>
            ))}
          </div>
        </fieldset>
        {imp === "a4" && (
          <label className="flex items-center gap-2 text-sm">
            Empezar en la etiqueta N.º
            <input value={desde} inputMode="numeric" onChange={(e) => setDesde(e.target.value.replace(/\D/g, "").slice(0, 2))}
              className={`${CAMPO} w-14 text-base text-right tabular-nums`} />
            <span className="text-[11px] text-[#5C6B76]">de {POR_HOJA_FULL} (para usar una hoja empezada; se cuentan de izquierda a derecha)</span>
          </label>
        )}
        <p className="text-[11px] text-[#5C6B76]">
          {imp === "termica" ? "Una etiqueta de 50 × 25 mm por página: en el diálogo de impresión elegí la térmica, tamaño 50 × 25 mm, escala 100 % y sin márgenes."
            : `Hoja A4 con ${POR_HOJA_FULL} etiquetas de 50 × 25 mm (3 × 10) y una línea fina para cortar. Imprimí a escala 100 % ("tamaño real").`}
        </p>
      </div>

      {total > 0 ? (
        <a href={url()} target="_blank" rel="noreferrer" className={`${PRIMARIO} text-base px-4 py-3 block text-center`}>
          🖨 Imprimir {total} etiqueta{total === 1 ? "" : "s"}
        </a>
      ) : (
        <button type="button" disabled className={`${PRIMARIO} text-base px-4 py-3 w-full opacity-50 cursor-not-allowed`}>🖨 Imprimir</button>
      )}
    </div>
  );
}
