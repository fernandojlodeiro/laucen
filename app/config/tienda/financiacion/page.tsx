// Cuotas y descuentos de la tienda web (lib/tienda/financiacion.ts): planes de
// cuotas por escala de precio (desde qué precio se ofrece cada uno, lo que cobra
// el banco y el interés que paga el comprador) y el descuento por pagar contado
// (transferencia, efectivo, débito). Ficha: abre en vista, se edita con el lápiz.
// El interruptor de arriba lo prende o lo apaga en la tienda.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { tiendaDelCanal } from "@/lib/tienda/tienda";
import { financiacionDe, planDeEscala, textoContado, MEDIOS_CONTADO, type Financiacion } from "@/lib/tienda/financiacion";
import { entrarErp, Pantalla, Avisos, BotonesFicha, TituloSeccion, editandoFicha, Dato, CAJA, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { Interruptor } from "@/app/radar/Piezas";
import { catalogoDe } from "@/app/tienda/[slug]/catalogo";
import { accionActivarFinanciacion, accionGuardarFinanciacion } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { canal?: string; editar?: string; ok?: string; error?: string };
const BASE = "/config/tienda/financiacion";
const plata = (n: number) => `$ ${formatearNumero(Math.round(n), "entero")}`;
const pct = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

/** Lo que dice la tarjeta de un producto de ese precio. */
function textoTarjeta(f: Financiacion, precio: number) {
  const p = planDeEscala(f, precio);
  if (!p) return "Sin cuotas (un pago)";
  const cuota = (precio * (1 + p.interes_pct / 100)) / p.cuotas;
  return p.interes_pct === 0 ? `Mismo precio en ${p.cuotas} cuotas de ${plata(cuota)}` : `en ${p.cuotas} cuotas de ${plata(cuota)}`;
}

export default async function CuotasYDescuentos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tienda_config");
  const sp = await searchParams;
  const tiendas = await consulta<{ id: number; nombre: string; financiacion: unknown }>(
    "select id::int, nombre, config -> 'financiacion' financiacion from canal where organizacion_id = $1 and tipo = 'web_minorista' and estado <> 'archivado' order by id", [s.org.id]);
  const tienda = tiendas.find((t) => t.id === Number(sp.canal)) ?? tiendas[0];
  const editando = editandoFicha(sp);
  const aqui = tienda ? `${BASE}?canal=${tienda.id}` : BASE;
  const f = financiacionDe(tienda?.financiacion);

  // Ejemplos con productos de verdad: el más barato, dos del medio y el más caro (con stock).
  const t = tienda ? await tiendaDelCanal(s.org.id, tienda.id) : null;
  const conStock = t ? (await catalogoDe(t)).filter((p) => p.stock > 0).sort((a, b) => a.venta - b.venta) : [];
  const ejemplos = conStock.length ? [...new Set([0, Math.floor(conStock.length / 3), Math.floor((conStock.length * 2) / 3), conStock.length - 1])].map((i) => conStock[i]) : [];
  const filas = editando ? [...f.planes, ...Array.from({ length: Math.max(2, 4 - f.planes.length) }, () => null)] : f.planes;

  return (
    <Pantalla titulo="Cuotas y descuentos" subtitulo="En cuántas cuotas se paga en la tienda según el precio, con qué interés, y el descuento por pagar contado" ancho="max-w-4xl"
      acciones={tienda ? <BotonesFicha editando={editando} ver={aqui} editar={`${aqui}&editar=ficha`} /> : undefined}>
      <Avisos sp={sp} />
      {!tienda ? (
        <div className={CAJA}><p className="text-xs">Todavía no hay una tienda web. Creala en <Link href="/config/tienda" className="text-[#16577F] underline">Configuración › Tienda web</Link>.</p></div>
      ) : (
        <>
          {tiendas.length > 1 && (
            <div className="flex gap-2 mb-3 text-xs">
              {tiendas.map((x) => <Link key={x.id} href={`${BASE}?canal=${x.id}`} className={`rounded-lg border px-3 py-1.5 ${x.id === tienda.id ? "bg-[#16577F] text-white border-[#16577F]" : "bg-white border-[#E3E9F0]"}`}>{x.nombre}</Link>)}
            </div>
          )}

          <div className={`${CAJA} mb-4`}>
            <Interruptor accion={accionActivarFinanciacion} prendido={f.activo} campos={{ canal_id: String(tienda.id) }} compacto
              etiqueta={f.activo ? "Prendido: la tienda usa este esquema" : "Apagado: la tienda usa los planes de Configuración › Cuotas"} />
            <p className="text-[11px] text-[#5C6B76] mt-1">
              Prendido, reemplaza en la tienda los planes por familia o producto de <Link href="/config/cuotas" className="text-[#16577F] underline">Cuotas</Link> y
              el descuento que tenga cargado cada medio de pago en <Link href="/config/medios-pago" className="text-[#16577F] underline">Medios de pago</Link> para
              transferencia, efectivo y débito.
            </p>
          </div>

          <form id="ficha" action={accionGuardarFinanciacion}>
            <input type="hidden" name="canal_id" value={tienda.id} />

            <section className="mb-6">
              <TituloSeccion titulo={`Planes de cuotas (${f.planes.length})`} />
              <p className="text-[11px] text-[#5C6B76] mb-2">
                Cada plan se ofrece a los productos que cuestan <b>desde</b> su monto. La tarjeta del producto muestra el plan más largo que le toca; la ficha y el
                pago, todos. Interés 0 = sin interés (el costo del plan lo cubre el precio). El interés se suma al total cuando el comprador paga con tarjeta de crédito en cuotas.
                {editando && " Para sacar un plan, borrá sus cuotas."}
              </p>
              <div className={CAJA_TABLA}>
                <table className={TABLA}>
                  <thead className={THEAD}><tr>
                    <th className={`${TH} text-right`}>Cuotas</th>
                    <th className={`${TH} text-right`} title="Desde qué precio del producto se ofrece">Desde $</th>
                    <th className={`${TH} text-right`} title="Lo que te cobra el banco o la tarjeta por este plan (sólo para comparar)">Costo del plan</th>
                    <th className={`${TH} text-right`} title="Lo que paga de más el comprador (0 = sin interés)">Interés al cliente</th>
                    <th className={TH}>Cómo queda</th>
                  </tr></thead>
                  <tbody>
                    {filas.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>Sin planes: con el lápiz cargás 3, 6, 12 cuotas o las que quieras.</td></tr>}
                    {filas.map((p, i) => editando ? (
                      <tr key={i} className={TR}>
                        <td className={TDN}><CampoNumero name={`cuotas_${i}`} valor={p?.cuotas ?? null} tipo="entero" className={`${CAMPO} w-16`} placeholder={["3", "6", "12", "18"][i] ?? ""} /></td>
                        <td className={TDN}><CampoNumero name={`desde_${i}`} valor={p?.desde ?? null} tipo="pesos" className={`${CAMPO} w-32`} placeholder="0" /></td>
                        <td className={TDN}><CampoNumero name={`costo_${i}`} valor={p?.costo_pct ?? null} tipo="pct" className={`${CAMPO} w-20`} placeholder="0" /></td>
                        <td className={TDN}><CampoNumero name={`interes_${i}`} valor={p?.interes_pct ?? null} tipo="pct" className={`${CAMPO} w-20`} placeholder="0" /></td>
                        <td className={`${TD} text-[#5C6B76]`}>{p ? "" : "Nuevo plan (opcional)"}</td>
                      </tr>
                    ) : p && (
                      <tr key={p.cuotas} className={TR}>
                        <td className={TDN}>{p.cuotas}</td>
                        <td className={TDN}>{p.desde > 0 ? plata(p.desde) : "Todos"}</td>
                        <td className={TDN}>{p.costo_pct ? pct(p.costo_pct) : "—"}</td>
                        <td className={TDN}>{p.interes_pct ? pct(p.interes_pct) : "Sin interés"}</td>
                        <td className={TD}>
                          {p.interes_pct === 0 ? (p.costo_pct ? <span className="text-[#5C6B76]">El {pct(p.costo_pct)} del plan lo cubre el precio</span> : <span className="text-[#5C6B76]">Sin interés</span>)
                            : p.interes_pct < p.costo_pct ? <span className="text-[#8a6100]">Cobrás {pct(p.interes_pct)}; el otro {pct(p.costo_pct - p.interes_pct)} lo ponés vos</span>
                            : <span className="text-[#167655]">El interés cubre el costo del plan</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-6">
              <TituloSeccion titulo="Descuento por pagar contado" />
              <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-2 gap-3 items-start text-xs`}>
                {editando ? (
                  <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Descuento</span>
                    <CampoNumero name="descuento_pct" valor={f.descuento_pct || null} tipo="pct" className={`${CAMPO} w-24`} placeholder="0" /></label>
                ) : <Dato etiqueta="Descuento" numero>{f.descuento_pct ? pct(f.descuento_pct) : null}</Dato>}
                <div><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Con qué medios</span>
                  <span className="flex flex-wrap gap-3 py-1.5">
                    {MEDIOS_CONTADO.map((m) => (
                      <label key={m.clave} className="inline-flex items-center gap-1">
                        <input type="checkbox" name={`medio_${m.clave}`} defaultChecked={f.medios_descuento.includes(m.clave)} disabled={!editando} /> {m.nombre}
                      </label>
                    ))}
                  </span>
                  <span className="block text-[10px] text-[#5C6B76]">Débito: con Payway, la tarjeta de débito en un pago aparece aparte en el pago, con el descuento.</span></div>
              </div>
            </section>
          </form>

          {ejemplos.length > 0 && (
            <section className="mb-6">
              <TituloSeccion titulo="Cómo se ve en la tienda" />
              <p className="text-[11px] text-[#5C6B76] mb-2">Con lo grabado{f.activo ? "" : " (cuando lo prendas)"}, algunos productos con stock: el más barato, dos del medio y el más caro.</p>
              <div className={CAJA_TABLA}>
                <table className={TABLA}>
                  <thead className={THEAD}><tr><th className={TH}>Producto</th><th className={`${TH} text-right`}>Precio</th><th className={TH}>Debajo del precio</th></tr></thead>
                  <tbody>
                    {ejemplos.map((p) => (
                      <tr key={p.id} className={TR}>
                        <td className={TD}><Link href={`/catalogo/productos/${p.id}`} className="text-[#16577F]">{p.titulo}</Link></td>
                        <td className={TDN}>{plata(p.venta)}</td>
                        <td className={TD}>
                          <span className="block">{textoTarjeta(f, p.venta)}</span>
                          {f.descuento_pct > 0 && f.medios_descuento.length > 0 && (
                            <span className="block text-[#167655]">{plata(p.venta * (1 - f.descuento_pct / 100))} {textoContado(f.medios_descuento)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </Pantalla>
  );
}
