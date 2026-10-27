// Cuotas y descuentos de la tienda web (lib/tienda/financiacion.ts): planes de
// cuotas (desde qué precio se muestra cada uno en la tarjeta, lo que cobra
// el banco y el interés que paga el comprador) y el descuento por pagar contado
// (transferencia, efectivo, débito). Ficha: abre en vista, se edita con el lápiz.
// El interruptor de arriba lo prende o lo apaga en la tienda.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { tiendaDelCanal } from "@/lib/tienda/tienda";
import { cuotasMpDe, financiacionDe, financiacionHoy, planDeEscala, textoContado, MEDIOS_CONTADO, type Financiacion } from "@/lib/tienda/financiacion";
import { fechaAR } from "@/lib/dias-semana";
import { fecha } from "@/app/ventas/formato";
import { entrarErp, Pantalla, Avisos, BotonesFicha, TituloSeccion, editandoFicha, Dato, CAJA, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { Interruptor } from "@/app/radar/Piezas";
import { catalogoDe } from "@/app/tienda/[slug]/catalogo";
import { tasasMpDe } from "@/lib/tienda/tasas-mp";
import { accionActivarFinanciacion, accionActivarVsMl, accionGuardarFinanciacion } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { canal?: string; editar?: string; ok?: string; error?: string };
const BASE = "/config/tienda/financiacion";
const plata = (n: number) => `$ ${formatearNumero(Math.round(n), "entero")}`;
const pct = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

/** Lo que dice la tarjeta de un producto de ese precio. */
function textoTarjeta(f: Financiacion, precio: number) {
  const p = planDeEscala(f, precio);
  const mp = cuotasMpDe(f, precio);
  const texto = !p ? "Sin cuotas (un pago)" : `${p.cuotas} cuotas${p.interes_pct === 0 ? " sin interés" : ""} de ${plata((precio * (1 + p.interes_pct / 100)) / p.cuotas)}`;
  return mp ? `${texto} · «Hasta ${mp} cuotas»` : texto;
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
  // Lo que rige hoy (sin los planes y el descuento fuera de fecha), para los ejemplos.
  const hoy = financiacionHoy(f);

  // Ejemplos con productos de verdad: el más barato, dos del medio y el más caro (con stock).
  const t = tienda ? await tiendaDelCanal(s.org.id, tienda.id) : null;
  const tasasMp = t && f.planes.some((p) => p.medio === "mercadopago") ? await tasasMpDe({ ...t, config: { ...t.config, financiacion: { ...f, activo: true } } }) : null;
  const conStock = t ? (await catalogoDe(t)).filter((p) => p.stock > 0).sort((a, b) => a.venta - b.venta) : [];
  const ejemplos = conStock.length ? [...new Set([0, Math.floor(conStock.length / 3), Math.floor((conStock.length * 2) / 3), conStock.length - 1])].map((i) => conStock[i]) : [];
  // Precio contra Mercado Libre: lo guardado en la lista de la tienda y los canales de ML para el tachado.
  const vs = tienda ? (await consulta<{ cfg: { activo?: boolean; objetivo_pct?: number; costo_ref_pct?: number; canal_tachado?: number | null; comision_defecto_pct?: number; bono_fijo_pct?: number; bono_stock_min?: number; bono_tope_pct?: number } | null }>(
    "select l.precio_vs_ml cfg from canal c join lista_precios l on l.id = c.lista_precios_id where c.id = $1", [tienda.id]))[0]?.cfg ?? {} : {};
  const canalesMl = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre' and estado <> 'archivado' order by id", [s.org.id]);
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

          <section className="mb-6">
            <TituloSeccion titulo="Precio de la web contra Mercado Libre" />
            <div className={`${CAJA} text-xs`}>
              <Interruptor accion={accionActivarVsMl} prendido={!!vs.activo} campos={{ canal_id: String(tienda.id) }} compacto
                etiqueta={vs.activo ? "Prendido: el precio de cada producto se calcula contra Mercado Libre" : "Apagado: la tienda usa su lista con los descuentos por familia"} />
              <p className="text-[11px] text-[#5C6B76] mt-1 mb-3">
                El precio de cada producto es el de la Clásica de Mercado Libre menos lo justo para que, cobrando con lo más caro que se ofrece al mismo
                precio (las cuotas sin interés), te quede lo que pongas acá de lo que te queda vendiéndolo en la Clásica, con la comisión real de su
                categoría (sin envío). El precio tachado es el mismo tachado que muestra Mercado Libre en ese canal.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start">
                {editando ? <>
                  <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Te tiene que quedar</span>
                    <CampoNumero form="ficha" name="vsml_objetivo" valor={vs.objetivo_pct ?? 97} tipo="pct" className={`${CAMPO} w-24`} />
                    <span className="block text-[10px] text-[#5C6B76] mt-0.5">De lo que te queda en ML (97 = hasta 3 % menos).</span></label>
                  <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Costo de cobro de referencia</span>
                    <CampoNumero form="ficha" name="vsml_costo" valor={vs.costo_ref_pct ?? null} tipo="pct" className={`${CAMPO} w-24`} placeholder="0" />
                    <span className="block text-[10px] text-[#5C6B76] mt-0.5">Lo que cuesta el plan sin interés más largo, con IVA.</span></label>
                  <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Tachado de</span>
                    <select form="ficha" name="vsml_canal" defaultValue={vs.canal_tachado ?? ""} className={`${CAMPO} w-full`}>
                      <option value="">Sin tachado</option>
                      {canalesMl.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select></label>
                  <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Comisión si no se sabe</span>
                    <CampoNumero form="ficha" name="vsml_comision" valor={vs.comision_defecto_pct ?? 16.34} tipo="pct" className={`${CAMPO} w-24`} />
                    <span className="block text-[10px] text-[#5C6B76] mt-0.5">Para productos sin publicación en ML.</span></label>
                  <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Promo web</span>
                    <CampoNumero form="ficha" name="vsml_bono" valor={vs.bono_fijo_pct ?? null} tipo="pct" className={`${CAMPO} w-24`} placeholder="0" />
                    <span className="block text-[10px] text-[#5C6B76] mt-0.5">Qué % del cargo fijo por unidad de ML (en los de menos de $ 33.000) se le descuenta al precio, con la cucarda «Promo web».</span></label>
                  <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Promo web desde (unidades en stock)</span>
                    <CampoNumero form="ficha" name="vsml_bono_stock" valor={vs.bono_stock_min ?? null} tipo="entero" className={`${CAMPO} w-24`} placeholder="0" />
                    <span className="block text-[10px] text-[#5C6B76] mt-0.5">Sólo los productos con al menos ese stock en la tienda la tienen (para que no la tengan todos).</span></label>
                  <label><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Promo web: tope</span>
                    <CampoNumero form="ficha" name="vsml_bono_tope" valor={vs.bono_tope_pct ?? null} tipo="pct" className={`${CAMPO} w-24`} placeholder="0" />
                    <span className="block text-[10px] text-[#5C6B76] mt-0.5">La promo nunca pasa de este % del precio de la Clásica (en los baratísimos, el cargo fijo de ML es más que el producto). Vacío: sin tope.</span></label>
                </> : <>
                  <Dato etiqueta="Te tiene que quedar" numero>{vs.objetivo_pct != null ? pct(vs.objetivo_pct) : null}</Dato>
                  <Dato etiqueta="Costo de cobro de referencia" numero>{vs.costo_ref_pct != null ? pct(vs.costo_ref_pct) : null}</Dato>
                  <Dato etiqueta="Tachado de">{vs.canal_tachado ? canalesMl.find((c) => c.id === vs.canal_tachado)?.nombre ?? null : null}</Dato>
                  <Dato etiqueta="Comisión si no se sabe" numero>{vs.comision_defecto_pct != null ? pct(vs.comision_defecto_pct) : null}</Dato>
                  <Dato etiqueta="Promo web" numero>{vs.bono_fijo_pct ? `${pct(vs.bono_fijo_pct)} del cargo fijo` : null}</Dato>
                  <Dato etiqueta="Promo web desde (unidades en stock)" numero>{vs.bono_stock_min ? String(vs.bono_stock_min) : null}</Dato>
                  <Dato etiqueta="Promo web: tope" numero>{vs.bono_tope_pct ? `${pct(vs.bono_tope_pct)} de la Clásica` : null}</Dato>
                </>}
              </div>
            </div>
          </section>

          <form id="ficha" action={accionGuardarFinanciacion}>
            <input type="hidden" name="canal_id" value={tienda.id} />

            <section className="mb-6">
              <TituloSeccion titulo={`Planes de cuotas (${f.planes.length})`} />
              <p className="text-[11px] text-[#5C6B76] mb-2">
                Al pagar se ofrecen todos los planes, cueste lo que cueste la compra. <b>En la tarjeta desde</b> decide sólo qué se muestra debajo del precio: el plan de Payway
                sin interés más largo que llega a ese precio, y los de Mercado Pago, la cucarda «Hasta N cuotas». La ficha muestra todos. Interés 0 = sin interés (el costo del plan lo cubre el precio). El interés se suma al total cuando el comprador paga con tarjeta de crédito en cuotas.
                {editando && " Para sacar un plan, borrá sus cuotas."}
              </p>
              <div className={CAJA_TABLA}>
                <table className={TABLA}>
                  <thead className={THEAD}><tr>
                    <th className={`${TH} text-right`}>Cuotas</th>
                    <th className={TH} title="Payway (cuotas con el interés de esta tabla) o Mercado Pago (el comprador paga ahí, con el interés de Mercado Pago)">Se cobra con</th>
                    <th className={`${TH} text-right`} title="Desde qué precio del producto se muestra en la tarjeta (al pagar se ofrece siempre)">En la tarjeta desde $</th>
                    <th className={`${TH} text-right`} title="Lo que te cobra el banco o la tarjeta por este plan (sólo para comparar)">Costo del plan</th>
                    <th className={`${TH} text-right`} title="Lo que paga de más el comprador (0 = sin interés)">Interés al cliente</th>
                    <th className={`${TH} text-right`} title="El número que se le manda a Payway para este plan (la «Opción en terminal» de su tabla, ej. 13 o 16). Vacío: la cantidad de cuotas">Cód. Payway</th>
                    <th className={TH} title="Entre qué fechas se ofrece (hora argentina). Sin fechas, siempre">Vigencia</th>
                    <th className={TH}>Cómo queda</th>
                  </tr></thead>
                  <tbody>
                    {filas.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>Sin planes: con el lápiz cargás 3, 6, 12 cuotas o las que quieras.</td></tr>}
                    {filas.map((p, i) => editando ? (
                      <tr key={i} className={TR}>
                        <td className={TDN}><CampoNumero name={`cuotas_${i}`} valor={p?.cuotas ?? null} tipo="entero" className={`${CAMPO} w-16`} placeholder={["3", "6", "12", "18"][i] ?? ""} /></td>
                        <td className={TD}><select name={`medio_${i}`} defaultValue={p?.medio ?? "payway"} className={CAMPO}>
                          <option value="payway">Payway</option><option value="mercadopago">Mercado Pago</option></select></td>
                        <td className={TDN}><CampoNumero name={`desde_${i}`} valor={p?.desde ?? null} tipo="pesos" className={`${CAMPO} w-32`} placeholder="0" /></td>
                        <td className={TDN}><CampoNumero name={`costo_${i}`} valor={p?.costo_pct ?? null} tipo="pct" className={`${CAMPO} w-20`} placeholder="0" /></td>
                        <td className={TDN}><CampoNumero name={`interes_${i}`} valor={p?.interes_pct ?? null} tipo="pct" className={`${CAMPO} w-20`} placeholder="0" /></td>
                        <td className={TDN}><CampoNumero name={`codigo_${i}`} valor={p?.codigo_payway ?? null} tipo="entero" className={`${CAMPO} w-16`} placeholder={p ? String(p.cuotas) : ""} /></td>
                        <td className={`${TD} whitespace-nowrap`}>
                          <input type="date" name={`vdesde_${i}`} defaultValue={p?.vigente_desde ?? ""} title="Vale desde" className={`${CAMPO} w-32`} />
                          <span className="mx-1 text-[#5C6B76]">al</span>
                          <input type="date" name={`vhasta_${i}`} defaultValue={p?.vigente_hasta ?? ""} title="Hasta" className={`${CAMPO} w-32`} /></td>
                        <td className={`${TD} text-[#5C6B76]`}>{p ? "" : "Nuevo plan (opcional)"}</td>
                      </tr>
                    ) : p && (
                      <tr key={p.cuotas} className={TR}>
                        <td className={TDN}>{p.cuotas}</td>
                        <td className={TD}>{p.medio === "mercadopago" ? "Mercado Pago" : "Payway"}</td>
                        <td className={TDN}>{p.desde > 0 ? plata(p.desde) : "Todos"}</td>
                        <td className={TDN}>{p.costo_pct ? pct(p.costo_pct) : "—"}</td>
                        <td className={TDN}>{p.medio === "mercadopago" ? <span className="text-[#5C6B76]">Lo cobra MP</span> : p.interes_pct ? pct(p.interes_pct) : "Sin interés"}</td>
                        <td className={TDN}>{p.medio === "mercadopago" ? "—" : p.codigo_payway ?? <span className="text-[#5C6B76]">{p.cuotas}</span>}</td>
                        <td className={`${TD} whitespace-nowrap`}><Vigencia desde={p.vigente_desde} hasta={p.vigente_hasta} /></td>
                        <td className={TD}>
                          {p.medio === "mercadopago" ? <span className="text-[#5C6B76]">El comprador paga el interés de Mercado Pago{tasasMp?.has(p.cuotas) ? ` (hoy, de referencia, ${pct(tasasMp.get(p.cuotas)!)})` : ""}; vos, la comisión de un pago{p.costo_pct ? ` (${pct(p.costo_pct)})` : ""}</span>
                            : p.interes_pct === 0 ? (p.costo_pct ? <span className="text-[#5C6B76]">El {pct(p.costo_pct)} del plan lo cubre el precio</span> : <span className="text-[#5C6B76]">Sin interés</span>)
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
                <div><span className="block text-[11px] font-semibold text-[#5C6B76] mb-0.5">Vigencia</span>
                  {editando ? <span className="whitespace-nowrap">
                    <input type="date" name="descuento_desde" defaultValue={f.descuento_desde ?? ""} title="Vale desde" className={`${CAMPO} w-32`} />
                    <span className="mx-1 text-[#5C6B76]">al</span>
                    <input type="date" name="descuento_hasta" defaultValue={f.descuento_hasta ?? ""} title="Hasta" className={`${CAMPO} w-32`} /></span>
                    : <span className="block py-1.5"><Vigencia desde={f.descuento_desde} hasta={f.descuento_hasta} /></span>}
                  <span className="block text-[10px] text-[#5C6B76]">Sin fechas, no vence nunca.</span></div>
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
                  <thead className={THEAD}><tr><th className={TH}>Producto</th><th className={`${TH} text-right`}>Tachado</th><th className={`${TH} text-right`}>Precio</th><th className={TH}>Debajo del precio</th></tr></thead>
                  <tbody>
                    {ejemplos.map((p) => (
                      <tr key={p.id} className={TR}>
                        <td className={TD}><Link href={`/catalogo/productos/${p.id}`} className="text-[#16577F]">{p.titulo}</Link></td>
                        <td className={`${TDN} text-[#5C6B76]`}>{p.lista > p.venta ? <s>{plata(p.lista)}</s> : null}</td>
                        <td className={TDN}>{plata(p.venta)}{p.lista > p.venta && <span className="block text-[#167655] text-[10px] font-semibold">{Math.round((1 - p.venta / p.lista) * 100)}% OFF</span>}</td>
                        <td className={TD}>
                          <span className="block">{textoTarjeta(hoy, p.venta)}</span>
                          {hoy.descuento_pct > 0 && hoy.medios_descuento.length > 0 && (
                            <span className="block text-[#167655]">{plata(p.venta * (1 - hoy.descuento_pct / 100))} {textoContado(hoy.medios_descuento)}</span>
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

/** «Siempre», «Desde el …», «Hasta el …» o «… al …», con «Vencido» o «Todavía no» (hora argentina). */
function Vigencia({ desde, hasta }: { desde?: string | null; hasta?: string | null }) {
  const hoy = fechaAR(), f = (x: string) => fecha(x + "T12:00");
  const texto = !desde && !hasta ? "Siempre" : desde && hasta ? `${f(desde)} al ${f(hasta)}` : desde ? `Desde el ${f(desde)}` : `Hasta el ${f(hasta!)}`;
  return <>{texto}{hasta && hasta < hoy && <span className="ml-1 font-semibold text-[#8a6100]">Vencido</span>}
    {desde && desde > hoy && <span className="ml-1 font-semibold text-[#8a6100]">Todavía no</span>}</>;
}
