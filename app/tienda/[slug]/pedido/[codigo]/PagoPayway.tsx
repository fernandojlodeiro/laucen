"use client";

// Pago con tarjeta (Payway): el SDK decidir.js tokeniza la tarjeta en el
// navegador con la llave PÚBLICA (los datos de la tarjeta nunca pasan por
// Laucen) y el servidor cobra con el token (pagarConTarjeta → cobrarConPayway).
// La marca no se elige (Fer, 2/11): sale de los primeros números (lib/tienda/tarjetas.ts) y, si es de crédito o
// de débito, de la consulta de BIN (sólo esos 6 números van al servidor). Si igual quedan dos posibles, se elige entre ésas.

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { precio } from "../../comun";
import { pagarConTarjeta, tipoDeTarjetaDelPedido } from "../../acciones";
import { redDeNumero, marcasPosibles, type Red, type TipoTarjeta } from "@/lib/tienda/tarjetas";

type DecidirSdk = {
  setPublishableKey: (k: string) => void;
  setTimeout: (ms: number) => void;
  createToken: (form: HTMLFormElement, cb: (status: number, r: { id?: string; bin?: string; error?: { error?: { type?: string; message?: string } ; param?: string }[] }) => void) => void;
};
declare global { interface Window { Decidir?: new (url: string, sinCs: boolean) => DecidirSdk } }

const CAMPO = "w-full h-12 rounded-md border border-gray-300 bg-white px-3 text-base outline-none focus:border-[var(--boton)] focus:ring-1 focus:ring-[var(--boton)]";
const ETIQUETA = "block text-sm font-medium text-gray-700 mb-1";

