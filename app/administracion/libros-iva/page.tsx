// Administración → Libros de IVA: el Libro IVA Ventas y el Libro IVA Compras
// de un mes (o de un rango a mano), con el neto gravado y el IVA por
// alícuota, percepciones y total de cada comprobante (las notas de crédito
// restan; la moneda extranjera, a la cotización del comprobante), los totales,
// el resumen del mes (débito − crédito = saldo técnico), los avisos de lo que
// conviene revisar, el Excel de cada libro y los archivos del Libro de IVA
// Digital de ARCA. Las cuentas están en lib/administracion/libro-iva.ts.

import Link from "next/link";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { conexionDrive, rutasDe } from "@/lib/google/drive";
import { accionMandarAlDrive, accionImportarVentasExternas, accionImportarComprasExternas } from "./acciones";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { resumenVentasExternas } from "@/lib/administracion/ventas-externas";
import { resumenComprasExternas } from "@/lib/administracion/compras-externas";
import Pestanas from "@/app/componentes/Pestanas";
import RangoFechas from "@/app/componentes/RangoFechas";
import { Paginado } from "@/app/componentes/Lista";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, url, CAMPO, ETIQUETA, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { Desplegable } from "@/app/informes/Filtros";
import { paginarEnMemoria } from "@/lib/lista";
import {
  armarLibro, enDolaresCbte, alicuotasUsadas, resumenIva, archivosLibroIvaDigital, textoComprobante, ivaTotal, netoTotal,
  type FilaLibro, type ImportesLibro, type Alicuota,
} from "@/lib/administracion/libro-iva";
import { libroIvaPeriodo, canalesConVentas, type AvisoLibro } from "@/lib/administracion/libro-iva-base";
import { elegirRazonSocial, nombreRs } from "@/lib/razon-social";
import SelectorRazonSocial from "@/app/componentes/SelectorRazonSocial";
import { periodoDe, mesesParaElegir, nombreMes, canalDe, type SPLibro } from "./comun";
import { ventasPorProvincia, PROVINCIA_POR_DEFECTO, type FilaProvincia } from "@/lib/administracion/ventas-provincia";
import { enviosDelMes, liquidacionDelMes, type EnvioLibro } from "@/lib/administracion/libro-iva-drive";
import { posicionMes, type PosicionDelMes } from "@/lib/impuestos/posicion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "/administracion/libros-iva";
const n2 = (x: number, cero = "") => (x === 0 ? cero : x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const plata = (signo: string) => (x: number) => `${signo} ${n2(x, "0,00")}`;
const pct = (k: number) => `${String(k).replace(".", ",")} %`;
const fechaAr = (f: string) => f.split("-").reverse().join("/");
const IMPORTAR = "Importar ventas o compras anteriores";
const CLAVE_IMPORTAR = "importar-anteriores";
const DOC: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 99: "Sin identificar" };

