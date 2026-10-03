"use client";

// "Nuevo pedido" a mano (local, web, mayorista, otro; nunca Mercado Libre):
// canal, cliente (buscador al tipear, o consumidor final), productos por SKU,
// título o código de barras (buscador al tipear) con el precio de la lista del
// canal —o la del cliente— editable y un descuento, pago y entrega. Lo graba
// accionNuevoPedido con crearPedido, la misma función que usa la API.

import { useEffect, useRef, useState, useTransition } from "react";
import CampoNumero from "@/app/componentes/CampoNumero";
import { leerNumero, formatearNumero } from "@/lib/numeros";
import { PRIMARIO, SUAVE, ICONO_BORRAR } from "@/app/botones";
import {
  accionNuevoPedido, buscarClientesPedido, buscarProductosPedido, preciosPedido,
  type ClienteHallado, type ProductoHallado,
} from "./acciones";

type Canal = { id: number; nombre: string; moneda: "ARS" | "USD" };
type Linea = { clave: number; variacion: number; sku: string; titulo: string; sugerido: number | null; disponible: number; version: number };

const CAMPO = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white";
const ETIQUETA = "block text-[11px] font-semibold text-[#5C6B76] mb-0.5";
const MEDIOS = ["Efectivo", "Transferencia", "Tarjeta de débito", "Tarjeta de crédito", "Mercado Pago", "Cheque", "Otro"];

/** Cuadro de búsqueda al tipear (desde la segunda letra) con la X para borrar
 *  y la caja "Comienza por" (tildada de entrada), como BuscadorVivo pero sin
 *  tocar la dirección: busca con una acción del servidor. */
function usarBusqueda<T>(buscar: (q: string, comienza: boolean) => Promise<T[]>) {
  const [texto, setTexto] = useState("");
  const [comienza, setComienza] = useState(true);
  const [hallados, setHallados] = useState<T[]>([]);
  const [buscando, setBuscando] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turno = useRef(0);
  const correr = (t: string, c: boolean) => {
    if (espera.current) clearTimeout(espera.current);
    if (t.trim().length < 2) { setHallados([]); return; }
    espera.current = setTimeout(async () => {
      const mio = ++turno.current;
      setBuscando(true);
      try {
        const r = await buscar(t, c);
        if (mio === turno.current) setHallados(r);
      } finally {
        if (mio === turno.current) setBuscando(false);
      }
    }, 250);
  };
  return {
    texto, comienza, hallados, buscando,
    escribir: (t: string) => { setTexto(t); correr(t, comienza); },
    tildar: (c: boolean) => { setComienza(c); correr(texto, c); },
    limpiar: () => { setTexto(""); setHallados([]); },
  };
}

function CuadroBusqueda({ b, placeholder, alEnter }: { b: ReturnType<typeof usarBusqueda<unknown>>; placeholder: string; alEnter?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="relative inline-flex">
        <input value={b.texto} onChange={(e) => b.escribir(e.target.value)} placeholder={placeholder} autoComplete="off"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); alEnter?.(); } }}
          className="border border-[#E3E9F0] rounded-lg pl-2 pr-7 py-1.5 text-xs bg-white w-80" />
        {b.texto && (
          <button type="button" onClick={b.limpiar} aria-label="Borrar la búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full text-[#5C6B76] hover:bg-[#E3E9F0] leading-none">×</button>
        )}
      </span>
      <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] whitespace-nowrap">
        <input type="checkbox" checked={b.comienza} onChange={(e) => b.tildar(e.target.checked)} className="h-4 w-4 accent-[#16577F]" />
        Comienza por
      </label>
      {b.buscando && <span className="text-[11px] text-[#5C6B76]">Buscando…</span>}
    </div>
  );
}