export default function PagoPayway({ slug, codigo, publicKey, url, total, moneda, marcas, planes, fijas }: {
  slug: string; codigo: string; publicKey: string; url: string; total: number; moneda: "ARS" | "USD";
  marcas: { id: number; nombre: string }[]; planes: { cuotas: number; interes_pct: number }[];
  /** Cuotas elegidas al comprar (con su interés ya en el total): no se cambian acá. */
  fijas?: number | null;
}) {
  const router = useRouter();
  const sdk = useRef<DecidirSdk | null>(null);
  const [listo, setListo] = useState(false);
  const [estado, setEstado] = useState<"libre" | "procesando" | "aprobado">("libre");
  const [error, setError] = useState<string | null>(null);
  const [marcaElegida, setMarcaElegida] = useState("");
  const [cuotas, setCuotas] = useState(String(fijas ?? 1));
  // Lo que se sabe de la tarjeta por su número: la red al instante y crédito/débito cuando contesta el servidor.
  const [tarjeta, setTarjeta] = useState<{ bin: string; red: Red | null; tipo: TipoTarjeta | null; consultando: boolean }>({ bin: "", red: null, tipo: null, consultando: false });
  const permitidas = marcas.map((m) => m.id);
  // Sin saber la red (todavía no hay 6 números, o ni Mercado Pago ni los primeros números la dicen), se elige de la lista.
  const posibles = tarjeta.red ? marcasPosibles(tarjeta.red, tarjeta.tipo, permitidas) : tarjeta.bin.length >= 6 && !tarjeta.consultando ? permitidas : [];
  const marca = posibles.length === 1 ? String(posibles[0]) : posibles.includes(Number(marcaElegida)) ? marcaElegida : "";
  const nombre = (id: number) => marcas.find((m) => m.id === id)?.nombre ?? "";
  const noVa = tarjeta.red && !tarjeta.consultando && posibles.length === 0 ? motivoNoVa(tarjeta.red, tarjeta.tipo, marcas) : null;

  function numeroCambio(valor: string) {
    const bin = valor.replace(/\D/g, "").slice(0, 6);
    if (bin === tarjeta.bin) return;
    if (bin.length < 6) { setTarjeta({ bin, red: null, tipo: null, consultando: false }); return; }
    setTarjeta({ bin, red: redDeNumero(bin), tipo: null, consultando: true });
    tipoDeTarjetaDelPedido(slug, codigo, bin).then((x) =>
      setTarjeta((t) => (t.bin === bin ? { ...t, red: x?.red ?? t.red, tipo: x?.tipo ?? null, consultando: false } : t))).catch(() =>
      setTarjeta((t) => (t.bin === bin ? { ...t, consultando: false } : t)));
  }

  function cargarSdk() {
    if (!window.Decidir) { setError("No pudimos cargar el formulario de pago. Recargá la página."); return; }
    const d = new window.Decidir(url, true);
    d.setPublishableKey(publicKey);
    d.setTimeout(10000);
    sdk.current = d;
    setListo(true);
  }

  function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!sdk.current || estado !== "libre") return;
    if (!marca) { setError(noVa ?? "Escribí el número de la tarjeta para reconocerla."); return; }
    setError(null);
    setEstado("procesando");
    sdk.current.createToken(ev.currentTarget, async (status, r) => {
      if ((status !== 200 && status !== 201) || !r.id) {
        setEstado("libre");
        setError(r.error?.length ? "Revisá los datos de la tarjeta (número, vencimiento, código y documento)." : "No pudimos leer la tarjeta. Probá de nuevo.");
        return;
      }
      try {
        const res = await pagarConTarjeta(slug, codigo, { token: r.id, bin: r.bin ?? "", marca: Number(marca), cuotas: Number(cuotas) });
        if ("error" in res) { setEstado("libre"); setError(res.error); return; }
        if (res.aprobado) { setEstado("aprobado"); router.refresh(); }
        else { setEstado("libre"); setError(`El pago fue rechazado. ${res.detalle.replace(/^Rechazado:\s*/, "")}. Probá con otra tarjeta.`); }
      } catch {
        setEstado("libre");
        setError("No pudimos procesar el pago. Revisá tu conexión y probá de nuevo.");
      }
    });
  }

  if (estado === "aprobado") {
    return <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-800"><b>¡Pago aprobado!</b> Ya estamos preparando tu pedido.</div>;
  }

  const opciones = fijas ? [{ cuotas: fijas, interes_pct: 0 }] : [{ cuotas: 1, interes_pct: 0 }, ...planes.filter((p) => p.cuotas > 1)];
  return (
    <section className="rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)] p-4 sm:p-5">
      <Script src="https://live.decidir.com/static/v2.5/decidir.js" strategy="afterInteractive" onReady={cargarSdk} onError={() => setError("No pudimos cargar el formulario de pago. Recargá la página.")} />
      <h2 className="mb-4 text-lg font-bold">Pagá con tarjeta</h2>
      <form onSubmit={enviar} className="space-y-4" autoComplete="on">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="t-marca" className={ETIQUETA}>Tarjeta</label>
            {posibles.length > 1 ? (
              <select id="t-marca" className={CAMPO} value={marca} onChange={(e) => setMarcaElegida(e.target.value)}>
                <option value="">{tarjeta.red ? "¿Crédito o débito?" : "Elegí la tarjeta"}</option>
                {posibles.map((id) => <option key={id} value={id}>{nombre(id)}</option>)}
              </select>
            ) : (
              <div id="t-marca" className={`${CAMPO} flex items-center ${marca ? "text-gray-900" : "text-gray-500"}`}>
                {marca ? nombre(Number(marca)) : tarjeta.consultando ? "Reconociendo la tarjeta…" : "Se reconoce sola con el número"}
              </div>
            )}
          </div>
          <div>
            <label htmlFor="t-cuotas" className={ETIQUETA}>Cuotas</label>
            <select id="t-cuotas" className={CAMPO} value={cuotas} onChange={(e) => setCuotas(e.target.value)}>
              {opciones.map((p) => (
                <option key={p.cuotas} value={p.cuotas}>
                  {p.cuotas === 1 ? `1 pago de ${precio(total, moneda)}`
                    : fijas ? `${p.cuotas} cuotas de ${precio(Math.round((total / p.cuotas) * 100) / 100, moneda)}`
                    : p.interes_pct === 0 ? `${p.cuotas} cuotas sin interés de ${precio(Math.round((total / p.cuotas) * 100) / 100, moneda)}`
                    : `${p.cuotas} cuotas (con interés)`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="t-numero" className={ETIQUETA}>Número de tarjeta</label>
          <input id="t-numero" data-decidir="card_number" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" className={CAMPO} required
            onChange={(e) => numeroCambio(e.target.value)} />
          {noVa && <p role="alert" className="mt-1 text-sm text-red-700">{noVa}</p>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="t-mes" className={ETIQUETA}>Mes</label>
            <input id="t-mes" data-decidir="card_expiration_month" inputMode="numeric" autoComplete="cc-exp-month" placeholder="MM" maxLength={2} className={CAMPO} required />
          </div>
          <div>
            <label htmlFor="t-anio" className={ETIQUETA}>Año</label>
            <input id="t-anio" data-decidir="card_expiration_year" inputMode="numeric" autoComplete="cc-exp-year" placeholder="AA" maxLength={2} className={CAMPO} required />
          </div>
          <div>
            <label htmlFor="t-cvv" className={ETIQUETA}>Código</label>
            <input id="t-cvv" data-decidir="security_code" inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} className={CAMPO} required />
          </div>
        </div>
        <div>
          <label htmlFor="t-titular" className={ETIQUETA}>Nombre como figura en la tarjeta</label>
          <input id="t-titular" data-decidir="card_holder_name" autoComplete="cc-name" className={CAMPO} required />
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <div>
            <label htmlFor="t-tipodoc" className={ETIQUETA}>Documento</label>
            <select id="t-tipodoc" data-decidir="card_holder_doc_type" className={CAMPO} defaultValue="dni">
              <option value="dni">DNI</option><option value="cuil">CUIL</option><option value="cuit">CUIT</option>
            </select>
          </div>
          <div>
            <label htmlFor="t-doc" className={ETIQUETA}>Número</label>
            <input id="t-doc" data-decidir="card_holder_doc_number" inputMode="numeric" className={CAMPO} required />
          </div>
        </div>
        {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <button type="submit" disabled={!listo || estado !== "libre" || !marca}
          className="inline-flex h-14 w-full items-center justify-center rounded-md bg-[var(--boton)] text-lg font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          {estado === "procesando" ? "Procesando…" : !listo ? "Cargando…" : `Pagar ${precio(total, moneda)}`}
        </button>
        <p className="text-center text-xs text-gray-500">Pago seguro con Payway. Los datos de tu tarjeta no pasan por nuestro sistema.</p>
      </form>
    </section>
  );
}

const RED: Record<Red, string> = { visa: "Visa", master: "Mastercard", amex: "American Express", cabal: "Cabal", naranja: "Naranja" };

/** Por qué esa tarjeta no sirve para este pago, en criollo. */
function motivoNoVa(red: Red, tipo: TipoTarjeta | null, marcas: { id: number; nombre: string }[]): string {
  const aceptadas = marcas.map((m) => m.nombre).join(", ");
  const soloDebito = marcas.every((m) => /débito/i.test(m.nombre));
  if (soloDebito) return `Elegiste pagar con tarjeta de débito (con descuento) y esta ${tipo === "credito" ? "es de crédito" : `${RED[red]} no es de débito`}. Usá una de débito o cambiá la forma de pago.`;
  if (tipo === "debito") return `Esta tarjeta es de débito. Para pagar con débito (con descuento) cambiá la forma de pago a «Tarjeta de débito».`;
  return `Con ${RED[red]} no se puede pagar así. Para este pago se aceptan: ${aceptadas}.`;
}
