// Detalle de un despacho de importación. En borrador: cabecera, gastos e
// impuestos (en pesos) y líneas, todo editable en la fila, y el prorrateo en
// vivo (calcularDespacho): costo unitario puesto en depósito de cada línea.
// "Registrar" ingresa el stock y deja el costo. Registrado: sólo lectura.

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { calcularDespacho } from "@/lib/administracion/compras";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { TachoConfirmar, BotonConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, Estado, Lapiz, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha as fechaAR, fechaHora } from "@/app/ventas/formato";
import { ESTADO_DESPACHO, buscarVariaciones, pct } from "../../comun";
import { verInactivos, MostrarInactivos } from "@/app/componentes/Inactivos";
import { CamposDespacho, opcionesDespacho } from "../Cabecera";
import {
  accionGuardarDespacho, accionAgregarItem, accionGuardarItem, accionBorrarItem, accionAgregarLineaDespacho,
  accionGuardarLineaDespacho, accionBorrarLineaDespacho, accionBorrarDespacho, accionRegistrarDespacho,
} from "../acciones";

export const dynamic = "force-dynamic";

type SP = { editar?: string; q?: string; inactivos?: string; ok?: string; error?: string };

type Item = { concepto: string; importe_ars: number };
type Despacho = {
  id: number; numero: string | null; proveedor_id: number | null; proveedor: string | null; fecha: string; cotizacion: number;
  fob_usd: number; flete_usd: number; seguro_usd: number; gastos: Item[]; impuestos: Item[]; deposito_id: number | null; deposito: string | null;
  estado: string; notas: string | null; registrado_ts: Date | null;
};
type Linea = {
  id: number; variacion_id: number | null; descripcion: string; ncm: string | null; cantidad: number; fob_unit_usd: number;
  costo_unit_ars: number | null; costo_unit_usd: number | null;
};

const CONCEPTOS = {
  gastos: ["Derechos de importación", "Tasa estadística", "Despachante", "Depósito fiscal", "Flete interno", "Gastos bancarios"],
  impuestos: ["IVA", "IVA adicional", "Ganancias", "IIBB"],
};