export default async function LibrosIva({ searchParams }: { searchParams: Promise<SPLibro> }) {
  const s = await entrarErp("libros_iva_ver");
  const sp = await searchParams;
  const org = s.org.id;
  const { desde, hasta, periodo } = periodoDe(sp);
  const libro = sp.libro === "compras" || sp.libro === "avisos" || sp.libro === "provincias" ? sp.libro : "ventas";
  const canal = canalDe(sp);
  // Cada razón social presenta su libro de IVA: se mira de una sola (la principal, sin elegir).
  const rs = await elegirRazonSocial(org, sp.rs, { todas: false });
  const [{ ventas, compras, avisos }, canales, drive, rutas, externas, externasCompras] = await Promise.all([libroIvaPeriodo(org, desde, hasta, rs.id), canalesConVentas(org), conexionDrive(org), rutasDe(org), resumenVentasExternas(org), resumenComprasExternas(org)]);

  // En dólares se mira el mismo libro con cada comprobante al dólar de su día (los archivos para ARCA siguen en pesos).
  const enDolares = s.moneda === "USD";
  const ventasV = enDolares ? ventas.map(enDolaresCbte) : ventas;
  const comprasV = enDolares ? compras.map(enDolaresCbte) : compras;
  const libroVentas = armarLibro(ventasV);
  const libroCompras = armarLibro(comprasV);
  const ventasCanal = canal ? armarLibro(ventasV.filter((v) => v.canalId === canal)) : libroVentas;
  const resumen = resumenIva(libroVentas.totales, libroCompras.totales);
  const archivos = periodo && /^\d{6}$/.test(periodo) ? archivosLibroIvaDigital(periodo, ventas, compras) : null;
  const provincias = await ventasPorProvincia(org, ventas);

  const filtros = { mes: sp.mes, desde: sp.desde, hasta: sp.hasta, rs: rs.multi && rs.id ? String(rs.id) : undefined };
  const mesElegido = periodo && /^\d{6}$/.test(periodo) ? `${periodo.slice(0, 4)}-${periodo.slice(4)}` : "";
  const meses = mesesParaElegir();
  const titulo = mesElegido ? nombreMes(mesElegido) : `${fechaAr(desde)} al ${fechaAr(hasta)}`;
  const [envios, liquidacion, posicion] = mesElegido && rs.id
    ? await Promise.all([enviosDelMes(org, rs.id, mesElegido), liquidacionDelMes(org, rs.id, mesElegido), posicionMes(org, rs.id, mesElegido).catch(() => null)])
    : [[] as EnvioLibro[], null, null];

  return (
    <Pantalla titulo="Libros de IVA" ancho="max-w-[1400px]"
      subtitulo="Libro IVA Ventas y Libro IVA Compras: comprobantes del período por fecha, con neto gravado e IVA por alícuota. Las notas de crédito restan; lo que está en dólares va a la cotización del comprobante."
      acciones={<>
        {libro === "provincias" && <a href={url(`${BASE}/provincias`, filtros)} className={VERDE}>Descargar Excel</a>}
        {(libro === "ventas" || libro === "compras") && <a href={url(`${BASE}/excel`, { ...filtros, libro, canal: libro === "ventas" ? sp.canal : undefined })} className={VERDE}>Descargar Excel</a>}
        <BotonNuevo texto={IMPORTAR} clave={CLAVE_IMPORTAR} />
      </>}>
      <Avisos sp={sp} />
      <AltaNueva texto={IMPORTAR} clave={CLAVE_IMPORTAR} sinBoton>
        <h3 className="text-xs font-bold mb-1">Ventas facturadas con otro sistema</h3>
        <form action={accionImportarVentasExternas} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="volver" value={url(BASE, filtros)} />
          <ElegirRs rs={rs} />
          <label><span className={ETIQUETA}>Sistema</span><input name="sistema" defaultValue="Virtual Seller" className={CAMPO} /></label>
          <label><span className={ETIQUETA}>TXT de comprobantes de ventas</span><input type="file" name="comprobantes" required accept=".txt,text/plain" className="text-xs" /></label>
          <label><span className={ETIQUETA}>TXT de alícuotas de ventas</span><input type="file" name="alicuotas" required accept=".txt,text/plain" className="text-xs" /></label>
          <BotonEnviar clase={PRIMARIO} corriendo="Importando…">Importar ventas</BotonEnviar>
          <p className="w-full text-[11px] text-[#5C6B76]">
            Los dos archivos del Libro de IVA Digital de ventas que exporta el otro sistema, del mismo período. Lo que también está en Laucen (mismo tipo, punto de venta y número)
            se saltea; volver a importar el mismo período reemplaza lo anterior, no duplica.
          </p>
        </form>
        <h3 className="text-xs font-bold mt-3 mb-1 border-t border-[#E3E9F0] pt-3">Compras de antes de cargarlas en Laucen</h3>
        <form action={accionImportarComprasExternas} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="volver" value={url(BASE, { ...filtros, libro: "compras" })} />
          <ElegirRs rs={rs} />
          <label><span className={ETIQUETA}>Mis Comprobantes – Recibidos de ARCA (.xlsx o .csv; podés elegir varios)</span>
            <input type="file" name="archivo" multiple required accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="text-xs" /></label>
          <BotonEnviar clase={PRIMARIO} corriendo="Importando…">Importar compras</BotonEnviar>
          <p className="w-full text-[11px] text-[#5C6B76]">
            Entran sólo al libro de IVA (no son facturas de compra: no generan deuda con el proveedor ni asiento). Lo que ya está cargado como factura de compra se saltea;
            volver a importar reemplaza, no duplica.
          </p>
        </form>
        {(externas.length > 0 || externasCompras.length > 0) && (
          <ul className="mt-2 text-[11px] text-[#5C6B76]">
            {[...externas.map((x) => ({ ...x, que: "ventas" })), ...externasCompras.map((x) => ({ ...x, que: "compras" }))].map((x) => (
              <li key={`${x.que}${x.emisor_id}${x.sistema}`}>Ya importado: {x.que} · {(() => { const r = rs.razones.find((y) => y.id === x.emisor_id); return r ? nombreRs(r) : `Razón social ${x.emisor_id}`; })()} · {x.sistema} · {x.n.toLocaleString("es-AR")} comprobantes del {fechaAr(x.desde)} al {fechaAr(x.hasta)}</li>
            ))}
          </ul>
        )}
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {rs.multi && <SelectorRazonSocial razones={rs.razones.map((x) => ({ id: x.id, nombre: nombreRs(x) }))} valor={rs.id} todas={false} />}
        <Desplegable parametro="mes" etiqueta="Mes" valor={mesElegido} limpiar={["desde", "hasta", "p"]}
          opciones={[...(mesElegido && meses.includes(mesElegido) ? [] : [{ valor: mesElegido, texto: mesElegido ? nombreMes(mesElegido) : "Personalizado" }]),
            ...meses.map((m) => ({ valor: m, texto: nombreMes(m) }))]} />
        <RangoFechas desde={desde} hasta={hasta} etiqueta="Fechas" limpiar={["mes", "p"]} />
        {libro === "ventas" && canales.length > 0 && (
          <Desplegable parametro="canal" etiqueta="Canal" valor={sp.canal ?? ""} limpiar={["p"]}
            opciones={[{ valor: "", texto: "Todos" }, ...canales.map((c) => ({ valor: String(c.id), texto: c.nombre }))]} />
        )}
      </div>

      <Resumen r={resumen} titulo={titulo} signo={enDolares ? "US$" : "$"} />
      {posicion && mesElegido && rs.id && <DdjjSimulada p={posicion} mes={mesElegido} rs={rs.id} liquidado={!!liquidacion} />}

      <Pestanas items={[
        { clave: "ventas", texto: "IVA Ventas", activa: libro === "ventas", href: url(BASE, { ...filtros, canal: sp.canal }), cuenta: ventasCanal.filas.length },
        { clave: "compras", texto: "IVA Compras", activa: libro === "compras", href: url(BASE, { ...filtros, libro: "compras" }), cuenta: libroCompras.filas.length },
        { clave: "provincias", texto: "Ventas por provincia", activa: libro === "provincias", href: url(BASE, { ...filtros, libro: "provincias" }), cuenta: provincias.length },
        { clave: "avisos", texto: "Avisos", activa: libro === "avisos", href: url(BASE, { ...filtros, libro: "avisos" }), cuenta: avisos.length },
      ]} />

      {libro === "ventas" && (
        <>
          {canal && <p className="text-[11px] text-[#5C6B76] mb-2">Filtrado por canal: el resumen de arriba y los archivos de ARCA son siempre de todos los canales.</p>}
          <TablaLibro filas={ventasCanal.filas} totales={ventasCanal.totales} sp={sp} compras={false} enDolares={enDolares} />
        </>
      )}
      {libro === "compras" && <TablaLibro filas={libroCompras.filas} totales={libroCompras.totales} sp={sp} compras enDolares={enDolares} />}
      {libro === "provincias" && <TablaProvincias filas={provincias} />}
      {libro === "avisos" && <ListaAvisos avisos={avisos} />}

      <LibroDigital archivos={archivos} filtros={filtros} mes={mesElegido} rs={rs.id} drive={drive.conectado && !drive.permiso_viejo && !!rs.id && !!rutas[String(rs.id)]} />
      {mesElegido && rs.id && <SubidasDrive mes={mesElegido} envios={envios} liquidacion={liquidacion} drive={drive.conectado && !!rutas[String(rs.id)]} />}
    </Pantalla>
  );
}

