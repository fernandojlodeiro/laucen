// Caja y bancos: las cuentas de fondos (caja, bancos, Mercado Pago) con su
// saldo y lo que falta conciliar. Alta arriba, edición en la fila; el detalle
// de cada cuenta (movimientos y conciliación) está en ./[id].

import Link from "next/link";
import { redirect } from "next/navigation";
import { formatear, type Moneda } from "@/lib/moneda";
import { cuentasConSaldo } from "@/lib/administracion/tesoreria";
import { asegurarPlan, cuentasImputables } from "@/lib/administracion/contabilidad";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, ETIQUETA, url, coincideBusqueda,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import { accionCrearCuenta, accionGuardarCuenta, accionActivarCuenta, accionBorrarCuenta } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { c?: string; editar?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

const TIPOS_CUENTA: Record<string, string> = { caja: "Caja", banco: "Banco", mercadopago: "Mercado Pago", otro: "Otra" };

type Contable = { id: number; codigo: string; nombre: string };
type CuentaFila = Awaited<ReturnType<typeof cuentasConSaldo>>[number];

/** Los campos de una cuenta (los mismos en el alta y en la edición en fila). */
function Campos({ c, contables }: { c?: CuentaFila; contables: Contable[] }) {
  return (
    <>
      <label className="flex-1 min-w-40"><span className={ETIQUETA}>Nombre</span>
        <input name="nombre" defaultValue={c?.nombre} placeholder="Ej. Banco Galicia" className={`${CAMPO} w-full`} autoFocus /></label>
      <label><span className={ETIQUETA}>Tipo</span>
        <select name="tipo" defaultValue={c?.tipo ?? "banco"} className={CAMPO}>
          {Object.entries(TIPOS_CUENTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>Moneda</span>
        <select name="moneda" defaultValue={c?.moneda ?? "ARS"} className={CAMPO}>
          <option value="ARS">Pesos</option><option value="USD">Dólares</option>
        </select></label>
      <label><span className={ETIQUETA}>Banco</span><input name="banco" defaultValue={c?.banco ?? ""} className={`${CAMPO} w-32`} /></label>
      <label><span className={ETIQUETA}>CBU</span><input name="cbu" defaultValue={c?.cbu ?? ""} className={`${CAMPO} w-48`} inputMode="numeric" /></label>
      <label><span className={ETIQUETA}>Alias</span><input name="alias" defaultValue={c?.alias ?? ""} className={`${CAMPO} w-36`} /></label>
      <label><span className={ETIQUETA}>Saldo inicial</span>
        <CampoNumero name="saldo_inicial" valor={c?.saldo_inicial ?? null} tipo="pesos" className={`${CAMPO} w-28`} /></label>
      <label><span className={ETIQUETA}>Al día</span>
        <input type="date" name="saldo_inicial_fecha" defaultValue={c?.saldo_inicial_fecha ?? ""} className={CAMPO} /></label>
      <label><span className={ETIQUETA}>Cuenta contable</span>
        <select name="cuenta_contable_id" defaultValue={c?.cuenta_contable_id ?? ""} className={`${CAMPO} w-56`}>
          <option value="">— La de su tipo —</option>
          {contables.map((x) => <option key={x.id} value={x.id}>{x.codigo} {x.nombre}</option>)}
        </select></label>
    </>
  );
}

export default async function Tesoreria({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tesoreria_ver");
  const sp = await searchParams;
  if (Number(sp.c)) redirect(`/administracion/tesoreria/${Number(sp.c)}`);
  const editar = Number(sp.editar) || 0;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1", p: sp.p, orden: sp.orden, dir: sp.dir };
  await asegurarPlan(s.org.id);
  const [cuentas, contables] = await Promise.all([cuentasConSaldo(s.org.id), cuentasImputables(s.org.id)]);
  const nombreContable = new Map(contables.map((x) => [x.id, `${x.codigo} ${x.nombre}`]));
  const totales = { ARS: 0, USD: 0 };
  for (const c of cuentas) if (c.activa) totales[c.moneda as Moneda] += c.saldo;
  // El buscador filtra lo que se ve; los totales son de todas.
  const filtradas = cuentas.filter((c) => [c.nombre, c.banco, c.alias, c.cbu].some((t) => coincideBusqueda(t, q, comienza)));
  const vistas = paginarEnMemoria(ordenarEnMemoria(filtradas, sp, {
    nombre: (c) => c.nombre, tipo: (c) => TIPOS_CUENTA[c.tipo] ?? c.tipo, banco: (c) => c.banco, contable: (c) => (c.cuenta_contable_id ? nombreContable.get(c.cuenta_contable_id) : null),
    saldo: (c) => c.saldo, conciliar: (c) => c.sin_conciliar, activa: (c) => (c.activa ? 1 : 0),
  }), sp);

  return (
    <Pantalla titulo="Caja y bancos" subtitulo="Las cuentas donde está la plata, con su saldo y lo que falta conciliar con el extracto"
      acciones={<BotonNuevo texto="Nueva cuenta" />}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva cuenta" sinBoton>
        <form action={accionCrearCuenta} className="flex flex-wrap items-end gap-2">
          <Campos contables={contables} />
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>

      <p className="text-xs mb-2">
        Total en pesos: <b className="tabular-nums">{formatear(totales.ARS, "ARS")}</b>
        {totales.USD !== 0 && <> · en dólares: <b className="tabular-nums">{formatear(totales.USD, "USD")}</b></>}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por nombre, banco, CBU o alias" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="nombre">Cuenta</ThOrden><ThOrden col="tipo">Tipo</ThOrden><ThOrden col="banco">Banco · CBU · Alias</ThOrden><ThOrden col="contable">Cuenta contable</ThOrden>
              <ThOrden col="saldo" n>Saldo</ThOrden><ThOrden col="conciliar" n>Sin conciliar</ThOrden><ThOrden col="activa">Activa</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {vistas.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>{q ? "Ninguna cuenta coincide." : "Todavía no hay cuentas."}</td></tr>}
            {vistas.map((c) => editar === c.id ? (
              <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={8} className={TD}>
                  <form action={accionGuardarCuenta} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <Campos c={c} contables={contables} />
                    <button className={VERDE}>Guardar</button>
                    <Link href={url("/administracion/tesoreria", filtros)} className={SUAVE}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={c.id} className={`${TR} ${c.activa ? "" : "text-[#9AA7B3]"}`}>
                <td className={TD}>
                  <Link href={`/administracion/tesoreria/${c.id}`} className="text-[#16577F] font-semibold hover:underline">{c.nombre}</Link>
                  {c.saldo_inicial_fecha && <span className="block text-[10px] text-[#5C6B76]">Saldo inicial {formatear(c.saldo_inicial, c.moneda as Moneda)} al {fecha(c.saldo_inicial_fecha)}</span>}
                </td>
                <td className={TD}>{TIPOS_CUENTA[c.tipo] ?? c.tipo} · {c.moneda === "USD" ? "US$" : "$"}</td>
                <td className={`${TD} text-[#5C6B76]`}>{[c.banco, c.cbu, c.alias].filter(Boolean).join(" · ") || "—"}</td>
                <td className={`${TD} text-[#5C6B76]`}>{c.cuenta_contable_id
                  ? <Link href={url("/administracion/contabilidad", { p: "mayor", cuenta: c.cuenta_contable_id })} className="hover:text-[#16577F] hover:underline">{nombreContable.get(c.cuenta_contable_id) ?? "—"}</Link>
                  : "La de su tipo"}</td>
                <td className={`${TDN} font-semibold`}><Link href={`/administracion/tesoreria/${c.id}`} className="hover:underline">{formatear(c.saldo, c.moneda as Moneda)}</Link></td>
                <td className={TDN}>{c.sin_conciliar ? <Link href={`/administracion/tesoreria/${c.id}`} className="text-[#16577F] hover:underline">{c.sin_conciliar}</Link> : "—"}</td>
                <td className={TD}>
                  <Interruptor accion={accionActivarCuenta} prendido={c.activa} campos={{ id: String(c.id) }} etiqueta={c.activa ? "Sí" : "No"} />
                </td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url("/administracion/tesoreria", { ...filtros, editar: c.id })} />
                    <TachoConfirmar accion={accionBorrarCuenta} campos={{ id: String(c.id) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={filtradas.length} />
      <p className="text-[11px] text-[#5C6B76] mt-2">Una cuenta con movimientos no se borra: el tacho la desactiva.</p>
    </Pantalla>
  );
}
