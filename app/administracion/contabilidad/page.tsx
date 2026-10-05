// Contabilidad: los libros (diario, mayor, sumas y saldos, resultados), el
// asiento manual del contador y el plan de cuentas. Los asientos se generan
// solos (lib/administracion/contabilidad.ts); acá se miran y se ajustan.
// Todo en pesos: la contabilidad no usa la moneda de vista del usuario.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatear, hoyAR, type Moneda } from "@/lib/moneda";
import {
  asegurarPlan, planDeCuentas, cuentasImputables, libroDiario, libroMayor, sumasYSaldos, estadoDeResultados,
} from "@/lib/administracion/contabilidad";
import { proximoCodigo } from "@/lib/administracion/plan-codigos";
import { PRIMARIO, SUAVE, VERDE, APAGAR } from "@/app/botones";
import { TachoConfirmar, BotonConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import Pestanas from "@/app/componentes/Pestanas";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, coincideBusqueda,
} from "@/app/componentes/erp";
import SelectorRazonSocial from "@/app/componentes/SelectorRazonSocial";
import { elegirRazonSocial, nombreRs, type EleccionRs } from "@/lib/razon-social";
import { FormAsiento, InterruptorCampo } from "./piezas";
import {
  accionContabilizar, accionAsientoManual, accionAnularAsiento, accionCrearCuenta, accionGuardarCuenta, accionBorrarCuenta,
} from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/administracion/contabilidad";
const PESTANAS = [
  { p: "diario", texto: "Libro diario" },
  { p: "manual", texto: "Asiento manual" },
  { p: "mayor", texto: "Mayor" },
  { p: "sumas", texto: "Sumas y saldos" },
  { p: "resultados", texto: "Resultados" },
  { p: "plan", texto: "Plan de cuentas" },
] as const;
type P = (typeof PESTANAS)[number]["p"];

