// Administración → Libros de IVA: el Libro IVA Ventas y el Libro IVA Compras
// de un mes (o de un rango a mano), con el neto gravado y el IVA por
// alícuota, percepciones y total de cada comprobante (las notas de crédito
// restan; la moneda extranjera, a la cotización del comprobante), los totales,
// el resumen del mes (débito − crédito = saldo técnico), los avisos de lo que
// conviene revisar, el Excel de cada libro y los archivos del Libro de IVA
// Digital de ARCA. Las cuentas están en lib/administracion/libro-iva.ts.

import Link from "next/link";
import { SUAVE, VERDE } from "@/app/botones";
import Pestanas from "@/app/componentes/Pestanas";
import RangoFechas from "@/app/componentes/RangoFechas";
import { Paginado } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, Avisos, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { Desplegable } from "@/app/informes/Filtros";
import { paginarEnMemoria } from "@/lib/lista";
import {
  armarLibro, alicuotasUsadas, resumenIva, archivosLibroIvaDigital, textoComprobante, ivaTotal, netoTotal,
  type FilaLibro, type ImportesLibro, type Alicuota,
} from "@/lib/administracion/libro-iva";
import { libroIvaPeriodo, canalesConVentas, type AvisoLibro } from "@/lib/administracion/libro-iva-base";
import { periodoDe, mesesParaElegir, nombreMes, canalDe, type SPLibro } from "./comun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "/administracion/libros-iva";
const n2 = (x: number, cero = "") => (x === 0 ? cero : x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pesos = (x: number) => `$ ${n2(x, "0,00")}`;
const pct = (k: number) => `${String(k).replace(".", ",")} %`;
const fechaAr = (f: string) => f.split("-").reverse().join("/");
const DOC: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 99: "Sin identificar" };

export default async function LibrosIva({ searchParams }: { searchParams: Promise<SPLibro> }) {
  const s = await entrarErp("libros_iva_ver");
  const sp = await searchParams;
  const org = s.org.id;
  const { desde, hasta, periodo } = periodoDe(sp);
  const libro = sp.libro === "compras" || sp.libro === "avisos" ? sp.libro : "ventas";
  const canal = canalDe(sp);
  const [{ ventas, compras, avisos }, canales] = await Promise.all([libroIvaPeriodo(org, desde, hasta), canalesConVentas(org)]);

  const libroVentas = armarLibro(ventas);
  const libroCompras = armarLibro(compras);
  const ventasCanal = canal ? armarLibro(ventas.filter((v) => v.canalId === canal)) : libroVentas;
  const resumen = resumenIva(libroVentas.totales, libroCompras.totales);
  const archivos = periodo && /^\d{6}$/.test(periodo) ? archivosLibroIvaDigital(periodo, ventas, compras) : null;

  const filtros = { mes: sp.mes, desde: sp.desde, hasta: sp.hasta };
  const mesElegido = periodo && /^\d{6}$/.test(periodo) ? `${periodo.slice(0, 4)}-${periodo.slice(4)}` : "";
  const meses = mesesParaElegir();
  const titulo = mesElegido ? nombreMes(mesElegido) : `${fechaAr(desde)} al ${fechaAr(hasta)}`;

  return (
    <Pantalla titulo="Libros de IVA" ancho="max-w-[1400px]"
      subtitulo="Libro IVA Ventas y Libro IVA Compras: comprobantes del período por fecha, con neto gravado e IVA por alícuota. Las notas de crédito restan; lo que está en dólares va a la cotización del comprobante."
      acciones={libro !== "avisos" ? <a href={url(`${BASE}/excel`, { ...filtros, libro, canal: libro === "ventas" ? sp.canal : undefined })} className={VERDE}>Descargar Excel</a> : undefined}>
      <Avisos sp={sp} />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Desplegable parametro="mes" etiqueta="Mes" valor={mesElegido} limpiar={["desde", "hasta", "p"]}
          opciones={[...(mesElegido && meses.includes(mesElegido) ? [] : [{ valor: mesElegido, texto: mesElegido ? nombreMes(mesElegido) : "Personalizado" }]),
            ...meses.map((m) => ({ valor: m, texto: nombreMes(m) }))]} />
        <RangoFechas desde={desde} hasta={hasta} etiqueta="Fechas" limpiar={["mes", "p"]} />
        {libro === "ventas" && canales.length > 0 && (
          <Desplegable parametro="canal" etiqueta="Canal" valor={sp.canal ?? ""} limpiar={["p"]}
            opciones={[{ valor: "", texto: "Todos" }, ...canales.map((c) => ({ valor: String(c.id), texto: c.nombre }))]} />
        )}
      </div>

      <Resumen r={resumen} titulo={titulo} />

      <Pestanas items={[
        { clave: "ventas", texto: "IVA Ventas", activa: libro === "ventas", href: url(BASE, { ...filtros, canal: sp.canal }), cuenta: ventasCanal.filas.length },
        { clave: "compras", texto: "IVA Compras", activa: libro === "compras", href: url(BASE, { ...filtros, libro: "compras" }), cuenta: libroCompras.filas.length },
        { clave: "avisos", texto: "Avisos", activa: libro === "avisos", href: url(BASE, { ...filtros, libro: "avisos" }), cuenta: avisos.length },
      ]} />

      {libro === "ventas" && (
        <>
          {canal && <p className="text-[11px] text-[#5C6B76] mb-2">Filtrado por canal: el resumen de arriba y los archivos de ARCA son siempre de todos los canales.</p>}
          <TablaLibro filas={ventasCanal.filas} totales={ventasCanal.totales} sp={sp} compras={false} />
        </>
      )}
      {libro === "compras" && <TablaLibro filas={libroCompras.filas} totales={libroCompras.totales} sp={sp} compras />}
      {libro === "avisos" && <ListaAvisos avisos={avisos} />}

      <LibroDigital archivos={archivos} filtros={filtros} />
    </Pantalla>
  );
}

function Resumen({ r, titulo }: { r: ReturnType<typeof resumenIva>; titulo: string }) {
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

function TablaLibro({ filas, totales, sp, compras }: { filas: FilaLibro[]; totales: ImportesLibro; sp: SPLibro; compras: boolean }) {
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
        Neto gravado {n2(netoTotal(totales), "0,00")} · IVA {n2(ivaTotal(totales), "0,00")}. Importes en pesos. Los totales son de todo el período, no sólo de esta página.
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

function LibroDigital({ archivos, filtros }: { archivos: ReturnType<typeof archivosLibroIvaDigital> | null; filtros: Record<string, string | undefined> }) {
  return (
    <section className={`${CAJA} text-xs`}>
      <h2 className="text-sm font-bold mb-1">Libro de IVA Digital (ARCA)</h2>
      {!archivos ? (
        <p className="text-[#5C6B76]">Los archivos se arman por mes entero: elegí un mes arriba.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-2">
            <a href={url(`${BASE}/txt`, filtros)} className={VERDE}>Bajar los 5 archivos (.zip)</a>
            {archivos.map((a) => {
              const clave = a.nombre.replace(/^LIBRO_IVA_DIGITAL_/, "").replace(/_\d{6}\.txt$/, "");
              return <a key={a.nombre} href={url(`${BASE}/txt`, { ...filtros, archivo: clave })} className={SUAVE}>{clave.replace(/_/g, " ").toLowerCase()} ({a.renglones})</a>;
            })}
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
