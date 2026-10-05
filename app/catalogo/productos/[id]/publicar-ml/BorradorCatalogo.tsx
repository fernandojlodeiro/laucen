"use client";

// Publicar en el catálogo de ML: el producto de catálogo pone título, fotos y
// características (se muestran, no se cambian); acá se eligen la cuenta, el
// precio, la cantidad, el tipo y la garantía. Con la marca de otro no se puede
// (la acción también lo frena). Como el borrador de la copia, se manda a mano
// para no perder lo escrito si ML lo rechaza.

import { useActionState, useState, startTransition } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { formatearNumero } from "@/lib/numeros";
import { accionPrepararCatalogo, type ResultadoPreparar } from "./acciones";
import type { BorradorCatalogo as Datos } from "@/lib/mercadolibre/catalogo-similar";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const VISTA = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-[#F7F9FB]";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";
const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-3";
const TITULO_CAJA = "text-sm font-bold text-[#16577F] mb-2";
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$ ${formatearNumero(n, "pesos")}`);

export default function BorradorCatalogo({ productoId, b, tipos, garantias, textoMarca }: {
  productoId: number; b: Datos; tipos: Record<string, string>; garantias: Record<string, string>; textoMarca: string;
}) {
  const [estado, accion, pendiente] = useActionState<ResultadoPreparar, FormData>(accionPrepararCatalogo, null);
  const [canal, setCanal] = useState<number | null>(b.cuenta);
  const [variacion, setVariacion] = useState(b.variacion);
  const [precio, setPrecio] = useState<{ valor: number | null; vuelta: number }>({ valor: b.precio, vuelta: 0 });
  const [garantia, setGarantia] = useState("");
  const cuenta = b.cuentas.find((c) => c.canal === canal) ?? null;
  const precioLaucen = cuenta?.precios[variacion] ?? null;
  const p = b.producto;
  const ajena = p.estadoMarca === "ajena";

  return (
    <form id="publicar" className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (pendiente || ajena) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => accion(fd));
      }}>
      <input type="hidden" name="producto" value={productoId} />
      <input type="hidden" name="catalogo" value={p.id} />

      {pendiente && <div className="text-xs rounded-lg px-3 py-2 bg-[#EEF3F8] text-[#16577F]">Comprobando con Mercado Libre (no se publica nada)…</div>}
      {estado?.error && <div className="text-xs rounded-lg px-3 py-2 bg-[#FBEAE7] text-[#C03420] whitespace-pre-wrap">{estado.error}</div>}

      <section className={CAJA}>
        <h2 className={TITULO_CAJA}>El producto de catálogo</h2>
        <div className="flex flex-wrap gap-3">
          {p.fotos.slice(0, 6).map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" className="w-24 h-24 object-contain bg-white border border-[#E3E9F0] rounded-lg" />
          ))}
        </div>
        <div className="grid sm:grid-cols-4 gap-3 mt-3">
          <div className="sm:col-span-2"><span className={ETIQUETA}>Título (lo pone Mercado Libre)</span><div className={VISTA}>{p.nombre}</div></div>
          <div>
            <span className={ETIQUETA}>Marca</span>
            <div className={`${VISTA} ${ajena ? "!bg-[#FBEAE7] text-[#C03420] font-semibold" : ""}`}>{p.marca ?? "—"} · {textoMarca}</div>
          </div>
          <div><span className={ETIQUETA}>Modelo</span><div className={VISTA}>{p.modelo ?? "—"}</div></div>
          <div><span className={ETIQUETA}>Precio que gana hoy</span><div className={`${VISTA} text-right tabular-nums`}>{pesos(p.precioGanador)}</div></div>
          <div><span className={ETIQUETA}>Vendedores</span><div className={`${VISTA} text-right tabular-nums`}>{p.vendedores ?? "—"}</div></div>
          <div><span className={ETIQUETA}>Categoría</span><div className={`${VISTA} font-mono`}>{p.categoria ?? "—"}</div></div>
        </div>
        {ajena && (
          <p className="mt-3 text-xs rounded-lg px-3 py-2 bg-[#FBEAE7] text-[#C03420]">
            Este producto de catálogo es de la marca <b>{p.marca}</b>, que no es nuestra: publicar ahí trae denuncias, así que no se puede. Elegí otro.
          </p>
        )}
        <details className="mt-3">
          <summary className="text-xs text-[#16577F] cursor-pointer">Características ({p.todas.length})</summary>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
            {p.todas.map((a, i) => (
              <div key={i} className="flex gap-2 text-xs"><span className="w-44 shrink-0 text-[#5C6B76]">{a.nombre}</span><span>{a.valor}</span></div>
            ))}
          </div>
        </details>
      </section>

      {!ajena && (
        <section className={CAJA}>
          <h2 className={TITULO_CAJA}>Tu publicación</h2>
          <div className="grid sm:grid-cols-3 gap-3 items-start">
            <label>
              <span className={ETIQUETA}>Cuenta donde se publica</span>
              <select name="canal" className={`${CAMPO} w-full`} value={canal ?? ""} onChange={(e) => setCanal(Number(e.target.value) || null)}>
                {b.cuentas.map((c) => <option key={c.canal} value={c.canal}>{c.nombre}{c.yaTiene ? " (ya lo tiene)" : ""}</option>)}
              </select>
              {cuenta?.yaTiene && <span className="block mt-1 text-[11px] text-[#C03420]">Esta cuenta ya tiene el producto: {cuenta.yaTiene}. Reactivá esa en vez de crear otra.</span>}
            </label>
            {b.variaciones.length > 1 ? (
              <label>
                <span className={ETIQUETA}>Variación de Laucen (su SKU va en la publicación)</span>
                <select name="variacion" className={`${CAMPO} w-full`} value={variacion} onChange={(e) => setVariacion(Number(e.target.value))}>
                  {b.variaciones.map((v) => <option key={v.id} value={v.id}>{v.sku}{v.titulo ? ` — ${v.titulo}` : ""}</option>)}
                </select>
              </label>
            ) : (
              <div>
                <span className={ETIQUETA}>SKU</span>
                <input type="hidden" name="variacion" value={variacion} />
                <div className={`${VISTA} font-mono`}>{b.variaciones[0]?.sku}</div>
              </div>
            )}
            <label>
              <span className={ETIQUETA}>Tipo de publicación</span>
              <select name="tipo" defaultValue="gold_special" className={`${CAMPO} w-full`}>
                {Object.entries(tipos).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
          </div>
          <div className="grid sm:grid-cols-4 gap-3 mt-3 items-start">
            <label>
              <span className={ETIQUETA}>Precio ($)</span>
              <CampoNumero key={precio.vuelta} name="precio" valor={precio.valor} tipo="pesos" className={`${CAMPO} w-full`} />
              <span className="block mt-1 text-[11px] text-[#5C6B76]">
                Clásica de Laucen en esta cuenta: {pesos(precioLaucen)}
                {precioLaucen != null && <button type="button" className="ml-1 underline text-[#16577F]" onClick={() => setPrecio((x) => ({ valor: precioLaucen, vuelta: x.vuelta + 1 }))}>usar</button>}
                <br />El que gana hoy: {pesos(p.precioGanador)}
                {p.precioGanador != null && <button type="button" className="ml-1 underline text-[#16577F]" onClick={() => setPrecio((x) => ({ valor: p.precioGanador, vuelta: x.vuelta + 1 }))}>usar</button>}
              </span>
            </label>
            <label>
              <span className={ETIQUETA}>Cantidad</span>
              <CampoNumero name="cantidad" valor={b.cantidad} tipo="entero" className={`${CAMPO} w-full`} />
              <span className="block mt-1 text-[11px] text-[#5C6B76]">Lo disponible del producto en Laucen.</span>
            </label>
            <label>
              <span className={ETIQUETA}>Garantía</span>
              <select name="garantia_tipo" value={garantia} onChange={(e) => setGarantia(e.target.value)} className={`${CAMPO} w-full`}>
                {Object.entries(garantias).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
            <label>
              <span className={ETIQUETA}>Tiempo de garantía</span>
              <input name="garantia_tiempo" placeholder="ej. 30 días" disabled={!garantia || garantia === "Sin garantía"} className={`${CAMPO} w-full disabled:bg-[#F7F9FB]`} />
            </label>
          </div>
        </section>
      )}
    </form>
  );
}
