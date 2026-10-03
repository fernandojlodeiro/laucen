"use client";

// Formulario del checkout (un paso). Al cambiar el envío, el medio de pago o
// la provincia, pide el resumen recotizado al servidor (cotizarAccion); si esa
// cuenta falla, queda el resumen anterior y un aviso, y "Confirmar compra"
// igual vuelve a cotizar todo en el servidor (comprar). El formulario no se
// limpia si la compra da error.

import { useRef, useState, useTransition } from "react";
import type { Medio } from "@/lib/tienda/checkout";
import type { MetodoEnvio, Resumen } from "../resumen";
import { CONDICIONES_IVA, PROVINCIAS, precio, sinDireccion } from "../comun";
import { confirmarCompra, cotizarAccion } from "../acciones";

export type Precarga = Partial<Record<"nombre" | "email" | "telefono" | "documento" | "razon_social" | "condicion_iva" | "calle" | "numero" | "piso_depto" | "localidad" | "provincia" | "codigo_postal", string>>;

const CAMPO = "w-full h-12 rounded-md border border-[rgba(0,0,0,.25)] bg-white px-3 text-base outline-none hover:border-[rgba(0,0,0,.4)] focus:border-[var(--boton)] focus:ring-1 focus:ring-[var(--boton)]";
const ETIQUETA = "block text-sm text-[var(--texto)] mb-1";
const CAJA = "rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)]";

const AYUDA_MEDIO: Record<string, string> = {
  mercadopago: "Te llevamos a Mercado Pago para pagar con tarjeta, dinero en cuenta o efectivo.",
  payway: "Pagás con tarjeta de crédito o débito en el paso siguiente.",
  transferencia: "Te mostramos los datos para transferir al confirmar.",
  efectivo: "Pagás en efectivo al retirar o recibir.",
  cuenta_corriente: "Se carga a tu cuenta corriente.",
};

function Bloque({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className={CAJA}>
      <h2 className="flex items-center gap-3 border-b border-[var(--linea)] px-4 py-4 text-base font-semibold text-[var(--texto)] sm:px-6">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--boton-claro)] text-sm font-semibold text-[var(--boton)]">{n}</span>{titulo}
      </h2>
      <div className="space-y-4 px-4 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function Campo({ nombre, etiqueta, opcional, ...resto }: { nombre: string; etiqueta: string; opcional?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={`f-${nombre}`} className={ETIQUETA}>{etiqueta}{opcional && <span className="font-normal text-gray-400"> (opcional)</span>}</label>
      <input id={`f-${nombre}`} name={nombre} className={CAMPO} required={!opcional} {...resto} />
    </div>
  );
}