const ORIGEN: Record<string, string> = {
  venta: "Venta", nota_credito_venta: "Nota de crédito", cmv: "Costo de venta", cobro_pedido: "Cobro de pedido",
  compra: "Compra", despacho: "Despacho", cobro: "Recibo", pago: "Orden de pago", movimiento: "Movimiento",
  transferencia: "Transferencia", ajuste_stock: "Ajuste de stock", diferencia_cambio: "Diferencia de cambio",
  diferencia_recepcion: "Diferencia de recepción", manual: "Manual", apertura: "Apertura",
};
const TIPO: Record<string, string> = { activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio neto", ingreso: "Ingreso", egreso: "Egreso" };

type SP = { rs?: string; p?: string; desde?: string; hasta?: string; cuenta?: string; editar?: string; q?: string; contiene?: string; ok?: string; error?: string };

const esFecha = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
const fechaAR = (f: string) => f.split("-").reverse().join("/");
const sangria = (codigo: string) => (codigo.split(".").length - 1) * 16;

export default async function Contabilidad({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("contabilidad_ver");
  const org = s.org.id;
  await asegurarPlan(org);
  const sp = await searchParams;
  const p: P = PESTANAS.some((x) => x.p === sp.p) ? (sp.p as P) : "diario";
  const hoy = hoyAR();
  const desde = esFecha(sp.desde) ? sp.desde! : `${hoy.slice(0, 8)}01`;
  const hasta = esFecha(sp.hasta) ? sp.hasta! : hoy;
  // La dirección actual, para volver acá después de una acción.
  // Los libros son de cada razón social (el plan de cuentas es uno solo): se miran de una o de todas.
  const rs = await elegirRazonSocial(org, sp.rs);
  const rsParam = rs.multi ? (rs.id ?? "todas") : null;
  const aqui = url(BASE, { p, desde: sp.desde, hasta: sp.hasta, cuenta: sp.cuenta, rs: rsParam });
  const [cuentas] = await consulta<{ asientos: number; manuales: number; plan: number }>(`
    select (select count(*) from asiento where organizacion_id = $1 and fecha between $2 and $3 and estado = 'vigente' and ($4::bigint is null or emisor_id = $4))::int asientos,
           (select count(*) from asiento where organizacion_id = $1 and fecha between $2 and $3 and estado = 'vigente' and origen = 'manual' and ($4::bigint is null or emisor_id = $4))::int manuales,
           (select count(*) from plan_cuenta where organizacion_id = $1)::int plan`, [org, desde, hasta, rs.id]);

  return (
    <Pantalla titulo="Contabilidad" acciones={p === "plan" ? <BotonNuevo texto="Nueva cuenta" /> : undefined}
      subtitulo="Los asientos se generan solos desde las ventas, compras, despachos, recibos, movimientos de fondos y ajustes de stock; acá se ven los libros y se cargan los ajustes del contador.">
      <Pestanas items={PESTANAS.map((x) => ({
        clave: x.p, texto: x.texto, activa: p === x.p,
        href: url(BASE, { p: x.p === "diario" ? null : x.p, desde: sp.desde, hasta: sp.hasta, rs: rsParam }),
        // Lo que se cuenta: los asientos del período (diario y manuales) y las cuentas del plan.
        cuenta: x.p === "diario" ? cuentas.asientos : x.p === "manual" ? cuentas.manuales : x.p === "plan" ? cuentas.plan : null,
      }))} />
      <Avisos sp={sp} />
      {p === "diario" && <Diario org={org} desde={desde} hasta={hasta} aqui={aqui} rs={rs} moneda={s.moneda} />}
      {p === "manual" && <Manual org={org} hoy={hoy} rs={rs} />}
      {p === "mayor" && <Mayor org={org} desde={desde} hasta={hasta} cuenta={Number(sp.cuenta) || 0} rs={rs} moneda={s.moneda} />}
      {p === "sumas" && <Sumas org={org} desde={desde} hasta={hasta} rs={rs} moneda={s.moneda} />}
      {p === "resultados" && <Resultados org={org} desde={desde} hasta={hasta} rs={rs} moneda={s.moneda} />}
      {p === "plan" && <Plan org={org} editar={Number(sp.editar) || 0} q={sp.q?.trim() ?? ""} comienza={sp.contiene !== "1"} />}
    </Pantalla>
  );
}

/** Filtro desde/hasta con atajos (RangoFechas), más lo que la pestaña necesite.
 *  Todo cambia la dirección al momento; la pestaña (?p=) queda. */
function Periodo({ desde, hasta, rs, children }: { p: P; desde: string; hasta: string; rs: EleccionRs; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      {rs.multi && <SelectorRazonSocial razones={rs.razones.map((x) => ({ id: x.id, nombre: nombreRs(x) }))} valor={rs.id} />}
      {children}
      <RangoFechas desde={desde} hasta={hasta} etiqueta="Período" />
    </div>
  );
}

// ── 1. Libro diario ────────────────────────────────────────

async function Diario({ org, desde, hasta, aqui, rs, moneda }: { org: string; desde: string; hasta: string; aqui: string; rs: EleccionRs; moneda: Moneda }) {
  // Los libros se llevan en pesos; en dólares, cada línea al dólar del día de su asiento.
  const $ = (x: number) => formatear(x, moneda);
  const asientos = await libroDiario(org, desde, hasta, rs.id, moneda);
  const vigentes = asientos.filter((a) => a.estado === "vigente");
  const totDebe = vigentes.reduce((t, a) => t + a.lineas.reduce((u, l) => u + l.debe, 0), 0);
  const totHaber = vigentes.reduce((t, a) => t + a.lineas.reduce((u, l) => u + l.haber, 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Periodo p="diario" desde={desde} hasta={hasta} rs={rs} />
        <form action={accionContabilizar} className="mb-3">
          <input type="hidden" name="volver" value={aqui} />
          <BotonEnviar clase={PRIMARIO} corriendo="Contabilizando…">Contabilizar ahora</BotonEnviar>
        </form>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Código</th><th className={TH}>Cuenta</th><th className={THN}>Debe</th><th className={THN}>Haber</th><th className={TH}>Detalle</th></tr>
          </thead>
          {asientos.length === 0 && <tbody><tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>No hay asientos en el período.</td></tr></tbody>}
          {asientos.map((a) => {
            const anulado = a.estado === "anulado";
            const gris = anulado ? "line-through text-[#9AA7B2]" : "";
            return (
              <tbody key={a.id} id={`a${a.id}`} className="border-t-2 border-[#E3E9F0]">
                <tr className="bg-[#FAFBFC]">
                  <td colSpan={5} className={TD}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`flex flex-wrap items-center gap-2 ${gris}`}>
                        <b>Asiento {a.numero}</b>
                        <span className="tabular-nums">{fechaAR(a.fecha)}</span>
                        <span>{a.concepto}</span>
                        <Estado texto={ORIGEN[a.origen] ?? a.origen} tono={a.origen === "manual" || a.origen === "apertura" ? "amarillo" : "azul"} />
                        {anulado && <Estado texto="Anulado" tono="gris" />}
                      </span>
                      {!anulado && (a.origen === "manual" || a.origen === "apertura") && (
                        <BotonConfirmar accion={accionAnularAsiento} campos={{ id: String(a.id), volver: aqui }} clase={APAGAR}
                          texto="Anular" pregunta={`¿Anular el asiento ${a.numero}?`} corriendo="Anulando…" />
                      )}
                    </div>
                  </td>
                </tr>
                {a.lineas.map((l, i) => (
                  <tr key={i} className={`${TR} ${gris}`}>
                    <td className={`${TD} tabular-nums`}>{l.codigo}</td>
                    <td className={TD} style={{ paddingLeft: l.haber > 0 ? 28 : undefined }}>{l.nombre}</td>
                    <td className={TDN}>{l.debe ? $(l.debe) : ""}</td>
                    <td className={TDN}>{l.haber ? $(l.haber) : ""}</td>
                    <td className={`${TD} text-[#5C6B76]`}>{l.detalle}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
          {asientos.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#E3E9F0] font-bold">
                <td className={TD} colSpan={2}>Totales del período (sin anulados)</td>
                <td className={TDN}>{$(totDebe)}</td>
                <td className={TDN}>{$(totHaber)}</td>
                <td className={TD}>{Math.abs(totDebe - totHaber) > 0.005 && <Estado texto="No coinciden" tono="rojo" />}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

// ── 2. Asiento manual ──────────────────────────────────────

async function Manual({ org, hoy, rs }: { org: string; hoy: string; rs: EleccionRs }) {
  const cuentas = await cuentasImputables(org);
  return (
    <>
      <p className="text-xs text-[#5C6B76] mb-2">Para ajustes del contador o el asiento de apertura. Cada renglón lleva debe o haber (no los dos), y el total del debe tiene que dar igual al del haber.</p>
      <FormAsiento accion={accionAsientoManual} cuentas={cuentas} hoy={hoy}
        razones={rs.multi ? rs.razones.map((x) => ({ id: x.id, nombre: nombreRs(x) })) : []} razonInicial={rs.id ?? rs.razones.find((x) => x.es_principal)?.id ?? null} />
    </>
  );
}

// ── 3. Mayor ───────────────────────────────────────────────

async function Mayor({ org, desde, hasta, cuenta, rs, moneda }: { org: string; desde: string; hasta: string; cuenta: number; rs: EleccionRs; moneda: Moneda }) {
  // Los libros se llevan en pesos; en dólares, cada línea al dólar del día de su asiento.
  const $ = (x: number) => formatear(x, moneda);
  const cuentas = (await planDeCuentas(org)).filter((c) => c.imputable);
  const elegida = cuentas.find((c) => c.id === cuenta);
  const mayor = elegida ? await libroMayor(org, elegida.id, desde, hasta, rs.id, moneda) : null;
  const totDebe = mayor?.movimientos.reduce((t, m) => t + m.debe, 0) ?? 0;
  const totHaber = mayor?.movimientos.reduce((t, m) => t + m.haber, 0) ?? 0;

  return (
    <>
      <Periodo p="mayor" desde={desde} hasta={hasta} rs={rs}>
        <FiltroVivo parametro="cuenta" valor={elegida?.id ? String(elegida.id) : ""} etiqueta="Cuenta">
          <option value="">Elegí una cuenta…</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}{c.activa ? "" : " (inactiva)"}</option>)}
        </FiltroVivo>
      </Periodo>
      {!mayor ? <p className="text-xs text-[#5C6B76]">Elegí una cuenta para ver sus movimientos.</p> : (
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr><th className={TH}>Fecha</th><th className={TH}>Asiento</th><th className={TH}>Concepto</th><th className={THN}>Debe</th><th className={THN}>Haber</th><th className={THN}>Saldo</th></tr>
            </thead>
            <tbody>
              <tr className={`${TR} bg-[#FAFBFC]`}>
                <td className={TD} colSpan={5}>Saldo anterior al {fechaAR(desde)}</td>
                <td className={`${TDN} font-bold`}>{$(mayor.anterior)}</td>
              </tr>
              {mayor.movimientos.length === 0 && <tr className={TR}><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Sin movimientos en el período.</td></tr>}
              {mayor.movimientos.map((m, i) => (
                <tr key={i} className={TR}>
                  <td className={`${TD} tabular-nums`}>{fechaAR(m.fecha)}</td>
                  <td className={TD}>
                    <Link href={`${url(BASE, { desde: m.fecha, hasta: m.fecha, rs: rs.multi ? (rs.id ?? "todas") : null })}#a${m.asiento_id}`} className="text-[#16577F] underline">{m.numero}</Link>
                  </td>
                  <td className={TD}>{m.concepto}{m.detalle && <span className="text-[#5C6B76]"> · {m.detalle}</span>}</td>
                  <td className={TDN}>{m.debe ? $(m.debe) : ""}</td>
                  <td className={TDN}>{m.haber ? $(m.haber) : ""}</td>
                  <td className={TDN}>{$(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#E3E9F0] font-bold">
                <td className={TD} colSpan={3}>Totales del período</td>
                <td className={TDN}>{$(totDebe)}</td>
                <td className={TDN}>{$(totHaber)}</td>
                <td className={TDN}>{$(mayor.movimientos.at(-1)?.saldo ?? mayor.anterior)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}

// ── 4. Sumas y saldos ──────────────────────────────────────

async function Sumas({ org, desde, hasta, rs, moneda }: { org: string; desde: string; hasta: string; rs: EleccionRs; moneda: Moneda }) {
  // Los libros se llevan en pesos; en dólares, cada línea al dólar del día de su asiento.
  const $ = (x: number) => formatear(x, moneda);
  const filas = await sumasYSaldos(org, desde, hasta, rs.id, moneda);
  const t = filas.reduce((a, f) => ({
    debe: a.debe + f.debe, haber: a.haber + f.haber,
    deudor: a.deudor + (f.saldo > 0 ? f.saldo : 0), acreedor: a.acreedor + (f.saldo < 0 ? -f.saldo : 0),
  }), { debe: 0, haber: 0, deudor: 0, acreedor: 0 });
  const iguales = (x: number, y: number) => Math.abs(x - y) < 0.005;

  return (
    <>
      <Periodo p="sumas" desde={desde} hasta={hasta} rs={rs} />
      <p className="text-xs text-[#5C6B76] mb-2">Debe y haber son los del período; el saldo es el acumulado al {fechaAR(hasta)}.</p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Código</th><th className={TH}>Cuenta</th><th className={THN}>Debe</th><th className={THN}>Haber</th><th className={THN}>Saldo deudor</th><th className={THN}>Saldo acreedor</th></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>No hay movimientos hasta esa fecha.</td></tr>}
            {filas.map((f) => (
              <tr key={f.id} className={TR}>
                <td className={`${TD} tabular-nums`}>{f.codigo}</td>
                <td className={TD}>{f.nombre}</td>
                <td className={TDN}>{f.debe ? $(f.debe) : ""}</td>
                <td className={TDN}>{f.haber ? $(f.haber) : ""}</td>
                <td className={TDN}>{f.saldo > 0.004 ? $(f.saldo) : ""}</td>
                <td className={TDN}>{f.saldo < -0.004 ? $(-f.saldo) : ""}</td>
              </tr>
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#E3E9F0] font-bold">
                <td className={TD} colSpan={2}>
                  Totales{" "}
                  {iguales(t.debe, t.haber) && iguales(t.deudor, t.acreedor) ? <Estado texto="Coinciden" tono="verde" /> : <Estado texto="No coinciden" tono="rojo" />}
                </td>
                <td className={TDN}>{$(t.debe)}</td>
                <td className={TDN}>{$(t.haber)}</td>
                <td className={TDN}>{$(t.deudor)}</td>
                <td className={TDN}>{$(t.acreedor)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

// ── 5. Resultados ──────────────────────────────────────────

async function Resultados({ org, desde, hasta, rs, moneda }: { org: string; desde: string; hasta: string; rs: EleccionRs; moneda: Moneda }) {
  // Los libros se llevan en pesos; en dólares, cada línea al dólar del día de su asiento.
  const $ = (x: number) => formatear(x, moneda);
  const r = await estadoDeResultados(org, desde, hasta, rs.id, moneda);
  const bloque = (titulo: string, filas: typeof r.ingresos, total: number) => (
    <>
      <tr className="bg-[#FAFBFC]"><td colSpan={3} className={`${TD} font-bold`}>{titulo}</td></tr>
      {filas.length === 0 && <tr className={TR}><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Nada en el período.</td></tr>}
      {filas.map((f) => (
        <tr key={f.codigo} className={TR}>
          <td className={`${TD} tabular-nums`}>{f.codigo}</td>
          <td className={TD}>{f.nombre}</td>
          <td className={TDN}>{$(f.importe)}</td>
        </tr>
      ))}
      <tr className={`${TR} font-bold`}><td className={TD} colSpan={2}>Total {titulo.toLowerCase()}</td><td className={TDN}>{$(total)}</td></tr>
    </>
  );
  const gana = r.resultado >= 0;

  return (
    <>
      <Periodo p="resultados" desde={desde} hasta={hasta} rs={rs} />
      <div className={`${CAJA_TABLA} max-w-2xl`}>
        <table className={TABLA}>
          <tbody>
            {bloque("Ingresos", r.ingresos, r.totalIngresos)}
            {bloque("Egresos", r.egresos, r.totalEgresos)}
          </tbody>
          <tfoot>
            <tr className={`border-t-2 border-[#E3E9F0] font-bold text-sm ${gana ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
              <td className={TD} colSpan={2}>{gana ? "Ganancia" : "Pérdida"} del período</td>
              <td className={TDN}>{$(r.resultado)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ── 6. Plan de cuentas ─────────────────────────────────────

async function Plan({ org, editar, q, comienza }: { org: string; editar: number; q: string; comienza: boolean }) {
  const [cuentas, enFondos] = await Promise.all([
    planDeCuentas(org),
    // Las cuentas que nombra una cuenta de fondos o un movimiento también están "usadas".
    consulta<{ id: number }>(`
      select distinct cuenta_contable_id::int id from cuenta_fondos where organizacion_id = $1 and cuenta_contable_id is not null
      union select distinct cuenta_contable_id::int from movimiento_fondos where organizacion_id = $1 and cuenta_contable_id is not null`, [org]),
  ]);
  const usadaFondos = new Set(enFondos.map((x) => x.id));
  const volver = url(BASE, { p: "plan", q: q || null, contiene: comienza ? null : "1" });
  const vistas = cuentas.filter((c) => coincideBusqueda(c.codigo, q, comienza) || coincideBusqueda(c.nombre, q, comienza));
  // El tipo viene en Egreso: el código ya sugerido es el próximo libre de egreso.
  const sugerido = proximoCodigo(cuentas, "egreso");

  return (
    <>
      <AltaNueva texto="Nueva cuenta" sinBoton>
      <form action={accionCrearCuenta} className="flex flex-wrap items-end gap-2">
        <label><span className={ETIQUETA}>Código</span><input name="codigo" defaultValue={sugerido} placeholder="5.2.06" className={`${CAMPO} w-24`} /></label>
        <label className="flex-1 min-w-48"><span className={ETIQUETA}>Nombre</span><input name="nombre" placeholder="Ej. Publicidad" className={`${CAMPO} w-full`} autoFocus /></label>
        <label><span className={ETIQUETA}>Tipo</span>
          <select name="tipo" defaultValue="egreso" className={CAMPO}>
            {Object.entries(TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs pb-2"><input type="checkbox" name="imputable" defaultChecked className="h-4 w-4" /> Imputable</label>
        <button className={PRIMARIO}>Crear</button>
      </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar cuenta por código o nombre" limpiar={["editar"]} />
      </div>
      <p className="text-xs text-[#5C6B76] mb-2">Las imputables reciben asientos; las otras son títulos que agrupan. Las marcadas &quot;automática&quot; las usan los asientos que se generan solos: se pueden renombrar o recodificar, no borrar. Las &quot;ventas del canal …&quot; y las de Mercado Pago de cada cuenta de Mercado Libre y de la tienda web se crean solas.</p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Código</th><th className={TH}>Cuenta</th><th className={TH}>Tipo</th><th className={TH}>Imputable</th><th className={TH}>Estado</th><th /></tr>
          </thead>
          <tbody>
            {vistas.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Ninguna cuenta coincide.</td></tr>}
            {vistas.map((c) => editar === c.id ? (
              <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={6} className={TD}>
                  <form action={accionGuardarCuenta} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="codigo" defaultValue={c.codigo} className={`${CAMPO} w-24`} aria-label="Código" />
                    <input name="nombre" defaultValue={c.nombre} className={`${CAMPO} flex-1 min-w-40`} aria-label="Nombre" autoFocus />
                    <span className="text-[#5C6B76]">{TIPO[c.tipo]} · {c.imputable ? "imputable" : "título"}</span>
                    {c.rol && <Estado texto={`automática: ${c.rol}`} tono="azul" />}
                    {c.vinculo && <Estado texto={c.vinculo} tono="azul" />}
                    <InterruptorCampo name="activa" prendido={c.activa} etiqueta="Activa" />
                    <button className={VERDE}>Guardar</button>
                    <Link href={volver} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={c.id} className={`${TR} ${c.activa ? "" : "text-[#9AA7B2]"}`}>
                <td className={`${TD} tabular-nums`} style={{ paddingLeft: 8 + sangria(c.codigo) }}>{c.codigo}</td>
                <td className={`${TD} ${c.imputable ? "" : "font-bold"}`} style={{ paddingLeft: 8 + sangria(c.codigo) }}>
                  {c.nombre}{" "}
                  {c.rol && <Estado texto={`automática: ${c.rol}`} tono="azul" />}
                  {c.vinculo && <Estado texto={c.vinculo} tono="azul" />}
                </td>
                <td className={TD}>{TIPO[c.tipo]}</td>
                <td className={TD}>{c.imputable ? "Sí" : "Título"}</td>
                <td className={TD}><Estado texto={c.activa ? "Activa" : "Inactiva"} tono={c.activa ? "verde" : "gris"} /></td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE, { p: "plan", q: q || null, contiene: comienza ? null : "1", editar: c.id })} />
                    {!c.rol && !c.vinculo && !c.usada && !usadaFondos.has(c.id) && (
                      <TachoConfirmar accion={accionBorrarCuenta} campos={{ id: String(c.id) }} pregunta="¿Borrar?" />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
