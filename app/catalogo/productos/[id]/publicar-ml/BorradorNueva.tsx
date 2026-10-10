"use client";

// Publicación nueva desde los datos de Laucen, en una o varias cuentas de ML de
// una vez (Fer, 5/10). Lo común (categoría, variación, tipo, cantidad, condición,
// garantía, características, descripción) es igual en todas; cada cuenta tiene su
// tarjeta con su título (la IA propone uno distinto por cuenta), su precio y el
// orden de sus fotos. Se manda a mano (no con action=) para no perder lo escrito
// si ML lo rechaza.

import { useActionState, useState, startTransition } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { SUAVE } from "@/app/botones";
import { usarCambiarParametro } from "@/app/componentes/BuscadorVivo";
import { formatearNumero } from "@/lib/numeros";
import { accionPrepararNueva, type ResultadoPreparar } from "./acciones";
import type { BorradorNueva as Datos, AtributoForm, CuentaNueva } from "@/lib/mercadolibre/publicar-nueva";

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const VISTA = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-[#F7F9FB]";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";
const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-3";
const TITULO_CAJA = "text-sm font-bold text-[#16577F] mb-2";
const LARGO_TITULO = 60;
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$ ${formatearNumero(n, "pesos")}`);

function Origen({ o }: { o: AtributoForm["origen"] | "ia" }) {
  if (o === "ia") return <span className="ml-1 rounded px-1 text-[10px] font-bold bg-[#FFF3D6] text-[#8a6100]" title="Lo propuso la IA: revisalo">IA</span>;
  if (o === "laucen") return <span className="ml-1 rounded px-1 text-[10px] font-bold bg-[#EEF3F8] text-[#16577F]" title="Sale de los datos del producto en Laucen">Laucen</span>;
  return null;
}

export default function BorradorNueva({ productoId, b, tipos, condiciones, garantias }: {
  productoId: number; b: Datos; tipos: Record<string, string>; condiciones: Record<string, string>; garantias: Record<string, string>;
}) {
  const [estado, accion, pendiente] = useActionState<ResultadoPreparar, FormData>(accionPrepararNueva, null);
  const cambiar = usarCambiarParametro();
  const [variacion, setVariacion] = useState(b.variacion);
  const [garantia, setGarantia] = useState(b.garantia);
  const [elegidas, setElegidas] = useState<Record<number, boolean>>(Object.fromEntries(b.cuentas.map((c) => [c.canal, c.elegida])));
  const principales = b.atributos.filter((a) => a.requerido || a.valor);
  const otros = b.atributos.filter((a) => !a.requerido && !a.valor);
  const cuantas = b.cuentas.filter((c) => elegidas[c.canal]).length;

  return (
    <form id="publicar" className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (pendiente || !b.categoria) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => accion(fd));
      }}>
      <input type="hidden" name="producto" value={productoId} />
      <input type="hidden" name="categoria" value={b.categoria?.id ?? ""} />

      {pendiente && <div className="text-xs rounded-lg px-3 py-2 bg-[#EEF3F8] text-[#16577F]">Comprobando con Mercado Libre cada cuenta (no se publica nada)…</div>}
      {estado?.error && <div className="text-xs rounded-lg px-3 py-2 bg-[#FBEAE7] text-[#C03420] whitespace-pre-wrap">{estado.error}</div>}
      {!b.conIa && b.categoria && <div className="text-xs rounded-lg px-3 py-2 bg-[#FFF8E5] text-[#8a6100]">La IA no contestó: no hay propuestas, completá a mano lo que falta (o volvé a entrar en un rato).</div>}

      <section className={CAJA}>
        <h2 className={TITULO_CAJA}>Categoría de Mercado Libre</h2>
        <div className="grid sm:grid-cols-2 gap-3 items-start">
          <div>
            <span className={ETIQUETA}>La del producto</span>
            <div className={VISTA}>{b.categoria ? <>{b.categoria.camino} <span className="font-mono text-[#5C6B76]">({b.categoria.id})</span></> : "— (no se encontró una categoría que sirva)"}</div>
          </div>
          {b.sugeridas.length > 0 && (
            <label>
              <span className={ETIQUETA}>Cambiarla por una que sugiere Mercado Libre (cambia los atributos)</span>
              <select className={`${CAMPO} w-full`} defaultValue="" onChange={(e) => e.target.value && cambiar({ cat: e.target.value })}>
                <option value="">Elegí…</option>
                {b.sugeridas.map((s) => <option key={s.id} value={s.id}>{s.nombre} ({s.id})</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      {b.categoria && (<>
        <section className={CAJA}>
          <h2 className={TITULO_CAJA}>Lo que es igual en todas las cuentas</h2>
          <div className="grid sm:grid-cols-3 gap-3 items-start">
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
            <label>
              <span className={ETIQUETA}>Cantidad</span>
              <CampoNumero name="cantidad" valor={b.cantidad} tipo="entero" className={`${CAMPO} w-full`} />
              <span className="block mt-1 text-[11px] text-[#5C6B76]">Lo disponible en Laucen.</span>
            </label>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mt-3 items-start">
            <label>
              <span className={ETIQUETA}>Condición</span>
              <select name="condicion" defaultValue={b.condicion} className={`${CAMPO} w-full`}>
                {Object.entries(condiciones).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
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

        <section className={CAJA}>
          <h2 className={TITULO_CAJA}>Cuentas donde se publica ({cuantas} de {b.cuentas.length})</h2>
          <p className="text-[11px] text-[#5C6B76] mb-2">Tildá las cuentas. Cada una tiene su título (la IA propone uno distinto para cada una), su precio (la Clásica de Laucen de esa cuenta) y el orden de sus fotos: cada una arranca con otra foto principal. Se preparan todas juntas en un solo lote.</p>
          {!b.fotos.length && <p className="text-xs text-[#C03420] mb-2">El producto no tiene fotos en Laucen: subilas en la pestaña Fotos de su ficha.</p>}
          <div className="space-y-3">
            {b.cuentas.map((c) => (
              <TarjetaCuenta key={c.canal} c={c} variacion={variacion} elegida={!!elegidas[c.canal]} tituloIa={b.tituloIa}
                elegir={(v) => setElegidas((x) => ({ ...x, [c.canal]: v }))} />
            ))}
          </div>
        </section>

        <section className={CAJA}>
          <h2 className={TITULO_CAJA}>Características ({principales.length})</h2>
          <p className="text-[11px] text-[#5C6B76] mb-2">Las que pide Mercado Libre para esta categoría. <b>*</b> = obligatoria. <Origen o="laucen" /> sale del producto; <Origen o="ia" /> lo propuso la IA: revisalo. Lo que dejes vacío no se manda. La marca tiene que ser la del producto o Daitom (la que se pone si no tiene).</p>
          <Atributos lista={principales} />
          {otros.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-[#16577F] cursor-pointer">Más características que acepta la categoría ({otros.length})</summary>
              <div className="mt-2"><Atributos lista={otros} /></div>
            </details>
          )}
        </section>

        <section className={CAJA}>
          <h2 className={TITULO_CAJA}>Descripción {b.descripcionIa && <Origen o="ia" />}</h2>
          <textarea name="descripcion" defaultValue={b.descripcion} rows={12} className={`${CAMPO} w-full leading-relaxed`} />
          <p className="text-[11px] text-[#5C6B76] mt-1">Sólo la descripción técnica: a cada cuenta se le agrega arriba su encabezado y abajo su pie (Configuración › Canales, «Textos del canal»).</p>
        </section>
      </>)}
    </form>
  );
}

/** Una cuenta: tildarla, su título, su precio y su carrusel de fotos (orden y cuáles van). */
function TarjetaCuenta({ c, variacion, elegida, elegir, tituloIa }: { c: CuentaNueva; variacion: number; elegida: boolean; elegir: (v: boolean) => void; tituloIa: boolean }) {
  const [titulo, setTitulo] = useState(c.titulo);
  const precioLaucen = c.precios[variacion] ?? null;
  const [precio, setPrecio] = useState<{ valor: number | null; vuelta: number }>({ valor: precioLaucen, vuelta: 0 });
  const [fotos, setFotos] = useState(c.fotos.map((url) => ({ url, usar: true })));
  const mover = (i: number, d: -1 | 1) => setFotos((fs) => {
    const j = i + d;
    if (j < 0 || j >= fs.length) return fs;
    const n = [...fs];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const largo = titulo.trim().length;
  return (
    <div className={`border rounded-xl p-3 ${elegida ? "border-[#16577F] bg-white" : "border-[#E3E9F0] bg-[#FAFBFC]"}`}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="cuenta" value={c.canal} checked={elegida} onChange={(e) => elegir(e.target.checked)} />
        {c.nombre}
        {c.yaTiene && <span className="text-[11px] font-normal text-[#C03420]">ya tiene este producto: {c.yaTiene} (reactivá ésa)</span>}
      </label>
      {elegida && (
        <div className="mt-2 space-y-2">
          <div className="grid sm:grid-cols-4 gap-3 items-start">
            <label className="sm:col-span-3">
              <span className={ETIQUETA}>Título <span className={largo > LARGO_TITULO ? "text-[#C03420]" : ""}>({largo} de {LARGO_TITULO} letras)</span>{tituloIa && <Origen o="ia" />}</span>
              <input name={`titulo:${c.canal}`} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${CAMPO} w-full`} />
            </label>
            <label>
              <span className={ETIQUETA}>Precio ($)</span>
              <CampoNumero key={precio.vuelta} name={`precio:${c.canal}`} valor={precio.valor} tipo="pesos" className={`${CAMPO} w-full`} />
              <span className="block mt-1 text-[11px] text-[#5C6B76]">
                Clásica de Laucen: {pesos(precioLaucen)}
                {precioLaucen != null && <button type="button" className="ml-1 underline text-[#16577F]" onClick={() => setPrecio((x) => ({ valor: precioLaucen, vuelta: x.vuelta + 1 }))}>usar</button>}
              </span>
            </label>
          </div>
          <div>
            <span className={ETIQUETA}>Fotos ({fotos.filter((f) => f.usar).length} de {fotos.length}) — la primera tildada es la principal</span>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {fotos.map((f, i) => (
                <div key={f.url} className={`w-24 shrink-0 border rounded-lg p-1 ${f.usar ? "border-[#16577F]" : "border-[#E3E9F0] opacity-60"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" className="w-full h-20 object-contain bg-white" />
                  <label className="flex items-center gap-1 text-[11px] mt-1">
                    <input type="checkbox" checked={f.usar} onChange={(e) => setFotos((fs) => fs.map((x, k) => (k === i ? { ...x, usar: e.target.checked } : x)))} />
                    {i === 0 ? "Principal" : "Usar"}
                  </label>
                  <div className="flex justify-between mt-1">
                    <button type="button" className={`${SUAVE} !px-2 !py-0.5`} onClick={() => mover(i, -1)} disabled={i === 0} title="Más adelante">◀</button>
                    <button type="button" className={`${SUAVE} !px-2 !py-0.5`} onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} title="Más atrás">▶</button>
                  </div>
                  {f.usar && <input type="hidden" name={`foto:${c.canal}`} value={f.url} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Atributos({ lista }: { lista: AtributoForm[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
      {lista.map((a) => (
        <label key={a.id} className="flex items-center gap-2">
          <span className="w-48 shrink-0 text-[11px] text-[#5C6B76]" title={a.ayuda ?? a.id}>
            {a.nombre}{a.requerido && <b className="text-[#C03420]"> *</b>}<Origen o={a.origen} />
          </span>
          <input name={`attr:${a.id}`} defaultValue={a.valor} list={a.opciones.length ? `op-${a.id}` : undefined}
            placeholder={a.unidades.length ? `ej. 5 ${a.unidades[0]}` : a.opciones.length ? "Elegí o escribí" : ""}
            className={`${CAMPO} flex-1 ${a.origen === "ia" ? "!bg-[#FFFBEF]" : ""}`} />
          {a.opciones.length > 0 && <datalist id={`op-${a.id}`}>{a.opciones.map((o) => <option key={o} value={o} />)}</datalist>}
        </label>
      ))}
    </div>
  );
}
