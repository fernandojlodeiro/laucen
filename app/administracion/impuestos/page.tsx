// Administración › Impuestos (Fer, 23/10): de una razón social, la posición del mes (IVA, Ingresos Brutos provincia
// por provincia y la municipal de Córdoba) con lo cargado en Laucen y el saldo que dejó la última declaración; las
// declaraciones juradas del contador (se suben en PDF y las lee la IA); las diferencias de cada declaración contra lo
// cargado; y las provincias de IIBB (coeficiente unificado y alícuota) y la municipal. Cálculos: lib/impuestos/.

import Link from "next/link";
import { PRIMARIO, SUAVE } from "@/app/botones";
import Pestanas from "@/app/componentes/Pestanas";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import { Paginado } from "@/app/componentes/Lista";
import { TachoConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import {
  entrarErp, Pantalla, Avisos, TituloSeccion, Dato, Lapiz, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, editandoFicha,
} from "@/app/componentes/erp";
import { Desplegable } from "@/app/informes/Filtros";
import SelectorRazonSocial from "@/app/componentes/SelectorRazonSocial";
import { elegirRazonSocial, nombreRs } from "@/lib/razon-social";
import { paginarEnMemoria } from "@/lib/lista";
import { hoyArgentina } from "@/lib/rango-fechas";
import { IMPUESTOS, resultadoDdjj, type Impuesto } from "@/lib/impuestos/ddjj-leer";
import { posicionMes, ddjjDe, datosRazonSocial, controlDdjj, cargadoDelMes, type Cargado, type Diferencia, type FilaDdjj, type FilaIibb } from "@/lib/impuestos/posicion";
import { CODIGOS_JURISDICCION, nombreJurisdiccion } from "@/lib/impuestos/jurisdicciones";
import { mesesParaElegir, nombreMes } from "../libros-iva/comun";
import SubirDdjj from "./SubirDdjj";
import TablaDiferencias from "./TablaDiferencias";
import { accionNuevaDdjj, accionGrabarJurisdiccion, accionBorrarJurisdiccion, accionGrabarMunicipal, accionBuscarDrive } from "./acciones";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { consulta, una } from "@/lib/erp/base";

export const dynamic = "force-dynamic";
// 300: el botón «Buscar en el Drive» corre de fondo en esta misma función (lee varios PDF con la IA).
export const maxDuration = 300;

const BASE = "/administracion/impuestos";
type SP = { rs?: string; ver?: string; mes?: string; leer?: string; p?: string; editar?: string; nuevo?: string; ok?: string; error?: string };
const n2 = (x: number) => x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plata = (x: number) => `$ ${n2(x)}`;
const mesAr = (p: string) => p.split("-").reverse().join("/");
const NUEVA_DDJJ = "Nueva declaración a mano";
const NUEVA_PROV = "Nueva provincia";

export default async function Impuestos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("impuestos_ver");
  const sp = await searchParams;
  const org = s.org.id;
  const rs = await elegirRazonSocial(org, sp.rs, { todas: false });
  if (!rs.id) return <Pantalla titulo="Impuestos"><p className="text-xs">Primero cargá la razón social en Configuración › Razones sociales.</p></Pantalla>;
  const emisorId = rs.id;
  const ver = sp.ver === "declaraciones" || sp.ver === "diferencias" || sp.ver === "provincias" ? sp.ver : "";
  const filtro = { rs: rs.multi ? String(emisorId) : undefined };

  const [ddjjs, datosRs, drive, delDrive] = await Promise.all([ddjjDe(org, emisorId), datosRazonSocial(org, emisorId),
    una<{ listo: boolean; ddjj_leido_ts: string | null; ddjj_resultado: string | null }>(`select refresh_token is not null and rutas <> '{}'::jsonb listo,
      ddjj_leido_ts::text, ddjj_resultado from google_drive where organizacion_id = $1`, [org]),
    consulta<{ nombre: string; carpeta: string; estado: string; mensaje: string | null }>(`select nombre, carpeta, estado, mensaje from drive_archivo_leido
      where organizacion_id = $1 and estado in ('error', 'otro') order by leido_ts desc limit 30`, [org])]);
  // Las diferencias: las declaraciones (la que vale de cada período) de los últimos 12 meses, contra lo cargado.
  const vigentes = ddjjs.filter((d, i) => ddjjs.findIndex((x) => x.impuesto === d.impuesto && x.periodo === d.periodo) === i).slice(0, 36);
  const porMes = new Map<string, Promise<Cargado>>();
  const controles = await Promise.all(vigentes.map(async (d) => {
    if (!porMes.has(d.periodo)) porMes.set(d.periodo, cargadoDelMes(org, emisorId, d.periodo));
    return { d, ...(await controlDdjj(org, d, await porMes.get(d.periodo)!)) };
  }));
  const conDifs = controles.filter((c) => c.diferencias.length);

  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : hoyArgentina().slice(0, 7);
  const leerDesde = sp.leer && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.leer) ? sp.leer : "";
  const meses = mesesParaElegir();

  return (
    <Pantalla titulo="Impuestos" ancho="max-w-[1400px]"
      subtitulo="IVA, Ingresos Brutos (Convenio Multilateral) y la municipal de Córdoba: las declaraciones del contador, sus diferencias con lo cargado y cómo viene el mes"
      acciones={<>
        <BotonNuevo texto={NUEVA_DDJJ} />
        {drive?.listo && <>
          <Desplegable parametro="leer" etiqueta="Leer desde" valor={leerDesde}
            opciones={[{ valor: "", texto: "Últimos 3 meses" }, ...meses.map((m) => ({ valor: m, texto: nombreMes(m) }))]} />
          <BotonTarea accion={accionBuscarDrive} tipo="ddjj-drive" clase={SUAVE} texto="Buscar en el Drive" campos={{ desde: leerDesde }} />
        </>}
        <SubirDdjj organizacionId={org} />
      </>}>
      <Avisos sp={sp} />
      <AltaNueva texto={NUEVA_DDJJ} sinBoton>
        <form action={accionNuevaDdjj} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="emisor" value={emisorId} />
          <label><span className={ETIQUETA}>Impuesto</span>
            <select name="impuesto" required defaultValue="" className={CAMPO}>
              <option value="" disabled>Elegí…</option>
              {(Object.keys(IMPUESTOS) as Impuesto[]).map((k) => <option key={k} value={k}>{IMPUESTOS[k]}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Mes declarado</span>
            <select name="periodo" required defaultValue={meses[1]} className={CAMPO}>
              {meses.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Rectificativa (0 si es la original)</span>
            <input name="rectificativa" defaultValue="0" inputMode="numeric" className={`${CAMPO} w-20 text-right`} /></label>
          <BotonEnviar clase={PRIMARIO}>Crear y cargar los importes</BotonEnviar>
          <p className="w-full text-[11px] text-[#5C6B76]">Para cuando no tenés el PDF: se crea vacía y se abre para cargar los importes. Con el PDF, usá «Subir declaración».</p>
        </form>
      </AltaNueva>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        {rs.multi && <SelectorRazonSocial razones={rs.razones.map((x) => ({ id: x.id, nombre: nombreRs(x) }))} valor={rs.id} todas={false} />}
        {!ver && <Desplegable parametro="mes" etiqueta="Mes" valor={mes} opciones={meses.map((m) => ({ valor: m, texto: nombreMes(m) }))} />}
      </div>

      <Pestanas items={[
        { clave: "posicion", texto: "Posición del mes", activa: !ver, href: url(BASE, { ...filtro, mes: sp.mes }) },
        { clave: "declaraciones", texto: "Declaraciones", activa: ver === "declaraciones", href: url(BASE, { ...filtro, ver: "declaraciones" }), cuenta: ddjjs.length },
        { clave: "diferencias", texto: "Diferencias", activa: ver === "diferencias", href: url(BASE, { ...filtro, ver: "diferencias" }), cuenta: conDifs.length },
        { clave: "provincias", texto: "Provincias", activa: ver === "provincias", href: url(BASE, { ...filtro, ver: "provincias" }), cuenta: datosRs?.jurisdicciones.length ?? 0 },
      ]} />

      {!ver && <Posicion org={org} emisorId={emisorId} mes={mes} />}
      {ver === "declaraciones" && drive?.listo && <DelDrive ts={drive.ddjj_leido_ts} resultado={drive.ddjj_resultado} archivos={delDrive} />}
      {ver === "declaraciones" && <Declaraciones ddjjs={ddjjs} sp={sp} difs={new Map(controles.map((c) => [c.d.id, c.diferencias.length]))} />}
      {ver === "diferencias" && <Diferencias controles={conDifs} revisadas={controles.length} />}
      {ver === "provincias" && datosRs && <Provincias rs={datosRs} emisorId={emisorId} sp={sp} />}
    </Pantalla>
  );
}

// ── Posición del mes ─────────────────────────────────────────────────

async function Posicion({ org, emisorId, mes }: { org: string; emisorId: number; mes: string }) {
  const p = await posicionMes(org, emisorId, mes);
  const { iva, iibb, municipal, cargado: c } = p;
  const enCurso = mes === hoyArgentina().slice(0, 7);
  const Fila = ({ t, v, signo = "", fuerte = false, ayuda }: { t: React.ReactNode; v: number; signo?: string; fuerte?: boolean; ayuda?: string }) => (
    <tr className={`${TR} ${fuerte ? "font-bold bg-[#FAFBFC]" : ""}`}>
      <td className={TD}>{signo && <span className="inline-block w-4 text-[#5C6B76]">{signo}</span>}{t}{ayuda && <span className="block text-[10px] font-normal text-[#5C6B76]">{ayuda}</span>}</td>
      <td className={TDN}>{plata(v)}</td>
    </tr>
  );
  return (
    <>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        {nombreMes(mes)}{enCurso ? " (en curso: se actualiza con cada factura que se emite o se carga)" : ""} · {c.ventas} comprobante{c.ventas === 1 ? "" : "s"} de venta · {c.compras} de compra y despachos ·{" "}
        <Link href={url("/administracion/libros-iva", { mes, rs: String(emisorId) })} className="text-[#16577F] hover:underline">ver los libros de IVA</Link>
      </p>
      {p.avisos.length > 0 && (
        <ul className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100] list-disc pl-6">{p.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
      )}
      <div className="grid gap-3 lg:grid-cols-2 mb-4">
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>IVA</th><th className={THN}>Importe</th></tr></thead>
            <tbody>
              <Fila t="Débito fiscal (ventas)" v={iva.debito} />
              <Fila t="Crédito fiscal (compras y despachos)" v={iva.credito} signo="−" />
              <Fila t="Saldo técnico a favor del mes anterior" v={iva.saldoTecnicoAnterior} signo="−" />
              {iva.saldoTecnicoFavor > 0
                ? <Fila t="Saldo técnico a favor (pasa al mes que viene)" v={iva.saldoTecnicoFavor} fuerte />
                : <Fila t="Impuesto del mes" v={iva.impuesto} fuerte />}
              <Fila t="Percepciones de IVA (pagos a cuenta)" v={iva.pagosACuenta} signo="−" />
              <Fila t="Saldo de libre disponibilidad del mes anterior" v={iva.saldoLibreAnterior} signo="−" />
              {iva.aPagar > 0 || iva.saldoLibreFavor === 0
                ? <Fila t={<span className="text-[#C03420]">A pagar</span>} v={iva.aPagar} fuerte />
                : <Fila t={<span className="text-[#1F6E4A]">Saldo de libre disponibilidad a favor</span>} v={iva.saldoLibreFavor} fuerte />}
            </tbody>
          </table>
        </div>
        {municipal ? (
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Municipalidad de Córdoba (comercio e industria)</th><th className={THN}>Importe</th></tr></thead>
              <tbody>
                <Fila t="Base imponible (ventas sin IVA)" v={municipal.base} />
                <Fila t={`Contribución (${String(municipal.alicuota).replace(".", ",")} %)`} v={municipal.calculado} ayuda={municipal.minimo ? `Mínimo: ${plata(municipal.minimo)}` : undefined} />
                <Fila t="Determinado" v={municipal.determinado} fuerte />
                <Fila t="Saldo a favor del mes anterior" v={municipal.saldoAnterior} signo="−" />
                {municipal.saldo >= 0
                  ? <Fila t={<span className="text-[#C03420]">A pagar</span>} v={municipal.saldo} fuerte />
                  : <Fila t={<span className="text-[#1F6E4A]">A favor</span>} v={-municipal.saldo} fuerte />}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={`${CAJA} text-xs text-[#5C6B76]`}>Esta razón social no paga la municipal de Córdoba (se cambia en la pestaña «Provincias»).</div>
        )}
      </div>

      <TituloSeccion titulo={<>Ingresos Brutos (Convenio Multilateral) · base del mes {plata(iibb.totales.base)}</>} />
      <div className={`${CAJA_TABLA} mb-2`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Provincia</th>
              <th className={THN} title="Saldo de la provincia: a pagar o a favor">Saldo</th>
              <th className={THN} title="Coeficiente unificado">Coef.</th><th className={THN} title="Alícuota">Alíc.</th>
              <th className={THN} title="Base imponible atribuida (base del mes × coeficiente)">Base</th><th className={THN} title="Impuesto determinado">Determ.</th>
              <th className={THN} title="Percepciones de las facturas de compra">Percep.</th>
              <th className={THN} title="Percepciones aduaneras de los despachos (repartidas por coeficiente)">Aduana</th>
              <th className={THN} title="Lo que descontó Mercado Pago en los cobros (repartido por coeficiente)">Ret. MP</th>
              <th className={THN} title="Saldo a favor que dejó la declaración del mes anterior">Saldo ant.</th>
            </tr>
          </thead>
          <tbody>
            {iibb.filas.length === 0 && <tr className={TR}><td colSpan={10} className={`${TD} text-[#5C6B76]`}>Sin provincias cargadas.</td></tr>}
            {iibb.filas.map((f) => <FilaProvincia key={f.codigo} f={f} />)}
            <tr className={`${TR} font-bold bg-[#FAFBFC]`}>
              <td className={TD}>Total</td>
              <td className={TDN}>
                {iibb.totales.aPagar > 0 && <span className="block text-[#C03420]">A pagar {plata(iibb.totales.aPagar)}</span>}
                {iibb.totales.aFavor > 0 && <span className="block text-[#1F6E4A]">A favor {plata(iibb.totales.aFavor)}</span>}
                {!iibb.totales.aPagar && !iibb.totales.aFavor && plata(0)}
              </td>
              <td className={TDN} /><td className={TDN} /><td className={TDN}>{n2(iibb.totales.base)}</td><td className={TDN}>{n2(iibb.totales.determinado)}</td>
              <td className={TDN}>{n2(iibb.totales.percepciones)}</td><td className={TDN}>{n2(iibb.totales.aduaneras)}</td>
              <td className={TDN}>{n2(iibb.totales.retenciones)}</td><td className={TDN}>{n2(iibb.totales.saldoAnterior)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76]">
        Cada provincia se liquida aparte: una puede dar a pagar y otra a favor (el saldo a favor queda para el mes siguiente de esa misma provincia).
        Las percepciones de las facturas van a la provincia que dice cada factura; las de la aduana y lo que descuenta Mercado Pago no dicen la provincia
        y se reparten por coeficiente (la declaración del contador trae el reparto real).
      </p>
    </>
  );
}

function FilaProvincia({ f }: { f: FilaIibb }) {
  return (
    <tr className={TR}>
      <td className={`${TD} whitespace-nowrap`}>{nombreJurisdiccion(f.codigo)} <span className="text-[10px] text-[#5C6B76]">{f.codigo}</span></td>
      <td className={`${TDN} font-semibold ${f.saldo > 0 ? "text-[#C03420]" : f.saldo < 0 ? "text-[#1F6E4A]" : ""}`}>
        {f.saldo > 0 ? `A pagar ${n2(f.saldo)}` : f.saldo < 0 ? `A favor ${n2(-f.saldo)}` : "0,00"}
      </td>
      <td className={TDN}>{f.coeficiente.toLocaleString("es-AR", { maximumFractionDigits: 6 })}</td>
      <td className={TDN}>{f.alicuota ? `${f.alicuota.toLocaleString("es-AR")} %` : "—"}</td>
      <td className={TDN}>{n2(f.base)}</td><td className={TDN}>{n2(f.determinado)}</td><td className={TDN}>{n2(f.percepciones)}</td>
      <td className={TDN}>{n2(f.aduaneras)}</td><td className={TDN}>{n2(f.retenciones)}</td><td className={TDN}>{n2(f.saldoAnterior)}</td>
    </tr>
  );
}

// ── Declaraciones ────────────────────────────────────────────────────

function Declaraciones({ ddjjs, sp, difs }: { ddjjs: FilaDdjj[]; sp: SP; difs: Map<number, number> }) {
  const filas = paginarEnMemoria(ddjjs, sp);
  return (
    <>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Mes</th><th className={TH}>Impuesto</th><th className={THN}>Rectif.</th><th className={THN}>A pagar</th><th className={THN}>A favor</th>
              <th className={TH}>Control</th><th className={TH}>Presentada</th><th className={TH}>PDF</th><th className={TH}>Origen</th></tr>
          </thead>
          <tbody>
            {ddjjs.length === 0 && <tr className={TR}><td colSpan={9} className={`${TD} text-[#5C6B76]`}>Todavía no hay declaraciones. Subilas con «Subir declaración», arriba a la derecha.</td></tr>}
            {filas.map((d) => {
              const r = resultadoDdjj(d.impuesto, d.datos);
              const n = difs.get(d.id);
              return (
                <tr key={d.id} className={TR}>
                  <td className={TD}><Link href={`${BASE}/${d.id}`} className="font-semibold text-[#16577F] hover:underline">{mesAr(d.periodo)}</Link></td>
                  <td className={TD}>{IMPUESTOS[d.impuesto]}</td>
                  <td className={TDN}>{d.rectificativa || "—"}</td>
                  <td className={TDN}>{r.aPagar ? n2(r.aPagar) : "—"}</td>
                  <td className={TDN}>{r.aFavor ? n2(r.aFavor) : "—"}</td>
                  <td className={TD}>{n == null ? <span className="text-[#5C6B76]">— (reemplazada)</span> : n ? <Link href={`${BASE}/${d.id}`} className="text-[#8a6100] hover:underline">{n} diferencia{n === 1 ? "" : "s"}</Link> : <span className="text-[#1F6E4A]">✓ Coincide</span>}</td>
                  <td className={TD}>{d.fecha_presentacion ? d.fecha_presentacion.split("-").reverse().join("/") : "—"}</td>
                  <td className={TD}>{d.archivo ? <a href={`${BASE}/${d.id}/pdf`} target="_blank" rel="noreferrer" className="text-[#16577F] hover:underline">Ver</a> : "—"}</td>
                  <td className={TD}>{d.archivo?.startsWith("drive:") ? "Drive" : d.archivo ? "Subida" : "A mano"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={ddjjs.length} />
    </>
  );
}

function DelDrive({ ts, resultado, archivos }: { ts: string | null; resultado: string | null; archivos: { nombre: string; carpeta: string; estado: string; mensaje: string | null }[] }) {
  return (
    <div className={`${CAJA} mb-3 text-xs`}>
      <p>
        <b>Del Drive del contador:</b>{" "}
        {ts ? <>última búsqueda {new Date(ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })} · {resultado}</>
          : "todavía no se buscó. Se busca solo cada noche, o con «Buscar en el Drive» (arriba a la derecha)."}
      </p>
      {archivos.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[#16577F]">Archivos que no se cargaron ({archivos.length})</summary>
          <ul className="list-disc pl-5 mt-1">
            {archivos.map((a, i) => (
              <li key={i} className={a.estado === "error" ? "text-[#C03420]" : "text-[#5C6B76]"}>
                {a.carpeta} › {a.nombre}: {a.estado === "otro" ? `no es una declaración (${a.mensaje})` : a.mensaje}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Diferencias ──────────────────────────────────────────────────────

function Diferencias({ controles, revisadas }: { controles: { d: FilaDdjj; diferencias: Diferencia[] }[]; revisadas: number }) {
  if (!controles.length) return <p className="text-xs rounded-lg px-3 py-2 bg-[#EEF7F1] text-[#1F6E4A]">{revisadas ? `Las ${revisadas} declaraciones coinciden con lo cargado.` : "Todavía no hay declaraciones para controlar."}</p>;
  return (
    <div className="grid gap-3">
      <p className="text-[11px] text-[#5C6B76]">Lo que dice cada declaración contra lo cargado en Laucen ese mes (con más de $ 1 de diferencia). Un mes de antes de empezar a facturar con Laucen va a dar diferencias en las ventas: es normal.</p>
      {controles.map(({ d, diferencias }) => (
        <div key={d.id}>
          <TituloSeccion titulo={<Link href={`${BASE}/${d.id}`} className="text-[#16577F] hover:underline">{IMPUESTOS[d.impuesto]} · {mesAr(d.periodo)}{d.rectificativa ? ` (rectificativa ${d.rectificativa})` : ""}</Link>} />
          <TablaDiferencias difs={diferencias} />
        </div>
      ))}
    </div>
  );
}

// ── Provincias y municipal ───────────────────────────────────────────

function Provincias({ rs, emisorId, sp }: { rs: NonNullable<Awaited<ReturnType<typeof datosRazonSocial>>>; emisorId: number; sp: SP }) {
  const base = url(BASE, { rs: String(emisorId), ver: "provincias" });
  const editMun = editandoFicha(sp, "municipal");
  const libres = CODIGOS_JURISDICCION.filter((c) => !rs.jurisdicciones.some((j) => j.codigo === c));
  return (
    <div className="grid gap-4">
      <div>
        <TituloSeccion titulo="Provincias de Ingresos Brutos (Convenio Multilateral)"><BotonNuevo texto={NUEVA_PROV} /></TituloSeccion>
        <AltaNueva texto={NUEVA_PROV} sinBoton className="mb-2">
          <form action={accionGrabarJurisdiccion} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="rs" value={emisorId} />
            <label><span className={ETIQUETA}>Provincia</span>
              <ElegirDeLista name="codigo" opciones={libres.map((c) => ({ id: c, texto: nombreJurisdiccion(c) }))} vacio="Elegí…" className="w-56" /></label>
            <label><span className={ETIQUETA}>Coeficiente unificado</span><input name="coeficiente" placeholder="0,8512" className={`${CAMPO} w-28 text-right`} /></label>
            <label><span className={ETIQUETA}>Alícuota %</span><input name="alicuota" placeholder="4,75" className={`${CAMPO} w-20 text-right`} /></label>
            <BotonEnviar clase={PRIMARIO}>Agregar</BotonEnviar>
          </form>
        </AltaNueva>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Provincia</th><th className={THN}>Coeficiente</th><th className={THN}>Alícuota</th><th className={TH} /></tr></thead>
            <tbody>
              {rs.jurisdicciones.length === 0 && <tr className={TR}><td colSpan={4} className={`${TD} text-[#5C6B76]`}>Sin provincias: se cargan solas al subir la declaración de Ingresos Brutos, o con «Nueva provincia».</td></tr>}
              {rs.jurisdicciones.map((j) => sp.editar === String(j.codigo) ? (
                <tr key={j.codigo} className={TR}>
                  <td className={TD}>{nombreJurisdiccion(j.codigo)}</td>
                  <td className={TDN}><input form={`j${j.codigo}`} name="coeficiente" defaultValue={String(j.coeficiente).replace(".", ",")} className={`${CAMPO} w-28 text-right`} /></td>
                  <td className={TDN}><input form={`j${j.codigo}`} name="alicuota" defaultValue={String(j.alicuota).replace(".", ",")} className={`${CAMPO} w-20 text-right`} /></td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <form id={`j${j.codigo}`} action={accionGrabarJurisdiccion} className="inline-flex gap-2">
                      <input type="hidden" name="rs" value={emisorId} /><input type="hidden" name="codigo" value={j.codigo} />
                      <BotonEnviar clase={PRIMARIO}>Guardar</BotonEnviar>
                      <Link href={base} className={SUAVE}>Cancelar</Link>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={j.codigo} className={TR}>
                  <td className={TD}>{nombreJurisdiccion(j.codigo)} <span className="text-[10px] text-[#5C6B76]">{j.codigo}</span></td>
                  <td className={TDN}>{j.coeficiente.toLocaleString("es-AR", { maximumFractionDigits: 8 })}</td>
                  <td className={TDN}>{j.alicuota.toLocaleString("es-AR")} %</td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <span className="inline-flex gap-2 items-center">
                      <Lapiz href={url(BASE, { rs: String(emisorId), ver: "provincias", editar: String(j.codigo) })} />
                      <TachoConfirmar accion={accionBorrarJurisdiccion} campos={{ rs: String(emisorId), codigo: String(j.codigo) }} pregunta="¿Quitarla?" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#5C6B76] mt-1">Cada provincia tiene su cuenta contable «IIBB — provincia» (Contabilidad, bajo «Ingresos Brutos por provincia»): ahí van sus percepciones.</p>
      </div>

      <div className={CAJA}>
        <TituloSeccion titulo="Municipalidad de Córdoba (contribución sobre el comercio y la industria)">
          {editMun ? (
            <><button type="submit" form="municipal" className={PRIMARIO}>Grabar</button><Link href={base} className={SUAVE}>Cancelar</Link></>
          ) : <Lapiz href={url(BASE, { rs: String(emisorId), ver: "provincias", editar: "municipal" })} />}
        </TituloSeccion>
        {editMun ? (
          <form id="municipal" action={accionGrabarMunicipal} className="grid sm:grid-cols-3 gap-3 items-end">
            <input type="hidden" name="rs" value={emisorId} />
            <label className="flex items-center gap-1.5 text-xs pb-2"><input type="checkbox" name="inscripta" defaultChecked={rs.municipal_inscripta} className="h-4 w-4" /> Paga la contribución</label>
            <label><span className={ETIQUETA}>Alícuota %</span><input name="alicuota" defaultValue={rs.municipal_alicuota ? String(Number(rs.municipal_alicuota)).replace(".", ",") : ""} className={`${CAMPO} w-24 text-right`} /></label>
            <label><span className={ETIQUETA}>Mínimo mensual $</span><input name="minimo" defaultValue={rs.municipal_minimo ? String(Number(rs.municipal_minimo)).replace(".", ",") : ""} className={`${CAMPO} w-32 text-right`} /></label>
          </form>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            <div><span className={ETIQUETA}>Paga la contribución</span><input type="checkbox" disabled checked={rs.municipal_inscripta} className="h-4 w-4 mt-2" /></div>
            <Dato etiqueta="Alícuota %" numero>{rs.municipal_alicuota ? Number(rs.municipal_alicuota).toLocaleString("es-AR") : null}</Dato>
            <Dato etiqueta="Mínimo mensual $" numero>{rs.municipal_minimo ? n2(Number(rs.municipal_minimo)) : null}</Dato>
          </div>
        )}
        <p className="text-[11px] text-[#5C6B76] mt-2">La alícuota y el mínimo se toman solos de la última declaración municipal que se sube.</p>
      </div>
    </div>
  );
}