export default async function DetalleDespacho({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("despachos_ver");
  const sp = await searchParams;
  const did = Number((await params).id);
  if (!Number.isInteger(did) || did <= 0) notFound();
  const d = await una<Despacho>(`
    select d.id::int, d.numero, d.proveedor_id::int, p.nombre proveedor, to_char(d.fecha, 'YYYY-MM-DD') fecha, d.cotizacion::float,
           d.fob_usd::float, d.flete_usd::float, d.seguro_usd::float, d.gastos, d.impuestos, d.deposito_id::int, dep.nombre deposito,
           d.estado, d.notas, d.registrado_ts
      from despacho_importacion d left join proveedor p on p.id = d.proveedor_id left join deposito dep on dep.id = d.deposito_id
     where d.id = $1 and d.organizacion_id = $2`, [did, s.org.id]);
  if (!d) notFound();
  const borrador = d.estado === "borrador";
  const q = sp.q?.trim() ?? "";
  const [lineas, calc, opciones, encontradas] = await Promise.all([
    consulta<Linea>(`
      select id::int, variacion_id::int, descripcion, ncm, cantidad, fob_unit_usd::float, costo_unit_ars::float, costo_unit_usd::float
        from despacho_linea where despacho_id = $1 and organizacion_id = $2 order by orden, id`, [did, s.org.id]),
    calcularDespacho(s.org.id, did),
    borrador ? opcionesDespacho(s.org.id) : null,
    borrador ? buscarVariaciones(s.org.id, q, verInactivos(sp)) : [],
  ]);
  const editar = borrador ? sp.editar ?? "" : "";
  const aqui = (extra: Record<string, string | number | null> = {}) => url(`/compras/despachos/${did}`, { q: q || null, ...extra });
  const est = ESTADO_DESPACHO[d.estado] ?? ESTADO_DESPACHO.borrador;
  const cot = d.cotizacion;
  const gastosArs = d.gastos.reduce((t, g) => t + Number(g.importe_ars || 0), 0);
  const impuestosArs = d.impuestos.reduce((t, g) => t + Number(g.importe_ars || 0), 0);
  // Registrado: el costo que quedó guardado; borrador: el cálculo en vivo.
  const costoDe = new Map(calc.lineas.map((l) => [l.id, l]));
  const unitArs = (l: Linea) => (borrador ? costoDe.get(l.id)?.costoUnitArs : l.costo_unit_ars) ?? 0;
  const unitUsd = (l: Linea) => (borrador ? costoDe.get(l.id)?.costoUnitUsd : l.costo_unit_usd) ?? 0;
  const Dato = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <div><span className={ETIQUETA}>{t}</span><div className="text-xs">{children}</div></div>
  );

  /** Tabla de gastos o de impuestos: renglones editables en la fila. */
  const TablaItems = ({ cual, titulo, ayuda }: { cual: "gastos" | "impuestos"; titulo: string; ayuda: string }) => {
    const items = d[cual];
    const total = cual === "gastos" ? gastosArs : impuestosArs;
    return (
      <div>
        <h2 className="text-sm font-bold">{titulo}</h2>
        <p className="text-[11px] text-[#5C6B76] mb-1">{ayuda}</p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Concepto</th><th className={THN}>Importe ($)</th>{borrador && <th />}</tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Ninguno.</td></tr>}
              {items.map((g, i) => editar === `${cual[0]}-${i}` ? (
                <tr key={i} className={`${TR} bg-[#FAFBFC]`}>
                  <td colSpan={3} className={TD}>
                    <form action={accionGuardarItem} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="despacho" value={did} /><input type="hidden" name="lista" value={cual} /><input type="hidden" name="indice" value={i} />
                      <input name="concepto" defaultValue={g.concepto} list={`conceptos-${cual}`} className={`${CAMPO} flex-1 min-w-32`} aria-label="Concepto" autoFocus />
                      <CampoNumero name="importe_ars" valor={Number(g.importe_ars)} tipo="pesos" className={`${CAMPO} w-28`} />
                      <button className={VERDE}>Guardar</button>
                      <Link href={aqui()} className={SUAVE} scroll={false}>Cancelar</Link>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={i} className={TR}>
                  <td className={TD}>{g.concepto}</td>
                  <td className={TDN}>{formatear(g.importe_ars, "ARS")}</td>
                  {borrador && (
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <span className="inline-flex gap-1">
                        <Lapiz href={aqui({ editar: `${cual[0]}-${i}` })} />
                        <TachoConfirmar accion={accionBorrarItem} campos={{ despacho: String(did), lista: cual, indice: String(i) }} pregunta="¿Borrar?" />
                      </span>
                    </td>
                  )}
                </tr>
              ))}
              <tr className={`${TR} font-bold`}><td className={TD}>Total</td><td className={TDN}>{formatear(total, "ARS")}</td>{borrador && <td />}</tr>
            </tbody>
          </table>
        </div>
        {borrador && (
          <form action={accionAgregarItem} className="flex flex-wrap items-center gap-2 mt-2">
            <input type="hidden" name="despacho" value={did} /><input type="hidden" name="lista" value={cual} />
            <input name="concepto" list={`conceptos-${cual}`} placeholder="Concepto" className={`${CAMPO} flex-1 min-w-32`} />
            <CampoNumero name="importe_ars" valor={null} tipo="pesos" placeholder="$" className={`${CAMPO} w-28`} />
            <button className={PRIMARIO}>Agregar</button>
          </form>
        )}
        <datalist id={`conceptos-${cual}`}>{CONCEPTOS[cual].map((c) => <option key={c} value={c} />)}</datalist>
      </div>
    );
  };

  return (
    <Pantalla ancho="max-w-6xl"
      titulo={<>Despacho <span className="font-mono">{d.numero ?? `#${d.id} (sin número)`}</span></>}
      camino={[{ texto: d.numero ?? `#${d.id}` }]}
      subtitulo={<>{fechaAR(d.fecha)}{d.proveedor ? ` · ${d.proveedor}` : ""}</>}
      acciones={borrador ? <TachoConfirmar accion={accionBorrarDespacho} campos={{ id: String(did) }} pregunta="¿Borrar el borrador?" /> : undefined}>
      <Avisos sp={sp} />

      {borrador && opciones ? (
        <form action={accionGuardarDespacho} className={`${CAJA} grid gap-3 mb-4`}>
          <input type="hidden" name="id" value={did} />
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold">Cabecera</h2><Estado texto={est.texto} tono={est.tono} />
            <span className="ml-auto text-xs text-[#5C6B76]">FOB (suma de las líneas): <b className="tabular-nums">{formatear(calc.fobTotal, "USD")}</b></span>
          </div>
          <CamposDespacho o={opciones} d={d} />
          <div><BotonEnviar clase={PRIMARIO} corriendo="Guardando…">Guardar cabecera</BotonEnviar></div>
        </form>
      ) : (
        <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4`}>
          <Dato t="Estado"><Estado texto={est.texto} tono={est.tono} />{d.registrado_ts && <div className="text-[#5C6B76]">{fechaHora(d.registrado_ts)}</div>}</Dato>
          <Dato t="Proveedor">{d.proveedor ?? "—"}</Dato>
          <Dato t="Cotización">{cot.toLocaleString("es-AR")}</Dato>
          <Dato t="Depósito">{d.deposito ?? "—"}</Dato>
          <Dato t="FOB">{formatear(d.fob_usd, "USD")}</Dato>
          <Dato t="Flete">{formatear(d.flete_usd, "USD")}</Dato>
          <Dato t="Seguro">{formatear(d.seguro_usd, "USD")}</Dato>
          {d.notas && <Dato t="Notas">{d.notas}</Dato>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <TablaItems cual="gastos" titulo="Gastos (suman al costo)" ayuda="En pesos: derechos, tasa estadística, despachante, depósito fiscal, flete interno…" />
        <TablaItems cual="impuestos" titulo="Impuestos (crédito fiscal, no costo)" ayuda="En pesos: IVA, IVA adicional, Ganancias, IIBB." />
      </div>

      <h2 className="text-sm font-bold mb-2">Líneas</h2>
      <div className={`${CAJA_TABLA} mb-3`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Descripción</th><th className={TH}>NCM</th><th className={THN}>Cantidad</th><th className={THN}>FOB unit.</th><th className={THN}>FOB total</th>{borrador && <th />}</tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Todavía no hay líneas.</td></tr>}
            {lineas.map((l) => editar === `l-${l.id}` ? (
              <tr key={l.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={6} className={TD}>
                  <form action={accionGuardarLineaDespacho} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={l.id} /><input type="hidden" name="despacho" value={did} />
                    <input name="descripcion" defaultValue={l.descripcion} className={`${CAMPO} flex-1 min-w-48`} aria-label="Descripción" autoFocus />
                    <input name="ncm" defaultValue={l.ncm ?? ""} placeholder="NCM" className={`${CAMPO} w-28 font-mono`} />
                    <CampoNumero name="cantidad" valor={l.cantidad} tipo="entero" className={`${CAMPO} w-20`} placeholder="Cantidad" />
                    <CampoNumero name="fob_unit_usd" valor={l.fob_unit_usd} tipo="decimal" className={`${CAMPO} w-24`} placeholder="FOB unit." />
                    <button className={VERDE}>Guardar</button>
                    <Link href={aqui()} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className={TR}>
                <td className={TD}>{l.descripcion}{!l.variacion_id && <span className="text-[10px] text-[#5C6B76]"> (sin producto: no entra al stock)</span>}</td>
                <td className={`${TD} font-mono`}>{l.ncm ?? "—"}</td>
                <td className={TDN}>{l.cantidad.toLocaleString("es-AR")}</td>
                <td className={TDN}>{formatear(l.fob_unit_usd, "USD")}</td>
                <td className={TDN}>{formatear(l.cantidad * l.fob_unit_usd, "USD")}</td>
                {borrador && (
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <span className="inline-flex gap-1">
                      <Lapiz href={aqui({ editar: `l-${l.id}` })} />
                      <TachoConfirmar accion={accionBorrarLineaDespacho} campos={{ id: String(l.id), despacho: String(did) }} pregunta="¿Borrar?" />
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {borrador && (
        <div className={`${CAJA} mb-4 grid gap-2`}>
          <h3 className="text-xs font-bold">Agregar línea</h3>
          <form className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-48"><span className={ETIQUETA}>Buscar producto por SKU, código o título</span>
              <input name="q" defaultValue={q} className={`${CAMPO} w-full`} /></label>
            <MostrarInactivos activo={verInactivos(sp)} />
            <button className={SUAVE}>Buscar</button>
          </form>
          <form action={accionAgregarLineaDespacho} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="despacho" value={did} />
            <label className="min-w-56 flex-1"><span className={ETIQUETA}>Producto</span>
              <select name="variacion" defaultValue={encontradas.length === 1 ? encontradas[0].id : ""} className={`${CAMPO} w-full`}>
                <option value="">— Línea libre (sin producto: no entra al stock) —</option>
                {encontradas.map((v) => <option key={v.id} value={v.id}>{v.sku} · {v.titulo}</option>)}
              </select></label>
            <label className="min-w-40 flex-1"><span className={ETIQUETA}>Descripción (si es libre)</span>
              <input name="descripcion" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>NCM</span><input name="ncm" className={`${CAMPO} w-28 font-mono`} /></label>
            <label><span className={ETIQUETA}>Cantidad</span><CampoNumero name="cantidad" valor={null} tipo="entero" className={`${CAMPO} w-20`} /></label>
            <label><span className={ETIQUETA}>FOB unit. (US$)</span><CampoNumero name="fob_unit_usd" valor={null} tipo="decimal" className={`${CAMPO} w-24`} /></label>
            <BotonEnviar clase={PRIMARIO} corriendo="Agregando…">Agregar</BotonEnviar>
          </form>
          {q && encontradas.length === 0 && <p className="text-[11px] text-[#8a6100]">No hay productos con “{q}”.</p>}
        </div>
      )}

      <h2 className="text-sm font-bold mb-1">Prorrateo: costo puesto en depósito</h2>
      <p className="text-[11px] text-[#5C6B76] mb-1">
        Flete, seguro y gastos se reparten entre las líneas según su FOB. {borrador ? "Se recalcula con cada cambio." : "Es el costo que quedó al registrar."}
      </p>
      <div className={`${CAJA_TABLA} mb-3`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Descripción</th><th className={THN}>Cantidad</th><th className={THN}>Parte del FOB</th>
              <th className={THN}>Costo unit. ($)</th><th className={THN}>Costo unit. (US$)</th><th className={THN}>Costo total ($)</th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Sin líneas.</td></tr>}
            {lineas.map((l) => (
              <tr key={l.id} className={TR}>
                <td className={TD}>{l.descripcion}</td>
                <td className={TDN}>{l.cantidad.toLocaleString("es-AR")}</td>
                <td className={TDN}>{calc.fobTotal > 0 ? pct((l.cantidad * l.fob_unit_usd * 100) / calc.fobTotal) : "—"}</td>
                <td className={TDN}>{formatear(unitArs(l), "ARS")}</td>
                <td className={TDN}>{formatear(unitUsd(l), "USD")}</td>
                <td className={TDN}>{formatear(unitArs(l) * l.cantidad, "ARS")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`${CAJA} text-xs grid grid-cols-[1fr_auto] gap-y-1 max-w-md mb-4`}>
        <span className="text-[#5C6B76]">FOB {formatear(calc.fobTotal, "USD")} × {cot.toLocaleString("es-AR")}</span>
        <span className="text-right tabular-nums">{formatear(calc.fobTotal * cot, "ARS")}</span>
        <span className="text-[#5C6B76]">Flete y seguro {formatear(d.flete_usd + d.seguro_usd, "USD")}</span>
        <span className="text-right tabular-nums">{formatear((d.flete_usd + d.seguro_usd) * cot, "ARS")}</span>
        <span className="text-[#5C6B76]">Gastos</span><span className="text-right tabular-nums">{formatear(gastosArs, "ARS")}</span>
        <span className="font-bold">Costo total puesto en depósito</span>
        <span className="text-right tabular-nums font-bold">{formatear(calc.costoTotalArs, "ARS")}</span>
        <span className="text-[#5C6B76]">En dólares</span><span className="text-right tabular-nums">{formatear(cot ? calc.costoTotalArs / cot : null, "USD")}</span>
        <span className="text-[#5C6B76]">Impuestos (crédito fiscal, aparte)</span><span className="text-right tabular-nums">{formatear(impuestosArs, "ARS")}</span>
      </div>

      {borrador && (
        <div className="grid gap-1 justify-items-start mb-3">
          <BotonConfirmar accion={accionRegistrarDespacho} campos={{ id: String(did) }} clase={VERDE} texto="Registrar"
            pregunta="¿Registrar? Después no se puede cambiar." corriendo="Registrando…" />
          <p className="text-[11px] text-[#5C6B76]">Ingresa el stock al depósito y deja el costo puesto en depósito de cada producto.</p>
        </div>
      )}
      <p className="text-[11px] text-[#5C6B76]">
        La factura del proveedor del exterior y las del despachante se cargan en <Link href="/compras/facturas" className="text-[#16577F] hover:underline">Facturas de compra</Link> (sin
        productos): van contra “Importaciones en curso”.
      </p>
    </Pantalla>
  );
}