export default function Checkout({ slug, medios, metodos, inicial, precarga, eleccion }: {
  slug: string; medios: Medio[]; metodos: MetodoEnvio[]; inicial: Resumen; precarga: Precarga;
  eleccion: { metodoEnvioId: number | null; medio: string | null; provincia: string };
}) {
  const [metodo, setMetodo] = useState(eleccion.metodoEnvioId);
  const [medio, setMedio] = useState(eleccion.medio);
  const [provincia, setProvincia] = useState(eleccion.provincia);
  const [documento, setDocumento] = useState(precarga.documento ?? "");
  const [resumen, setResumen] = useState(inicial);
  const [errorCot, setErrorCot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const [calculando, empezarCalculo] = useTransition();
  const [enviando, empezarEnvio] = useTransition();
  const ultimo = useRef(0);
  const cajaError = useRef<HTMLDivElement>(null);

  const elegido = metodos.find((m) => m.id === metodo);
  const conDireccion = !!elegido && !sinDireccion(elegido.tipo);
  const esCuit = documento.replace(/\D/g, "").length === 11;
  const m = resumen.moneda;

  function recotizar(cambio: Partial<{ metodoEnvioId: number | null; medio: string | null; provincia: string }>) {
    const e = { metodoEnvioId: metodo, medio, provincia, ...cambio };
    const n = ++ultimo.current;
    empezarCalculo(async () => {
      try {
        const r = await cotizarAccion(slug, { metodoEnvioId: e.metodoEnvioId, medio: e.medio, provincia: e.provincia || null });
        if (n !== ultimo.current) return; // llegó una respuesta vieja
        if ("error" in r) setErrorCot(r.error);
        else { setResumen(r.resumen); setErrorCot(null); }
      } catch {
        if (n === ultimo.current) setErrorCot("No pudimos actualizar el total. Revisá tu conexión.");
      }
    });
  }

  function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    setError(null);
    empezarEnvio(async () => {
      try {
        const r = await confirmarCompra(fd);
        if ("error" in r) {
          setError(r.error);
          setTimeout(() => cajaError.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
        } else {
          setYendo(true);
          window.location.assign(r.ir);
        }
      } catch {
        setError("No pudimos confirmar la compra. Revisá tu conexión y probá de nuevo.");
      }
    });
  }

  const costoMetodo = (id: number, tipo: string) => {
    const c = resumen.costos[id];
    if (!c) return tipo === "por_provincia" && !provincia ? "Según provincia" : "—";
    if (c.aConvenir) return "A convenir";
    if (c.costo === 0) return "Gratis";
    return precio(c.costo, m);
  };

  const ocupado = enviando || yendo;

  return (
    <form onSubmit={enviar} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="slug" value={slug} />
      <div className="space-y-4">
        <Bloque n={1} titulo="Tus datos">
          <Campo nombre="nombre" etiqueta="Nombre y apellido" autoComplete="name" defaultValue={precarga.nombre} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo nombre="email" etiqueta="Mail" type="email" autoComplete="email" inputMode="email" defaultValue={precarga.email} />
            <Campo nombre="telefono" etiqueta="Teléfono" type="tel" autoComplete="tel" inputMode="tel" defaultValue={precarga.telefono} />
          </div>
          <div>
            <label htmlFor="f-documento" className={ETIQUETA}>DNI o CUIT</label>
            <input id="f-documento" name="documento" inputMode="numeric" className={CAMPO} required value={documento}
              onChange={(e) => setDocumento(e.target.value)} placeholder="Sólo números" />
            {esCuit && <p className="mt-1 text-xs text-gray-500">Si necesitás factura A, completá la razón social y la condición frente al IVA.</p>}
          </div>
          {esCuit && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo nombre="razon_social" etiqueta="Razón social" opcional defaultValue={precarga.razon_social} />
              <div>
                <label htmlFor="f-condicion_iva" className={ETIQUETA}>Condición frente al IVA <span className="font-normal text-gray-400">(opcional)</span></label>
                <select id="f-condicion_iva" name="condicion_iva" className={CAMPO} defaultValue={precarga.condicion_iva ?? ""}>
                  <option value="">Elegí…</option>
                  {CONDICIONES_IVA.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
              </div>
            </div>
          )}
        </Bloque>

        <Bloque n={2} titulo="Entrega">
          {metodos.length === 0 && <p className="text-sm text-red-700">No hay formas de entrega disponibles. Escribinos para coordinar.</p>}
          <div className="space-y-2">
            {metodos.map((x) => (
              <label key={x.id} className={`flex items-start gap-3 rounded-md border p-4 ${!x.disponible ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[var(--boton)]"} ${metodo === x.id ? "border-[var(--boton)] shadow-[0_0_0_1px_var(--boton)]" : "border-black/20"}`}>
                <input type="radio" name="metodo_envio" value={x.id} required disabled={!x.disponible} checked={metodo === x.id}
                  onChange={() => { setMetodo(x.id); recotizar({ metodoEnvioId: x.id }); }} className="mt-1 h-5 w-5 accent-[var(--boton)]" />
                <span className="flex-1">
                  <span className="flex justify-between gap-2">
                    <span className="font-semibold">{x.nombre}</span>
                    <span className={`shrink-0 font-semibold tabular-nums ${x.disponible && costoMetodo(x.id, x.tipo) === "Gratis" ? "text-[var(--verde)]" : ""}`}>{x.disponible ? costoMetodo(x.id, x.tipo) : "Próximamente"}</span>
                  </span>
                  {x.plazo && <span className="block text-sm text-gray-500">{x.plazo}</span>}
                  {metodo === x.id && x.instrucciones && <span className="mt-1 block whitespace-pre-line text-sm text-gray-600">{x.instrucciones}</span>}
                </span>
              </label>
            ))}
          </div>
          {conDireccion && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Campo nombre="calle" etiqueta="Calle" autoComplete="address-line1" defaultValue={precarga.calle} />
                <Campo nombre="numero" etiqueta="Número" inputMode="numeric" opcional defaultValue={precarga.numero} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo nombre="piso_depto" etiqueta="Piso / depto" opcional autoComplete="address-line2" defaultValue={precarga.piso_depto} />
                <Campo nombre="localidad" etiqueta="Localidad" autoComplete="address-level2" defaultValue={precarga.localidad} />
              </div>
              <div className="grid grid-cols-[1fr_130px] gap-3">
                <div>
                  <label htmlFor="f-provincia" className={ETIQUETA}>Provincia</label>
                  <select id="f-provincia" name="provincia" required className={CAMPO} value={provincia}
                    onChange={(e) => { setProvincia(e.target.value); recotizar({ provincia: e.target.value }); }}>
                    <option value="">Elegí…</option>
                    {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
                    {provincia && !(PROVINCIAS as readonly string[]).includes(provincia) && <option value={provincia}>{provincia}</option>}
                  </select>
                </div>
                <Campo nombre="codigo_postal" etiqueta="Código postal" autoComplete="postal-code" defaultValue={precarga.codigo_postal} />
              </div>
              <Campo nombre="referencia" etiqueta="Referencia para el envío" opcional placeholder="Entre calles, timbre, etc." />
            </div>
          )}
        </Bloque>

        <Bloque n={3} titulo="Medio de pago">
          {medios.length === 0 && <p className="text-sm text-red-700">No hay medios de pago disponibles. Escribinos para coordinar.</p>}
          <div className="space-y-2">
            {medios.map((x) => (
              <label key={x.tipo} className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 hover:border-[var(--boton)] ${medio === x.tipo ? "border-[var(--boton)] shadow-[0_0_0_1px_var(--boton)]" : "border-black/20"}`}>
                <input type="radio" name="medio" value={x.tipo} required checked={medio === x.tipo}
                  onChange={() => { setMedio(x.tipo); recotizar({ medio: x.tipo }); }} className="mt-1 h-5 w-5 accent-[var(--boton)]" />
                <span className="flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{x.nombre}</span>
                    {x.descuento_pct > 0 && <span className="rounded bg-[var(--verde)] px-2 py-0.5 text-xs font-semibold text-white">{x.descuento_pct.toLocaleString("es-AR")}% de descuento</span>}
                    {x.descuento_pct < 0 && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{(-x.descuento_pct).toLocaleString("es-AR")}% de recargo</span>}
                  </span>
                  {medio === x.tipo && (
                    <span className="mt-1 block text-sm text-gray-600">
                      {AYUDA_MEDIO[x.tipo]}
                      {x.instrucciones && x.tipo !== "transferencia" && <span className="mt-1 block whitespace-pre-line">{x.instrucciones}</span>}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </Bloque>

        <section className={`${CAJA} px-4 py-5 sm:px-6`}>
          <label htmlFor="f-notas" className="mb-2 block text-base font-semibold text-[var(--texto)]">Notas <span className="text-sm font-normal text-[var(--texto-2)]">(opcional)</span></label>
          <textarea id="f-notas" name="notas" rows={3} maxLength={1000} placeholder="¿Algo que tengamos que saber?"
            className="w-full rounded-md border border-[rgba(0,0,0,.25)] p-3 text-base outline-none focus:border-[var(--boton)] focus:ring-1 focus:ring-[var(--boton)]" />
        </section>
      </div>

      <aside className={`${CAJA} space-y-3 p-5 sm:p-6 lg:sticky lg:top-4`}>
        <h2 className="-mx-5 -mt-5 flex items-center justify-between border-b border-[var(--linea)] px-5 py-4 text-base font-semibold text-[var(--texto)] sm:-mx-6 sm:-mt-6 sm:px-6">
          Resumen de compra {calculando && <span className="text-xs font-normal text-[var(--texto-2)]">Calculando…</span>}
        </h2>
        <ul className="space-y-2">
          {resumen.lineas.map((l) => (
            <li key={l.variacionId} className="flex items-center gap-3 text-sm">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--linea)] bg-white">
                {l.foto && <img src={l.foto} alt="" className="h-full w-full object-contain p-0.5" />}
                <span className="absolute right-0 top-0 rounded-bl-lg bg-gray-700 px-1 text-[10px] font-bold text-white">{l.cantidad}</span>
              </span>
              <span className="line-clamp-2 flex-1 text-gray-700">{l.titulo}</span>
              <span className="shrink-0 tabular-nums">{precio(l.subtotal, m)}</span>
            </li>
          ))}
        </ul>
        <div className={`space-y-2 border-t border-[var(--linea)] pt-3 text-sm transition-opacity ${calculando ? "opacity-60" : ""}`}>
          <div className="flex justify-between"><span>Productos</span><span className="tabular-nums">{precio(resumen.subtotal, m)}</span></div>
          {resumen.descuentos.map((d) => (
            <div key={d.nombre} className={`flex justify-between gap-2 ${d.importe < 0 ? "text-[var(--texto)]" : "text-[var(--verde)]"}`}>
              <span>{d.nombre}</span>
              <span className="shrink-0 tabular-nums">{d.importe === 0 ? "Envío bonificado" : d.importe > 0 ? `− ${precio(d.importe, m)}` : `+ ${precio(-d.importe, m)}`}</span>
            </div>
          ))}
          <div className="flex justify-between gap-2">
            <span>Envío{resumen.envio?.nombre ? ` (${resumen.envio.nombre})` : ""}</span>
            <span className="shrink-0 tabular-nums">{!resumen.envio ? "—" : resumen.envio.aConvenir ? "A convenir" : resumen.envio.costo === 0 ? "Gratis" : precio(resumen.envio.costo, m)}</span>
          </div>
          <div className="flex justify-between pt-3 text-lg font-semibold"><span>Total</span><span className="tabular-nums">{precio(resumen.total, m)}</span></div>
        </div>
        {errorCot && <p className="text-sm text-amber-800">{errorCot} El total final se calcula al confirmar.</p>}
        {resumen.sinStock.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">No alcanza el stock: {resumen.sinStock.join("; ")}. Ajustá las cantidades en el carrito.</div>
        )}
        <div ref={cajaError}>
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        </div>
        <button type="submit" disabled={ocupado || !medios.length || !metodos.some((x) => x.disponible)}
          className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[var(--boton)] text-base font-semibold text-white transition-colors hover:bg-[var(--boton-hover)] disabled:cursor-not-allowed disabled:opacity-50">
          {yendo ? "Te estamos llevando…" : enviando ? "Confirmando…" : "Confirmar compra"}
        </button>
        <p className="text-center text-xs text-[var(--texto-2)]">Al confirmar se crea tu pedido y te mostramos cómo seguir.</p>
      </aside>
    </form>
  );
}