function ElegirRs({ rs }: { rs: Awaited<ReturnType<typeof elegirRazonSocial>> }) {
  return rs.multi
    ? <label><span className={ETIQUETA}>Razón social</span>
        <select name="rs" defaultValue={rs.id ?? undefined} className={CAMPO}>
          {rs.razones.map((x) => <option key={x.id} value={x.id}>{nombreRs(x)}</option>)}
        </select></label>
    : <input type="hidden" name="rs" value={rs.id ?? ""} />;
}

function Resumen({ r, titulo, signo }: { r: ReturnType<typeof resumenIva>; titulo: string; signo: string }) {
  const pesos = plata(signo);
  return (
    <div className="grid gap-3 md:grid-cols-[2fr_1fr] mb-4">
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Alícuota · {titulo}</th><th className={THN}>Base ventas</th><th className={THN}>Débito fiscal</th><th className={THN}>Base compras</th><th className={THN}>Crédito fiscal</th></tr>
          </thead>
          <tbody>
            {r.alicuotas.length === 0 && <tr className={TR}><td className={`${TD} text-[#5C6B76]`} colSpan={5}>Sin comprobantes con IVA en el período.</td></tr>}
            {r.alicuotas.map((a) => (
              <tr key={a.pct} className={TR}>
                <td className={TD}>{pct(a.pct)}</td>
                <td className={TDN}>{n2(a.baseVentas, "—")}</td><td className={TDN}>{n2(a.debito, "—")}</td>
                <td className={TDN}>{n2(a.baseCompras, "—")}</td><td className={TDN}>{n2(a.credito, "—")}</td>
              </tr>
            ))}
            <tr className={`${TR} font-bold bg-[#FAFBFC]`}>
              <td className={TD}>Total</td>
              <td className={TDN}>{n2(r.alicuotas.reduce((s, a) => s + a.baseVentas, 0), "0,00")}</td><td className={TDN}>{n2(r.debito, "0,00")}</td>
              <td className={TDN}>{n2(r.alicuotas.reduce((s, a) => s + a.baseCompras, 0), "0,00")}</td><td className={TDN}>{n2(r.credito, "0,00")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={`${CAJA} text-xs space-y-1`}>
        <div className="flex justify-between"><span>Débito fiscal (ventas)</span><b className="tabular-nums">{pesos(r.debito)}</b></div>
        <div className="flex justify-between"><span>− Crédito fiscal (compras y despachos)</span><b className="tabular-nums">{pesos(r.credito)}</b></div>
        <div className={`flex justify-between border-t border-[#E3E9F0] pt-1 text-sm ${r.saldoTecnico >= 0 ? "text-[#C03420]" : "text-[#1F6E4A]"}`}>
          <span className="font-bold">Saldo técnico {r.saldoTecnico >= 0 ? "a pagar" : "a favor"}</span><b className="tabular-nums">{pesos(Math.abs(r.saldoTecnico))}</b>
        </div>
        <div className="flex justify-between text-[#5C6B76] pt-1"><span>Percepciones de IVA sufridas (saldo a favor, aparte)</span><span className="tabular-nums">{pesos(r.percepciones)}</span></div>
        <div className="flex justify-between text-[#5C6B76]"><span>Saldo después de percepciones</span><span className="tabular-nums">{r.saldoConPercepciones >= 0 ? "a pagar " : "a favor "}{pesos(Math.abs(r.saldoConPercepciones))}</span></div>
        <p className="text-[10px] text-[#5C6B76] pt-1">Orientativo: no incluye saldos de meses anteriores, retenciones ni restituciones. La declaración jurada la arma el contador.</p>
      </div>
    </div>
  );
}

function TablaLibro({ filas, totales, sp, compras, enDolares }: { filas: FilaLibro[]; totales: ImportesLibro; sp: SPLibro; compras: boolean; enDolares: boolean }) {
  if (!filas.length) return <p className={`${CAJA} text-xs text-[#5C6B76] mb-4`}>No hay comprobantes {compras ? "de compra registrados" : "de venta autorizados"} en el período.</p>;
  const usadas = alicuotasUsadas(totales, filas);
  const conExento = totales.exento !== 0 || filas.some((f) => f.exento !== 0);
  const conSinDisc = compras && (totales.sinDiscriminar !== 0 || filas.some((f) => f.sinDiscriminar !== 0));
  const celdas = (f: ImportesLibro, cero: string) => (
    <>
      {usadas.map((k: Alicuota) => <td key={`n${k}`} className={TDN}>{n2(f.neto[k], cero)}</td>)}
      <td className={TDN}>{n2(f.noGravado, cero)}</td>
      {conExento && <td className={TDN}>{n2(f.exento, cero)}</td>}
      {conSinDisc && <td className={TDN}>{n2(f.sinDiscriminar, cero)}</td>}
      {usadas.map((k: Alicuota) => <td key={`i${k}`} className={TDN}>{n2(f.iva[k], cero)}</td>)}
      <td className={TDN}>{n2(f.percepcionIva, cero)}</td>
      <td className={TDN}>{n2(f.percepcionIibb, cero)}</td>
      <td className={TDN}>{n2(f.otros, cero)}</td>
      <td className={`${TDN} font-semibold`}>{n2(f.total, cero)}</td>
    </>
  );
  return (
    <div className="mb-4">
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Fecha</th><th className={TH}>Comprobante</th><th className={TH}>{compras ? "Proveedor" : "Cliente"}</th>
              {usadas.map((k) => <th key={`n${k}`} className={THN}>Neto {pct(k)}</th>)}
              <th className={THN}>No gravado</th>
              {conExento && <th className={THN}>Exento</th>}
              {conSinDisc && <th className={THN} title="Facturas B y C: el IVA no está discriminado y no da crédito fiscal">B / C sin crédito</th>}
              {usadas.map((k) => <th key={`i${k}`} className={THN}>IVA {pct(k)}</th>)}
              <th className={THN}>Perc. IVA</th><th className={THN}>Perc. IIBB</th><th className={THN} title="Percepciones nacionales y municipales, impuestos internos y otros tributos">Otros</th><th className={THN}>Total</th>
            </tr>
          </thead>
          <tbody>
            {paginarEnMemoria(filas, sp).map((f) => (
              <tr key={`${f.c.origen}${f.c.id}`} className={`${TR} ${f.signo < 0 ? "text-[#C03420]" : ""}`}>
                <td className={`${TD} whitespace-nowrap`}>{fechaAr(f.c.fecha)}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <span className="text-[10px] text-[#5C6B76] font-mono mr-1">{String(f.c.tipo).padStart(3, "0")}</span>
                  {f.c.enlace ? <Link href={f.c.enlace} className="font-mono text-[#16577F] hover:underline">{textoComprobante(f.c)}</Link> : <span className="font-mono">{textoComprobante(f.c)}</span>}
                  {f.c.moneda !== "PES" && <span className="ml-1 text-[10px] text-[#5C6B76]">US$ × {f.c.cotizacion.toLocaleString("es-AR")}</span>}
                </td>
                <td className={TD}>
                  <div className="truncate max-w-[16rem]" title={f.c.nombre}>{f.c.nombre || "—"}</div>
                  <div className="text-[10px] text-[#5C6B76] whitespace-nowrap">
                    {DOC[f.c.docTipo] ?? `Doc ${f.c.docTipo}`}{f.c.docTipo !== 99 ? ` ${f.c.docNro}` : ""}{f.c.condicionIva ? ` · ${f.c.condicionIva}` : ""}{f.c.canal ? ` · ${f.c.canal}` : ""}
                  </div>
                </td>
                {celdas(f, "")}
              </tr>
            ))}
            <tr className={`${TR} font-bold bg-[#FAFBFC]`}>
              <td className={TD} colSpan={3}>Total del período ({filas.length.toLocaleString("es-AR")} comprobantes)</td>
              {celdas(totales, "0,00")}
            </tr>
          </tbody>
        </table>
      </div>
      <Paginado total={filas.length} />
      <p className="text-[10px] text-[#5C6B76] mt-1">
        Neto gravado {n2(netoTotal(totales), "0,00")} · IVA {n2(ivaTotal(totales), "0,00")}. {enDolares ? "Importes en dólares: cada comprobante al dólar de su día; los archivos para ARCA van en pesos." : "Importes en pesos."} Los totales son de todo el período, no sólo de esta página.
        {compras && " Los despachos de importación van con el CUIT de la Aduana; el IVA adicional suma en «Perc. IVA» y ganancias en «Otros»."}
      </p>
    </div>
  );
}

function ListaAvisos({ avisos }: { avisos: AvisoLibro[] }) {
  if (!avisos.length) return <p className="text-xs rounded-lg px-3 py-2 mb-4 bg-[#EEF7F1] text-[#1F6E4A]">Nada para revisar en el período.</p>;
  return (
    <ul className={`${CAJA} text-xs space-y-1.5 mb-4`}>
      {avisos.map((a, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-[#8a6100]">⚠</span>
          {a.enlace ? <Link href={a.enlace} className="text-[#16577F] hover:underline">{a.texto}</Link> : <span>{a.texto}</span>}
        </li>
      ))}
    </ul>
  );
}

function LibroDigital({ archivos, filtros, mes, rs, drive }: {
  archivos: ReturnType<typeof archivosLibroIvaDigital> | null; filtros: Record<string, string | undefined>; mes: string; rs: number | null; drive: boolean;
}) {
  return (
    <section className={`${CAJA} text-xs`}>
      <h2 className="text-sm font-bold mb-1">Libro de IVA Digital (ARCA)</h2>
      {!archivos ? (
        <p className="text-[#5C6B76]">Los archivos se arman por mes entero: elegí un mes arriba.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-2">
            <a href={url(`${BASE}/txt`, filtros)} className={VERDE}>Bajar los 5 archivos (.zip)</a>
            <a href={url(`${BASE}/provincias`, filtros)} className={SUAVE}>ventas por provincia (.xlsx)</a>
            {archivos.map((a) => {
              const clave = a.nombre.replace(/^LIBRO_IVA_DIGITAL_/, "").replace(/_\d{6}\.txt$/, "");
              return <a key={a.nombre} href={url(`${BASE}/txt`, { ...filtros, archivo: clave })} className={SUAVE}>{clave.replace(/_/g, " ").toLowerCase()} ({a.renglones})</a>;
            })}
            {drive && rs
              ? <BotonTarea accion={accionMandarAlDrive} tipo="drive-libro-iva" clase={PRIMARIO} texto="Mandar al Drive" campos={{ mes, rs: String(rs) }} />
              : <Link href="/config/google-drive" className="self-center text-[11px] text-[#16577F] hover:underline">Conectar Google Drive (y la ruta de esta razón social) para mandarlos a su carpeta</Link>}
          </div>
          <p className="rounded-lg px-3 py-2 bg-[#FFF8E5] text-[#8a6100]">
            Antes de presentar: estos archivos hay que <b>validarlos importándolos en el Libro de IVA Digital de ARCA</b> (Portal IVA → Libro IVA Digital → Importar), que es el que
            dice si el formato y los importes están bien. El primero que se presente <b>que lo revise el contador</b>. Revisá también la pestaña «Avisos».
          </p>
        </>
      )}
    </section>
  );
}

function TablaProvincias({ filas }: { filas: FilaProvincia[] }) {
  if (!filas.length) return <p className={`${CAJA} text-xs text-[#5C6B76] mb-4`}>No hay comprobantes de venta en el período.</p>;
  const t = (k: "comprobantes" | "asignados" | "neto" | "total") => filas.reduce((s, f) => s + f[k], 0);
  return (
    <div className="mb-4">
      <div className={`${CAJA_TABLA} max-w-4xl`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Provincia</th><th className={THN} title="Comprobantes">Cbtes.</th>
              <th className={THN} title={`Sin provincia, asignados a ${PROVINCIA_POR_DEFECTO}`}>Sin prov.</th>
              <th className={THN}>Neto sin IVA</th><th className={THN}>Total con IVA</th><th className={THN} title="Porcentaje sobre el neto sin IVA del período">% del neto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.provincia} className={TR}>
                <td className={TD}>{f.provincia}</td>
                <td className={TDN}>{f.comprobantes.toLocaleString("es-AR")}</td>
                <td className={TDN}>{f.asignados ? f.asignados.toLocaleString("es-AR") : ""}</td>
                <td className={TDN}>{n2(f.neto, "0,00")}</td>
                <td className={TDN}>{n2(f.total, "0,00")}</td>
                <td className={TDN}>{f.pct.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</td>
              </tr>
            ))}
            <tr className={`${TR} font-bold bg-[#FAFBFC]`}>
              <td className={TD}>Total</td>
              <td className={TDN}>{t("comprobantes").toLocaleString("es-AR")}</td><td className={TDN}>{t("asignados").toLocaleString("es-AR")}</td>
              <td className={TDN}>{n2(t("neto"), "0,00")}</td><td className={TDN}>{n2(t("total"), "0,00")}</td><td className={TDN}>100,0 %</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[#5C6B76] mt-1">
        Provincia de cada comprobante: la dirección de entrega del pedido (la de Mercado Libre); si no tiene, la dirección cargada del cliente (las ventas de otro sistema
        buscan al cliente por su CUIT o DNI); si no hay ninguna, {PROVINCIA_POR_DEFECTO}. Las notas de crédito restan; lo que está en dólares va a la cotización del comprobante.
        Siempre en pesos.
      </p>
    </div>
  );
}

const fechaHora = (ts: string) => new Date(ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function SubidasDrive({ mes, envios, liquidacion, drive }: {
  mes: string; envios: EnvioLibro[]; liquidacion: Awaited<ReturnType<typeof liquidacionDelMes>>; drive: boolean;
}) {
  return (
    <section className={`${CAJA} text-xs mt-3`}>
      <h2 className="text-sm font-bold mb-1">Subidas al Drive · {nombreMes(mes)}</h2>
      {liquidacion
        ? <p className="rounded-lg px-3 py-2 mb-2 bg-[#EEF2F6] text-[#2B3A45]">
            🔒 <b>Mes liquidado</b>: está cargada la <Link href={`/administracion/impuestos/${liquidacion.id}`} className="text-[#16577F] hover:underline">declaración jurada de IVA</Link>
            {liquidacion.fecha_presentacion ? ` (presentada el ${fechaAr(liquidacion.fecha_presentacion)})` : ""}. Sus comprobantes de compra ya no se pueden cambiar y las compras dejan de subirse;
            una factura con fecha de este mes que se registre ahora entra en el primer mes sin liquidar.
          </p>
        : <p className="text-[#5C6B76] mb-2">
            {drive
              ? "Se suben solos: el día 1 del mes siguiente, el libro entero (los 5 archivos y las ventas por provincia); y cada noche, mientras el mes no esté liquidado, los 3 archivos de compras si cambiaron."
              : "Con Google Drive conectado y la ruta de esta razón social cargada, se suben solos: el día 1 del mes siguiente el libro entero y cada noche las compras si cambiaron."}
          </p>}
      {envios.length === 0
        ? <p className="text-[#5C6B76]">Todavía no se subió nada de este mes.</p>
        : (
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Fecha y hora</th><th className={TH}>Qué</th><th className={TH}>Cómo</th><th className={TH}>Resultado</th></tr></thead>
              <tbody>
                {envios.map((e) => (
                  <tr key={e.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap`}>{fechaHora(e.ts)}</td>
                    <td className={TD} title={e.archivos?.join("\n") ?? undefined}>{e.que === "todo" ? "Libro entero (5 archivos + ventas por provincia)" : "Compras (3 archivos)"}</td>
                    <td className={TD}>{e.origen === "automatico" ? "Automática" : "A mano"}</td>
                    <td className={TD}>{e.ok ? <span className="text-[#1F6E4A]">Subido{e.donde ? ` a ${e.donde}` : ""}</span> : <span className="text-[#C03420]">No se subió: {e.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

/** La declaración jurada de IVA del mes como la armaría el contador (F.2002), con los saldos que dejó el mes anterior:
 *  su declaración, o su simulación si todavía no está (lib/impuestos/posicion.ts). Siempre en pesos. */
function DdjjSimulada({ p, mes, rs, liquidado }: { p: PosicionDelMes; mes: string; rs: number; liquidado: boolean }) {
  const { iva } = p;
  const pesos = plata("$");
  const Fila = ({ t, v, signo = "", fuerte = false, clase = "" }: { t: string; v: number; signo?: string; fuerte?: boolean; clase?: string }) => (
    <div className={`flex justify-between gap-3 ${fuerte ? "font-bold border-t border-[#E3E9F0] pt-1" : ""} ${clase}`}>
      <span>{signo && <span className="inline-block w-4 text-[#5C6B76]">{signo}</span>}{t}</span><span className="tabular-nums whitespace-nowrap">{pesos(v)}</span>
    </div>
  );
  const sim = p.simulado.iva ? " (simulado)" : "";
  return (
    <section className={`${CAJA} text-xs mb-4 max-w-3xl`}>
      <h2 className="text-sm font-bold mb-1">
        Declaración jurada de IVA {liquidado ? "· calculada con lo cargado" : "simulada"} · {nombreMes(mes)}
        <Link href={url("/administracion/impuestos", { mes, rs: String(rs) })} className="ml-2 text-[11px] font-normal text-[#16577F] hover:underline">ver en Impuestos</Link>
      </h2>
      <div className="space-y-1">
        <Fila t="Débito fiscal (ventas)" v={iva.debito} />
        <Fila t="Crédito fiscal (compras y despachos)" v={iva.credito} signo="−" />
        <Fila t={`Saldo técnico a favor del mes anterior${sim}`} v={iva.saldoTecnicoAnterior} signo="−" />
        {iva.saldoTecnicoFavor > 0
          ? <Fila t="Saldo técnico a favor (pasa al mes que viene)" v={iva.saldoTecnicoFavor} fuerte clase="text-[#1F6E4A]" />
          : <Fila t="Impuesto del mes" v={iva.impuesto} fuerte />}
        <Fila t="Percepciones de IVA (pagos a cuenta)" v={iva.pagosACuenta} signo="−" />
        <Fila t={`Saldo de libre disponibilidad del mes anterior${sim}`} v={iva.saldoLibreAnterior} signo="−" />
        {iva.aPagar > 0 || iva.saldoLibreFavor === 0
          ? <Fila t="A pagar" v={iva.aPagar} fuerte clase="text-[#C03420]" />
          : <Fila t="Saldo de libre disponibilidad a favor (pasa al mes que viene)" v={iva.saldoLibreFavor} fuerte clase="text-[#1F6E4A]" />}
      </div>
      {p.avisos.filter((a) => /IVA/.test(a)).map((a, i) => <p key={i} className="mt-1 text-[11px] text-[#8a6100]">{a}</p>)}
      <p className="mt-1 text-[10px] text-[#5C6B76]">
        Como el formulario de ARCA: débito − crédito − saldo técnico anterior; si da negativo, queda saldo técnico a favor. Al impuesto se le restan los pagos a cuenta y el saldo
        de libre disponibilidad anterior. Los pagos a cuenta son las percepciones de IVA de las facturas de compra y los despachos: las retenciones de IVA que no están cargadas no se ven.
      </p>
    </section>
  );
}
