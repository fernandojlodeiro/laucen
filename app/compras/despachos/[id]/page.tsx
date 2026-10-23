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
import LeerDespacho from "./LeerDespacho";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import type { LecturaDespacho } from "@/lib/compras/despacho-leer";
import {
  accionGuardarDespacho, accionAgregarItem, accionGuardarItem, accionBorrarItem, accionAgregarLineaDespacho,
  accionGuardarLineaDespacho, accionBorrarLineaDespacho, accionBorrarDespacho, accionRegistrarDespacho,
  accionAsignarInvoice, accionQuitarInvoice, accionUsarMercaderiaDespacho, accionDespachoABorrador,
} from "../acciones";

export const dynamic = "force-dynamic";
// Leer el PDF con la IA tarda (la acción corre con el tiempo de esta página).
export const maxDuration = 300;

type SP = { editar?: string; q?: string; inactivos?: string; ok?: string; error?: string };

type Item = { concepto: string; importe_ars: number };
type Despacho = {
  id: number; numero: string | null; proveedor_id: number | null; proveedor: string | null; fecha: string; cotizacion: number;
  fob_usd: number; flete_usd: number; seguro_usd: number; gastos: Item[]; impuestos: Item[]; deposito_id: number | null; deposito: string | null;
  estado: string; notas: string | null; registrado_ts: Date | null; emisor_id: number | null; emisor: string | null;
  archivo: string | null; lectura: LecturaDespacho | null;
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
           d.estado, d.notas, d.registrado_ts, d.emisor_id::int, (select coalesce(e.nombre, e.razon_social) from emisor e where e.id = d.emisor_id) emisor,
           d.archivo, d.lectura
      from despacho_importacion d left join proveedor p on p.id = d.proveedor_id left join deposito dep on dep.id = d.deposito_id
     where d.id = $1 and d.organizacion_id = $2`, [did, s.org.id]);
  if (!d) notFound();
  const borrador = d.estado === "borrador";
  const q = sp.q?.trim() ?? "";
  // Los invoices asignados a este despacho y, en borrador, los que se le pueden asignar (los que no tienen despacho).
  const invoices = await consulta<{ id: number; numero: string | null; archivo: string; fecha: string | null; proveedor: string | null; despacho_id: number | null;
    renglones: number; unidades: number; total: number | null; mismo: boolean }>(`
    select i.id::int, i.numero, i.archivo, to_char(i.fecha, 'DD/MM/YYYY') fecha, p.nombre proveedor, i.despacho_id::int,
           (select count(*)::int from compra_invoice_linea l where l.invoice_id = i.id) renglones,
           (select coalesce(sum(l.cantidad), 0)::float from compra_invoice_linea l where l.invoice_id = i.id) unidades,
           (select sum(l.cantidad * l.precio_usd)::float from compra_invoice_linea l where l.invoice_id = i.id) total,
           (i.proveedor_id is not distinct from $3::bigint) mismo
      from compra_invoice i left join proveedor p on p.id = i.proveedor_id
     where i.organizacion_id = $1 and (i.despacho_id = $2 or ($4 and i.despacho_id is null))
     order by (i.despacho_id = $2) desc nulls last, (i.proveedor_id is not distinct from $3::bigint) desc, i.fecha desc nulls last, i.id desc limit 200`,
    [s.org.id, did, d.proveedor_id, d.estado === "borrador"]);
  const asignados = invoices.filter((i) => i.despacho_id === did);
  const libres = invoices.filter((i) => i.despacho_id == null);
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
  // En dólares, los pesos del despacho se dividen por su cotización (la del despacho).
  // Todo en las dos monedas (Fer, 23/10): los pesos y su equivalente en dólares con el dólar del despacho.
  const pesos = (ars: number) => formatear(ars, "ARS");
  const dolares = (ars: number) => (cot > 0 ? formatear(ars / cot, "USD") : "—");
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
            <thead className={THEAD}><tr><th className={TH}>Concepto</th><th className={THN}>Importe ($)</th><th className={THN}>US$</th>{borrador && <th />}</tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>Ninguno.</td></tr>}
              {items.map((g, i) => editar === `${cual[0]}-${i}` ? (
                <tr key={i} className={`${TR} bg-[#FAFBFC]`}>
                  <td colSpan={4} className={TD}>
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
                  <td className={TDN}>{pesos(g.importe_ars)}</td>
                  <td className={TDN}>{dolares(g.importe_ars)}</td>
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
              <tr className={`${TR} font-bold`}><td className={TD}>Total</td><td className={TDN}>{pesos(total)}</td><td className={TDN}>{dolares(total)}</td>{borrador && <td />}</tr>
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
      acciones={borrador ? (
        <>
          {/* La acción final del borrador, arriba a la derecha (AGENTS.md). */}
          <BotonConfirmar accion={accionRegistrarDespacho} campos={{ id: String(did) }} clase={VERDE} texto="Registrar"
            pregunta="¿Registrar? Ingresa el stock y deja el costo puesto en depósito. Después no se puede cambiar." corriendo="Registrando…" />
          <TachoConfirmar accion={accionBorrarDespacho} campos={{ id: String(did) }} pregunta="¿Borrar el borrador?" />
        </>
      ) : d.estado === "registrado" ? (lineas.some((l) => l.variacion_id != null) ? (
        <span className="text-[11px] text-[#5C6B76] self-center max-w-xs text-right">Tiene mercadería con producto: ya entró al stock y no vuelve a borrador.</span>
      ) : (
        <BotonConfirmar accion={accionDespachoABorrador} campos={{ id: String(did) }} clase={SUAVE} texto="Volver a borrador"
          pregunta="¿Volver a borrador? Se anula su asiento; después lo corregís (o lo borrás con el tacho) y lo registrás de nuevo." corriendo="Volviendo…" />
      )) : undefined}>
      <Avisos sp={sp} />

      {borrador && opciones ? (
        // La clave con los datos: después de leer el PDF, los campos muestran lo leído (si no, «Grabar cabecera» volvía a pisar con lo viejo).
        <form key={[d.numero, d.fecha, d.cotizacion, d.flete_usd, d.seguro_usd, d.proveedor_id, d.emisor_id, d.deposito_id].join("|")}
          action={accionGuardarDespacho} className={`${CAJA} grid gap-3 mb-4`}>
          <input type="hidden" name="id" value={did} />
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold">Cabecera</h2><Estado texto={est.texto} tono={est.tono} />
            <span className="ml-auto text-xs text-[#5C6B76]">FOB (suma de las líneas): <b className="tabular-nums">{formatear(calc.fobTotal, "USD")}</b> · {pesos(calc.fobTotal * cot)}</span>
            <button className={PRIMARIO}>Grabar cabecera</button>
          </div>
          <CamposDespacho o={opciones} d={d} />
        </form>
      ) : (
        <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4`}>
          <Dato t="Estado"><Estado texto={est.texto} tono={est.tono} />{d.registrado_ts && <div className="text-[#5C6B76]">{fechaHora(d.registrado_ts)}</div>}</Dato>
          <Dato t="Proveedor">{d.proveedor ?? "—"}</Dato>
          <Dato t="Cotización">{cot.toLocaleString("es-AR")}</Dato>
          <Dato t="Depósito">{d.deposito ?? "—"}</Dato>
          <Dato t="FOB">{formatear(d.fob_usd, "USD")}<div className="text-[#5C6B76]">{pesos(d.fob_usd * cot)}</div></Dato>
          <Dato t="Flete">{formatear(d.flete_usd, "USD")}<div className="text-[#5C6B76]">{pesos(d.flete_usd * cot)}</div></Dato>
          <Dato t="Seguro">{formatear(d.seguro_usd, "USD")}<div className="text-[#5C6B76]">{pesos(d.seguro_usd * cot)}</div></Dato>
          {d.notas && <Dato t="Notas">{d.notas}</Dato>}
        </div>
      )}

      {borrador && <LeerDespacho organizacionId={s.org.id} despachoId={did} leido={d.archivo} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <TablaItems cual="gastos" titulo="Gastos (suman al costo)" ayuda="En pesos: derechos, tasa estadística, despachante, depósito fiscal, flete interno…" />
        <TablaItems cual="impuestos" titulo="Impuestos (crédito fiscal, no costo)" ayuda="En pesos: IVA, IVA adicional, Ganancias, IIBB." />
      </div>

      {/* La mercadería (Fer, 23/10): de los invoices del proveedor asignados al despacho, de lo que leyó la IA del despacho o a mano. */}
      <h2 className="text-sm font-bold mb-1">Mercadería: invoices del proveedor ({asignados.length})</h2>
      <p className="text-[11px] text-[#5C6B76] mb-1">Asignar un invoice pasa sus renglones a las líneas, con su producto, cantidad y precio (el FOB). El despacho se puede registrar sin invoices: con la mercadería que leyó la IA del despacho o con líneas cargadas a mano.</p>
      <div className={`${CAJA_TABLA} mb-2`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Invoice</th><th className={TH}>Fecha</th><th className={TH}>Proveedor</th><th className={THN}>Renglones</th><th className={THN}>Unidades</th><th className={THN}>Total</th>{borrador && <th />}</tr></thead>
          <tbody>
            {asignados.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Ningún invoice asignado.</td></tr>}
            {asignados.map((i) => (
              <tr key={i.id} className={TR}>
                <td className={TD}><Link href={`/compras/invoices/${i.id}`} className="text-[#16577F] hover:underline">{i.numero ?? i.archivo}</Link></td>
                <td className={TD}>{i.fecha ?? "—"}</td><td className={TD}>{i.proveedor ?? "—"}</td>
                <td className={TDN}>{i.renglones}</td><td className={TDN}>{i.unidades.toLocaleString("es-AR")}</td><td className={TDN}>{formatear(i.total, "USD")}</td>
                {borrador && <td className={`${TD} text-right`}><TachoConfirmar accion={accionQuitarInvoice} campos={{ despacho: String(did), invoice: String(i.id) }} pregunta="¿Quitarlo? Se borran sus líneas." /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {borrador && (
        <form action={accionAsignarInvoice} className="flex flex-wrap items-end gap-2 mb-3">
          <input type="hidden" name="despacho" value={did} />
          <div className="min-w-72 flex-1 max-w-xl"><span className={ETIQUETA}>Asignar un invoice (los que no están en ningún despacho; primero los del proveedor)</span>
            <ElegirDeLista name="invoice" opciones={libres.map((i) => ({ id: i.id, texto: `${i.numero ?? i.archivo}${i.fecha ? ` · ${i.fecha}` : ""}`,
              detalle: [i.proveedor, `${i.renglones} renglones`, i.total != null ? formatear(i.total, "USD") : "sin precio"].filter(Boolean).join(" · ") }))}
              vacio="Elegí el invoice" placeholder="Buscá el invoice…" etiqueta="Invoice" /></div>
          <BotonEnviar clase={PRIMARIO} corriendo="Asignando…">Asignar</BotonEnviar>
        </form>
      )}
      {d.lectura && d.lectura.items.length > 0 && (() => {
        const fobLeido = d.lectura.items.reduce((t, i) => t + Number(i.cantidad) * Number(i.fob_unit_usd), 0);
        return (
          <div className={`${CAJA} mb-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="text-xs font-bold">Mercadería según el despacho ({d.lectura.items.length})</h3>
              {borrador && lineas.length === 0 && (
                <BotonConfirmar accion={accionUsarMercaderiaDespacho} campos={{ despacho: String(did) }} clase={SUAVE} texto="Usar como líneas"
                  pregunta="¿Cargar esta mercadería como líneas? Quedan sin producto: no entran al stock." corriendo="Cargando…" />
              )}
            </div>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Descripción</th><th className={TH}>NCM</th><th className={THN}>Cant.</th><th className={THN}>FOB unit.</th><th className={THN}>FOB total</th></tr></thead>
              <tbody>
                {d.lectura.items.map((i, k) => (
                  <tr key={k} className={TR}>
                    <td className={TD}>{i.descripcion}</td><td className={`${TD} font-mono`}>{i.ncm ?? "—"}</td>
                    <td className={TDN}>{Number(i.cantidad).toLocaleString("es-AR")}</td><td className={TDN}>{formatear(Number(i.fob_unit_usd), "USD")}</td>
                    <td className={TDN}>{formatear(Number(i.cantidad) * Number(i.fob_unit_usd), "USD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lineas.length > 0 && Math.abs(fobLeido - calc.fobTotal) > 1 && (
              <p className="text-[11px] mt-1 rounded-lg px-2 py-1 bg-[#FFF8E5] text-[#8a6100]">
                Las líneas suman {formatear(calc.fobTotal, "USD")} de FOB y el despacho dice {formatear(fobLeido, "USD")}: revisá que estén todos los invoices.
              </p>
            )}
          </div>
        );
      })()}

      <h2 className="text-sm font-bold mb-2">Líneas</h2>
      <div className={`${CAJA_TABLA} mb-3`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Descripción</th><th className={TH}>NCM</th><th className={THN}>Cantidad</th><th className={THN}>FOB unit. (US$)</th><th className={THN}>FOB total (US$)</th><th className={THN}>FOB total ($)</th>{borrador && <th />}</tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Todavía no hay líneas.</td></tr>}
            {lineas.map((l) => editar === `l-${l.id}` ? (
              <tr key={l.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={7} className={TD}>
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
                <td className={TDN}>{pesos(l.cantidad * l.fob_unit_usd * cot)}</td>
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
              <th className={THN}>Costo unit. ($)</th><th className={THN}>Costo unit. (US$)</th><th className={THN}>Costo total ($)</th><th className={THN}>Costo total (US$)</th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Sin líneas.</td></tr>}
            {lineas.map((l) => (
              <tr key={l.id} className={TR}>
                <td className={TD}>{l.descripcion}</td>
                <td className={TDN}>{l.cantidad.toLocaleString("es-AR")}</td>
                <td className={TDN}>{calc.fobTotal > 0 ? pct((l.cantidad * l.fob_unit_usd * 100) / calc.fobTotal) : "—"}</td>
                <td className={TDN}>{pesos(unitArs(l))}</td>
                <td className={TDN}>{formatear(unitUsd(l), "USD")}</td>
                <td className={TDN}>{pesos(unitArs(l) * l.cantidad)}</td>
                <td className={TDN}>{formatear(unitUsd(l) * l.cantidad, "USD")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`${CAJA} text-xs grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 max-w-lg mb-4`}>
        <span /><span className="text-right text-[#5C6B76]">$</span><span className="text-right text-[#5C6B76]">US$</span>
        <span className="text-[#5C6B76]">FOB (dólar del despacho: {cot.toLocaleString("es-AR")})</span>
        <span className="text-right tabular-nums">{pesos(calc.fobTotal * cot)}</span><span className="text-right tabular-nums">{dolares(calc.fobTotal * cot)}</span>
        <span className="text-[#5C6B76]">Flete y seguro</span>
        <span className="text-right tabular-nums">{pesos((d.flete_usd + d.seguro_usd) * cot)}</span><span className="text-right tabular-nums">{dolares((d.flete_usd + d.seguro_usd) * cot)}</span>
        <span className="text-[#5C6B76]">Gastos</span>
        <span className="text-right tabular-nums">{pesos(gastosArs)}</span><span className="text-right tabular-nums">{dolares(gastosArs)}</span>
        <span className="font-bold">Costo total puesto en depósito</span>
        <span className="text-right tabular-nums font-bold">{pesos(calc.costoTotalArs)}</span><span className="text-right tabular-nums font-bold">{dolares(calc.costoTotalArs)}</span>
        <span className="text-[#5C6B76]">Impuestos (crédito fiscal, aparte)</span>
        <span className="text-right tabular-nums">{pesos(impuestosArs)}</span><span className="text-right tabular-nums">{dolares(impuestosArs)}</span>
      </div>

      {borrador && (
        <p className="text-[11px] text-[#5C6B76] mb-3">«Registrar» (arriba a la derecha) ingresa el stock al depósito y deja el costo puesto en depósito de cada producto.</p>
      )}
      <p className="text-[11px] text-[#5C6B76]">
        La factura del proveedor del exterior y las del despachante se cargan en <Link href="/compras/facturas" className="text-[#16577F] hover:underline">Facturas de compra</Link> (sin
        productos): van contra “Importaciones en curso”.
      </p>
    </Pantalla>
  );
}
