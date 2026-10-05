"use client";

// El borrador de la publicación nueva: todos los datos de la publicación
// elegida, para cambiarlos antes de prepararla. Es un documento que se está
// escribiendo (AGENTS.md): se edita de entrada y su acción final ("Preparar
// publicación") va arriba a la derecha, con form="publicar". Si ML lo rechaza,
// el error aparece arriba y lo escrito queda como estaba.

import { useActionState, useState, startTransition } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { SUAVE } from "@/app/botones";
import { formatearNumero } from "@/lib/numeros";
import { accionPrepararPublicacion, type ResultadoPreparar } from "./acciones";
import type { Borrador as DatosBorrador } from "@/lib/mercadolibre/publicar-similar";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";
const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-3";
const TITULO_CAJA = "text-sm font-bold text-[#16577F] mb-2";
const LARGO_TITULO = 60;
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$ ${formatearNumero(n, "pesos")}`);

export default function Borrador({ productoId, b, tipos, condiciones }: {
  productoId: number; b: DatosBorrador; tipos: Record<string, string>; condiciones: Record<string, string>;
}) {
  const [estado, accion, pendiente] = useActionState<ResultadoPreparar, FormData>(accionPrepararPublicacion, null);
  const [canal, setCanal] = useState<number | null>(b.cuenta);
  const [variacion, setVariacion] = useState(b.variacion);
  const [titulo, setTitulo] = useState(b.titulo);
  const [precio, setPrecio] = useState<{ valor: number | null; vuelta: number }>({ valor: b.precio, vuelta: 0 });
  const [fotos, setFotos] = useState(b.fotos.map((f) => ({ ...f, usar: !f.deLaucen })));

  const cuenta = b.cuentas.find((c) => c.canal === canal) ?? null;
  const precioLaucen = cuenta?.precios[variacion] ?? null;
  const mover = (i: number, d: -1 | 1) => setFotos((fs) => {
    const j = i + d;
    if (j < 0 || j >= fs.length) return fs;
    const n = [...fs];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  return (
    <form id="publicar" className="space-y-3"
      // Se manda a mano (no con action=) para que React no vacíe el formulario si ML lo rechaza.
      onSubmit={(e) => {
        e.preventDefault();
        if (pendiente) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => accion(fd));
      }}>
      <input type="hidden" name="producto" value={productoId} />
      <input type="hidden" name="item" value={b.origen.item_id} />

      {pendiente && <div className="text-xs rounded-lg px-3 py-2 bg-[#EEF3F8] text-[#16577F]">Comprobando con Mercado Libre (no se publica nada)…</div>}
      {estado?.error && <div className="text-xs rounded-lg px-3 py-2 bg-[#FBEAE7] text-[#C03420] whitespace-pre-wrap">{estado.error}</div>}

      <section className={CAJA}>
        <h2 className={TITULO_CAJA}>Dónde y qué</h2>
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
              <div className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-[#F7F9FB] font-mono">{b.variaciones[0]?.sku}</div>
            </div>
          )}
          <div>
            <span className={ETIQUETA}>Categoría de Mercado Libre (la de la publicación elegida)</span>
            <div className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-[#F7F9FB] font-mono">{b.categoria}</div>
          </div>
        </div>
      </section>

      <section className={CAJA}>
        <h2 className={TITULO_CAJA}>Título, precio y stock</h2>
        <label className="block">
          <span className={ETIQUETA}>Título <span className={titulo.trim().length > LARGO_TITULO ? "text-[#C03420]" : ""}>({titulo.trim().length} de {LARGO_TITULO} letras)</span></span>
          <input name="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${CAMPO} w-full`} />
        </label>
        <div className="grid sm:grid-cols-4 gap-3 mt-3 items-start">
          <label>
            <span className={ETIQUETA}>Precio ($)</span>
            <CampoNumero key={precio.vuelta} name="precio" valor={precio.valor} tipo="pesos" className={`${CAMPO} w-full`} />
            <span className="block mt-1 text-[11px] text-[#5C6B76]">
              Clásica de Laucen en esta cuenta: {pesos(precioLaucen)}
              {precioLaucen != null && (
                <button type="button" className="ml-1 underline text-[#16577F]" onClick={() => setPrecio((p) => ({ valor: precioLaucen, vuelta: p.vuelta + 1 }))}>usar</button>
              )}
              <br />Precio de la publicación elegida: {pesos(b.origen.precio)}
            </span>
          </label>
          <label>
            <span className={ETIQUETA}>Cantidad</span>
            <CampoNumero name="cantidad" valor={b.cantidad} tipo="entero" className={`${CAMPO} w-full`} />
            <span className="block mt-1 text-[11px] text-[#5C6B76]">Lo disponible del producto en Laucen.</span>
          </label>
          <label>
            <span className={ETIQUETA}>Tipo de publicación</span>
            <select name="tipo" defaultValue={b.tipo in tipos ? b.tipo : "gold_special"} className={`${CAMPO} w-full`}>
              {Object.entries(tipos).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className={ETIQUETA}>Condición</span>
            <select name="condicion" defaultValue={b.condicion in condiciones ? b.condicion : "new"} className={`${CAMPO} w-full`}>
              {Object.entries(condiciones).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className={CAJA}>
        <h2 className={TITULO_CAJA}>Fotos ({fotos.filter((f) => f.usar).length} de {fotos.length})</h2>
        <p className="text-[11px] text-[#5C6B76] mb-2">La primera tildada es la principal. Las fotos del producto en Laucen que no están en la publicación aparecen al final, sin tildar.</p>
        <div className="flex flex-wrap gap-3">
          {fotos.map((f, i) => (
            <div key={f.url} className={`w-28 border rounded-lg p-1.5 ${f.usar ? "border-[#16577F]" : "border-[#E3E9F0] opacity-60"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" className="w-full h-24 object-contain bg-white" />
              <label className="flex items-center gap-1 text-[11px] mt-1">
                <input type="checkbox" checked={f.usar} onChange={(e) => setFotos((fs) => fs.map((x, k) => (k === i ? { ...x, usar: e.target.checked } : x)))} />
                Usar{f.deLaucen ? " (de Laucen)" : ""}
              </label>
              <div className="flex justify-between mt-1">
                <button type="button" className={`${SUAVE} !px-2 !py-0.5`} onClick={() => mover(i, -1)} disabled={i === 0} title="Más adelante">◀</button>
                <button type="button" className={`${SUAVE} !px-2 !py-0.5`} onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} title="Más atrás">▶</button>
              </div>
              {f.usar && <input type="hidden" name="foto" value={f.url} />}
            </div>
          ))}
        </div>
      </section>

      <section className={CAJA}>
        <h2 className={TITULO_CAJA}>Características ({b.atributos.length})</h2>
        <p className="text-[11px] text-[#5C6B76] mb-2">Las de la publicación elegida. Lo que borres no se manda.</p>
        <Datos prefijo="attr:" lista={b.atributos} />
      </section>

      <section className={CAJA}>
        <h2 className={TITULO_CAJA}>Garantía y facturación ({b.garantia.length})</h2>
        <Datos prefijo="term:" lista={b.garantia} />
      </section>

      <section className={CAJA}>
        <h2 className={TITULO_CAJA}>Descripción</h2>
        {!b.descripcionLeida && <p className="text-[11px] text-[#8a6100] mb-1">No se pudo leer la descripción de Mercado Libre (la cuenta de la publicación elegida no está conectada o ML no contestó): escribila acá o dejala vacía.</p>}
        <textarea name="descripcion" defaultValue={b.descripcion} rows={12} className={`${CAMPO} w-full leading-relaxed`} />
      </section>
    </form>
  );
}

function Datos({ prefijo, lista }: { prefijo: string; lista: { id: string; nombre: string; valor: string }[] }) {
  if (!lista.length) return <p className="text-xs text-[#5C6B76]">La publicación elegida no tiene.</p>;
  return (
    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
      {lista.map((a) => (
        <label key={a.id} className="flex items-center gap-2">
          <span className="w-44 shrink-0 text-[11px] text-[#5C6B76]" title={a.id}>{a.nombre}</span>
          <input name={`${prefijo}${a.id}`} defaultValue={a.valor} className={`${CAMPO} flex-1`} />
        </label>
      ))}
    </div>
  );
}