export default function NuevoPedido({ canales }: { canales: Canal[] }) {
  const [canal, setCanal] = useState<number>(canales[0]?.id ?? 0);
  const [moneda, setMoneda] = useState<"ARS" | "USD">(canales[0]?.moneda ?? "ARS");
  const [quien, setQuien] = useState<"consumidor" | "cliente">("consumidor");
  const [cliente, setCliente] = useState<ClienteHallado | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [pago, setPago] = useState("a_convenir");
  const [entrega, setEntrega] = useState("retiro");
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [subtotales, setSubtotales] = useState<Record<number, number>>({});
  const [enviando, empezar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const proxima = useRef(1);

  const clienteId = quien === "cliente" ? cliente?.id ?? null : null;
  const bCliente = usarBusqueda<ClienteHallado>((q, c) => buscarClientesPedido(q, c));
  const bProducto = usarBusqueda<ProductoHallado>((q, c) => buscarProductosPedido(q, c, canal, clienteId));
  const tipoPrecio = moneda === "USD" ? "usd" : "pesos";

  /** Subtotales y total, leídos de los campos del formulario. */
  const recalcular = () => {
    if (!form.current) return;
    const fd = new FormData(form.current);
    const sub: Record<number, number> = {};
    let t = 0;
    for (const l of lineas) {
      const cant = leerNumero(fd.get(`l_${l.clave}_cantidad`)) ?? 0;
      const precio = leerNumero(fd.get(`l_${l.clave}_precio`)) ?? 0;
      const desc = leerNumero(fd.get(`l_${l.clave}_descuento`)) ?? 0;
      sub[l.clave] = Math.round(cant * precio * (1 - desc / 100) * 100) / 100;
      t += sub[l.clave];
    }
    if (entrega === "envio") t += leerNumero(fd.get("costo_envio")) ?? 0;
    setSubtotales(sub);
    setTotal(Math.round(t * 100) / 100);
  };
  useEffect(recalcular, [lineas, entrega]);

  /** Cambió el canal o el cliente: la lista de precios puede ser otra. Los
   *  precios de las líneas vuelven al de la lista nueva. */
  const reprecio = async (nuevoCanal: number, nuevoCliente: number | null) => {
    const r = await preciosPedido(nuevoCanal, nuevoCliente, lineas.map((l) => l.variacion));
    setMoneda(r.moneda);
    setLineas((ls) => ls.map((l) => ({ ...l, sugerido: r.precios[l.variacion] ?? null, version: l.version + 1 })));
    bProducto.limpiar();
  };

  const agregar = (p: ProductoHallado) => {
    setLineas((ls) => [...ls, { clave: proxima.current++, variacion: p.id, sku: p.sku, titulo: p.titulo, sugerido: p.precio, disponible: p.disponible, version: 0 }]);
    bProducto.limpiar();
  };

  const elegirCliente = (c: ClienteHallado) => {
    setCliente(c);
    bCliente.limpiar();
    void reprecio(canal, c.id);
  };

  const enviar = (fd: FormData) => {
    setError("");
    empezar(async () => {
      const r = await accionNuevoPedido(fd);
      if (r?.error) setError(r.error);
    });
  };

  if (!canales.length) {
    return <p className="text-xs text-[#5C6B76]">No hay canales para cargar pedidos a mano (local, web, mayorista u otro). Crealos en Configuración → Canales.</p>;
  }

  return (
    <form ref={form} action={enviar} onInput={recalcular} onChange={recalcular} className="grid gap-4 text-xs">
      {error && <p role="alert" className="rounded-lg px-3 py-2 bg-[#FDF1EF] text-[#C03420]">{error}</p>}

      <div className="flex flex-wrap items-end gap-4">
        <label><span className={ETIQUETA}>Canal</span>
          <select name="canal" value={canal} className={CAMPO}
            onChange={(e) => { const c = Number(e.target.value); setCanal(c); void reprecio(c, clienteId); }}>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
        <fieldset>
          <span className={ETIQUETA}>Cliente</span>
          <div className="flex items-center gap-3 py-1.5">
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="quien" value="consumidor" checked={quien === "consumidor"} className="accent-[#16577F]"
                onChange={() => { setQuien("consumidor"); void reprecio(canal, null); }} /> Consumidor final
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="quien" value="cliente" checked={quien === "cliente"} className="accent-[#16577F]"
                onChange={() => { setQuien("cliente"); if (cliente) void reprecio(canal, cliente.id); }} /> Un cliente
            </label>
          </div>
        </fieldset>
      </div>

      {quien === "cliente" && (
        <div className="grid gap-2">
          {cliente ? (
            <div className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="cliente_id" value={cliente.id} />
              <span className="rounded-lg border border-[#E3E9F0] bg-white px-2 py-1.5">
                <span className="text-[#5C6B76]">N.º {cliente.id} · </span><b>{cliente.nombre}</b>
                {cliente.documento && <span className="text-[#5C6B76]"> · {cliente.documento}</span>}
                {cliente.cuentaCorriente && <span className="text-[#1F6E4A]"> · con cuenta corriente</span>}
              </span>
              <button type="button" className={SUAVE} onClick={() => { setCliente(null); void reprecio(canal, null); }}>Cambiar</button>
            </div>
          ) : (
            <div className="relative">
              <CuadroBusqueda b={bCliente as ReturnType<typeof usarBusqueda<unknown>>} placeholder="Nombre, documento, CUIT, mail o N.º"
                alEnter={() => bCliente.hallados[0] && elegirCliente(bCliente.hallados[0])} />
              {bCliente.texto.trim().length >= 2 && !bCliente.buscando && (
                <ul className="mt-1 max-w-xl rounded-lg border border-[#C9D3DD] bg-white shadow-sm">
                  {bCliente.hallados.length === 0 && <li className="px-2 py-1.5 text-[#5C6B76]">Ningún cliente coincide.</li>}
                  {bCliente.hallados.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => elegirCliente(c)} className="w-full text-left px-2 py-1.5 hover:bg-[#EEF3F8]">
                        <span className="text-[#5C6B76]">N.º {c.id} · </span><b>{c.nombre}</b>
                        {c.documento && <span className="text-[#5C6B76]"> · {c.documento}</span>}{c.email && <span className="text-[#5C6B76]"> · {c.email}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <span className={ETIQUETA}>Productos</span>
        <div className="relative">
          <CuadroBusqueda b={bProducto as ReturnType<typeof usarBusqueda<unknown>>} placeholder="SKU, título o código de barras"
            alEnter={() => bProducto.hallados[0] && agregar(bProducto.hallados[0])} />
          {bProducto.texto.trim().length >= 2 && !bProducto.buscando && (
            <ul className="mt-1 max-w-3xl max-h-72 overflow-auto rounded-lg border border-[#C9D3DD] bg-white shadow-sm">
              {bProducto.hallados.length === 0 && <li className="px-2 py-1.5 text-[#5C6B76]">Ningún producto coincide.</li>}
              {bProducto.hallados.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => agregar(p)} className="w-full text-left px-2 py-1.5 hover:bg-[#EEF3F8] flex gap-3">
                    <span className="font-mono">{p.sku}</span>
                    <span className="flex-1 truncate">{p.titulo}</span>
                    <span className="tabular-nums text-right w-28">{p.precio == null ? <span className="text-[#C03420]">sin precio</span> : `${moneda === "USD" ? "US$" : "$"} ${formatearNumero(p.precio, tipoPrecio)}`}</span>
                    <span className={`tabular-nums text-right w-24 ${p.disponible > 0 ? "text-[#5C6B76]" : "text-[#C03420]"}`}>{p.disponible} disp.</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {lineas.length > 0 && (
          <div className="bg-white border border-[#E3E9F0] rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[#5C6B76] bg-[#FAFBFC] border-b border-[#E3E9F0]">
                <tr>
                  <th className="py-1.5 px-2 text-left font-semibold">SKU</th>
                  <th className="py-1.5 px-2 text-left font-semibold">Producto</th>
                  <th className="py-1.5 px-2 text-right font-semibold">Cantidad</th>
                  <th className="py-1.5 px-2 text-right font-semibold">Precio ({moneda === "USD" ? "US$" : "$"})</th>
                  <th className="py-1.5 px-2 text-right font-semibold">Descuento %</th>
                  <th className="py-1.5 px-2 text-right font-semibold">Subtotal</th>
                  <th className="py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.clave} className="border-t border-[#E3E9F0] align-middle">
                    <td className="py-1.5 px-2 font-mono whitespace-nowrap">
                      <input type="hidden" name="linea" value={l.clave} />
                      <input type="hidden" name={`l_${l.clave}_variacion`} value={l.variacion} />
                      <input type="hidden" name={`l_${l.clave}_sugerido`} value={l.sugerido ?? ""} />
                      {l.sku}
                    </td>
                    <td className="py-1.5 px-2">{l.titulo}
                      {l.disponible <= 0 && <span className="block text-[10px] text-[#C03420]">Sin stock disponible en el canal</span>}
                      {l.sugerido == null && <span className="block text-[10px] text-[#C03420]">Sin precio en la lista: escribilo</span>}
                    </td>
                    <td className="py-1.5 px-2"><CampoNumero key={`c${l.clave}`} name={`l_${l.clave}_cantidad`} valor={1} tipo="entero" className={`${CAMPO} w-16`} /></td>
                    <td className="py-1.5 px-2"><CampoNumero key={`p${l.clave}-${l.version}`} name={`l_${l.clave}_precio`} valor={l.sugerido} tipo={tipoPrecio} className={`${CAMPO} w-28`} /></td>
                    <td className="py-1.5 px-2"><CampoNumero key={`d${l.clave}`} name={`l_${l.clave}_descuento`} valor={null} tipo="pct" placeholder="0,0" className={`${CAMPO} w-20`} /></td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{formatearNumero(subtotales[l.clave] ?? 0, tipoPrecio)}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      {borrando === l.clave ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-[#5C6B76]">¿Sacar?</span>
                          <button type="button" className={SUAVE} onClick={() => { setLineas((ls) => ls.filter((x) => x.clave !== l.clave)); setBorrando(null); }}>Sí</button>
                          <button type="button" className={SUAVE} onClick={() => setBorrando(null)}>No</button>
                        </span>
                      ) : (
                        <button type="button" aria-label="Sacar la línea" title="Sacar la línea" className={ICONO_BORRAR} onClick={() => setBorrando(l.clave)}>🗑</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="grid gap-2 content-start">
          <span className={ETIQUETA}>Pago</span>
          <div className="flex flex-wrap gap-3">
            {[["a_convenir", "A cobrar (a convenir)"], ["pagado", "Pagado"], ["cuenta_corriente", "Cuenta corriente"]].map(([v, t]) => (
              <label key={v} className="inline-flex items-center gap-1.5">
                <input type="radio" name="pago" value={v} checked={pago === v} onChange={() => setPago(v)} className="accent-[#16577F]" /> {t}
              </label>
            ))}
          </div>
          {pago !== "cuenta_corriente" && (
            <label><span className={ETIQUETA}>Medio de pago{pago === "a_convenir" ? " (si ya se sabe)" : ""}</span>
              <select name="medio_pago" defaultValue="" className={CAMPO}>
                <option value="">{pago === "pagado" ? "Elegí…" : "—"}</option>
                {MEDIOS.map((m) => <option key={m}>{m}</option>)}
              </select></label>
          )}
          <p className="text-[11px] text-[#5C6B76]">
            {pago === "pagado" ? "Queda pagado y se reserva el stock." : pago === "cuenta_corriente" ? "Queda confirmado (se reserva el stock) y el pago, a cuenta del cliente." : "Queda «A cobrar»: se reserva el stock y entra en picking sin esperar el pago; el cobro se confirma desde la ficha (se factura al cobrar)."}
          </p>
        </fieldset>
        <fieldset className="grid gap-2 content-start">
          <span className={ETIQUETA}>Entrega</span>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-1.5"><input type="radio" name="entrega" value="retiro" checked={entrega === "retiro"} onChange={() => setEntrega("retiro")} className="accent-[#16577F]" /> Retira</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" name="entrega" value="envio" checked={entrega === "envio"} onChange={() => setEntrega("envio")} className="accent-[#16577F]" /> Envío</label>
          </div>
          {entrega === "envio" && (
            <div key={cliente?.id ?? 0} className="grid grid-cols-6 gap-2 items-end">
              <label className="col-span-4"><span className={ETIQUETA}>Calle</span><input name="calle" defaultValue={cliente?.direccion?.calle ?? ""} className={`${CAMPO} w-full`} /></label>
              <label className="col-span-1"><span className={ETIQUETA}>Número</span><input name="numero" defaultValue={cliente?.direccion?.numero ?? ""} className={`${CAMPO} w-full`} /></label>
              <label className="col-span-1"><span className={ETIQUETA}>Piso/depto</span><input name="piso_depto" className={`${CAMPO} w-full`} /></label>
              <label className="col-span-3"><span className={ETIQUETA}>Localidad</span><input name="localidad" defaultValue={cliente?.direccion?.localidad ?? ""} className={`${CAMPO} w-full`} /></label>
              <label className="col-span-2"><span className={ETIQUETA}>Provincia</span><input name="provincia" defaultValue={cliente?.direccion?.provincia ?? ""} className={`${CAMPO} w-full`} /></label>
              <label className="col-span-1"><span className={ETIQUETA}>CP</span><input name="codigo_postal" defaultValue={cliente?.direccion?.codigo_postal ?? ""} className={`${CAMPO} w-full`} /></label>
              <label className="col-span-4"><span className={ETIQUETA}>Referencia</span><input name="referencia" className={`${CAMPO} w-full`} /></label>
              <label className="col-span-2"><span className={ETIQUETA}>Costo del envío ({moneda === "USD" ? "US$" : "$"})</span>
                <CampoNumero name="costo_envio" valor={null} tipo={tipoPrecio} className={`${CAMPO} w-full`} /></label>
            </div>
          )}
        </fieldset>
      </div>

      <label><span className={ETIQUETA}>Notas</span>
        <textarea name="notas" rows={2} className={`${CAMPO} w-full`} /></label>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-sm">Total: <b className="tabular-nums">{moneda === "USD" ? "US$" : "$"} {formatearNumero(total, tipoPrecio)}</b></span>
        <button disabled={enviando || !lineas.length} className={`${PRIMARIO} disabled:opacity-60`}>{enviando ? "Creando…" : "Crear pedido"}</button>
      </div>
    </form>
  );
}
