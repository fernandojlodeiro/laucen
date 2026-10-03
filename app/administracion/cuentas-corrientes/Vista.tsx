// Cuentas corrientes: la misma pantalla para clientes y proveedores. Sin
// tercero elegido, la tabla de saldos; con `?id=N`, su estado de cuenta con
// recibos / órdenes de pago, imputación a mano y saldo inicial.

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { formatear, hoyAR, tcDelDia } from "@/lib/moneda";
import { saldos, estadoDeCuenta, type Tercero } from "@/lib/administracion/cc";
import { PRIMARIO, SUAVE, VERDE, BORRAR } from "@/app/botones";
import { Pestanas, BotonConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import {
  Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import FormRecibo from "./FormRecibo";
import { accionEmitirRecibo, accionAnularRecibo, accionImputar, accionSaldoInicial } from "./acciones";

const BASE = "/administracion/cuentas-corrientes";
export type SP = { id?: string; q?: string; form?: string; tercero?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

const PESTANAS = [
  { href: BASE, texto: "Clientes" },
  { href: `${BASE}/proveedores`, texto: "Proveedores" },
];

const ars = (n: number) => formatear(n, "ARS");

/** Link al documento que originó el renglón (si tiene pantalla). */
function linkDocumento(tipo: string | null, id: number | null) {
  if (!id) return null;
  if (tipo === "factura_compra") return `/compras/facturas/${id}`;
  if (tipo === "comprobante") return `/administracion/facturacion/${id}`;
  return null;
}

export async function VistaCc({ org, tercero, sp }: { org: string; tercero: Tercero; sp: SP }) {
  const ruta = tercero === "cliente" ? BASE : `${BASE}/proveedores`;
  const terceroId = Number(sp.id) || 0;
  return (
    <Pantalla titulo="Cuentas corrientes" subtitulo="Lo que nos deben los clientes y lo que les debemos a los proveedores (en pesos)">
      <Pestanas items={PESTANAS} />
      <Avisos sp={sp} />
      {terceroId
        ? <EstadoDeCuenta org={org} tercero={tercero} terceroId={terceroId} ruta={ruta} sp={sp} />
        : <Saldos org={org} tercero={tercero} ruta={ruta} q={sp.q} sp={sp} />}
    </Pantalla>
  );
}

async function Saldos({ org, tercero, ruta, q, sp }: { org: string; tercero: Tercero; ruta: string; q?: string; sp: SP }) {
  const todas = await saldos(org, tercero);
  const filas = todas;
  const vista = paginarEnMemoria(ordenarEnMemoria(todas, sp, {
    nombre: (f) => f.nombre, saldo: (f) => f.saldo, vencido: (f) => f.vencido, ultimo: (f) => f.ultimo,
  }), sp);
  const total = filas.reduce((a, f) => a + f.saldo, 0), vencido = filas.reduce((a, f) => a + f.vencido, 0);
  const tabla = tercero === "cliente" ? "cliente" : "proveedor";
  const buscar = q?.trim();
  const encontrados = buscar
    ? await consulta<{ id: number; nombre: string }>(`select id::int, nombre from ${tabla} where organizacion_id = $1 and nombre ilike $2 order by nombre limit 20`,
        [org, `%${buscar}%`])
    : [];
  const quien = tercero === "cliente" ? "cliente" : "proveedor";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="flex gap-4 text-xs">
          <p>{tercero === "cliente" ? "Nos deben" : "Les debemos"}: <b className="tabular-nums">{ars(total)}</b></p>
          <p>Vencido: <b className={`tabular-nums ${vencido > 0 ? "text-[#C03420]" : ""}`}>{ars(vencido)}</b></p>
        </div>
        <form className="flex items-end gap-2">
          <label><span className={ETIQUETA}>Abrir la cuenta de otro {quien}</span>
            <input name="q" defaultValue={buscar} placeholder="Nombre" className={`${CAMPO} w-56`} /></label>
          <button className={SUAVE}>Buscar</button>
        </form>
      </div>
      {buscar && (
        <div className={`${CAJA} mb-3 text-xs`}>
          {encontrados.length === 0 ? <p className="text-[#5C6B76]">No encontré ningún {quien} con “{buscar}”.</p> : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {encontrados.map((e) => <li key={e.id}><Link href={`${ruta}?id=${e.id}`} className="text-[#16577F] underline">{e.nombre}</Link></li>)}
            </ul>
          )}
        </div>
      )}
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="nombre">{tercero === "cliente" ? "Cliente" : "Proveedor"}</ThOrden><ThOrden col="saldo" n>Saldo</ThOrden>
              <ThOrden col="vencido" n>Vencido</ThOrden><ThOrden col="ultimo" desc>Último movimiento</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>No hay cuentas con saldo ni movimientos recientes.</td></tr>}
            {vista.map((f) => (
              <tr key={f.id} className={TR}>
                <td className={TD}><Link href={`${ruta}?id=${f.id}`} className="text-[#16577F] font-semibold hover:underline">{f.nombre}</Link></td>
                <td className={TDN}>{ars(f.saldo)}</td>
                <td className={`${TDN} ${f.vencido > 0 ? "text-[#C03420]" : "text-[#5C6B76]"}`}>{f.vencido ? ars(f.vencido) : "—"}</td>
                <td className={TD}>{fecha(f.ultimo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={todas.length} />
    </>
  );
}

async function EstadoDeCuenta({ org, tercero, terceroId, ruta, sp }: { org: string; tercero: Tercero; terceroId: number; ruta: string; sp: SP }) {
  const tabla = tercero === "cliente" ? "cliente" : "proveedor";
  const t = await una<{ nombre: string }>(`select nombre from ${tabla} where id = $1 and organizacion_id = $2`, [terceroId, org]);
  if (!t) notFound();
  const esCobro = tercero === "cliente";
  const [movs, recibos, cuentas, tc] = await Promise.all([
    estadoDeCuenta(org, tercero, terceroId),
    consulta<{ id: number; numero: number; fecha: string; total_ars: number; estado: string; notas: string | null }>(`
      select id::int, numero::int, to_char(fecha, 'YYYY-MM-DD') fecha, total_ars::float, estado, notas
        from recibo where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3 order by fecha desc, numero desc limit 200`, [org, tercero, terceroId]),
    consulta<{ id: number; nombre: string; moneda: "ARS" | "USD" }>(
      "select id::int, nombre, moneda from cuenta_fondos where organizacion_id = $1 and activa order by tipo, nombre", [org]),
    tcDelDia(org),
  ]);
  const saldo = movs.length ? movs[movs.length - 1].saldo : 0;
  const hoy = hoyAR();
  const vencido = movs.reduce((a, m) => a + (m.pendiente > 0 && (m.vencimiento ?? m.fecha) < hoy ? m.pendiente * (m.importe ? m.importe_ars / m.importe : 1) : 0), 0);
  const debitos = movs.filter((m) => m.pendiente > 0.004), creditos = movs.filter((m) => m.pendiente < -0.004);
  const nombreDoc = esCobro ? "Recibo" : "Orden de pago";
  const campos = { tercero, id: String(terceroId) };
  const form = sp.form;
  const leyenda = (n: number) => (n > 0.004 ? (esCobro ? "nos debe" : "le debemos") : n < -0.004 ? (esCobro ? "le debemos" : "nos debe") : "");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold">
            <Link href={ruta} className="text-[#16577F] font-normal hover:underline">{esCobro ? "Clientes" : "Proveedores"}</Link> › {t.nombre}
          </p>
          <p className="text-xs mt-1">
            Saldo: <b className="tabular-nums">{ars(saldo)}</b> <span className="text-[#5C6B76]">{leyenda(saldo)}</span>
            {vencido > 0.004 && <> · Vencido: <b className="tabular-nums text-[#C03420]">{ars(vencido)}</b></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={url(ruta, { id: terceroId, form: form === "recibo" ? undefined : "recibo" })} className={PRIMARIO} scroll={false}>
            {esCobro ? "Nuevo recibo" : "Nueva orden de pago"}
          </Link>
          <Link href={url(ruta, { id: terceroId, form: form === "saldo" ? undefined : "saldo" })} className={SUAVE} scroll={false}>Saldo inicial</Link>
        </div>
      </div>

      {form === "recibo" && (
        <FormRecibo accion={accionEmitirRecibo} campos={campos} cuentas={cuentas} tc={tc?.venta ?? null} hoy={hoy} esCobro={esCobro} />
      )}

      {form === "saldo" && (
        <form action={accionSaldoInicial} className={`${CAJA} mb-4 flex flex-wrap items-end gap-3`}>
          {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label><span className={ETIQUETA}>Fecha</span><input type="date" name="fecha" defaultValue={hoy} className={CAMPO} /></label>
          <label><span className={ETIQUETA}>Importe (pesos)</span><CampoNumero name="importe" valor={null} tipo="pesos" className={`${CAMPO} w-32`} /></label>
          <fieldset className="flex items-center gap-3 text-xs pb-1.5">
            <label className="flex items-center gap-1"><input type="radio" name="signo" value="nos_debe" defaultChecked={esCobro} /> Nos debe</label>
            <label className="flex items-center gap-1"><input type="radio" name="signo" value="le_debemos" defaultChecked={!esCobro} /> Le debemos</label>
          </fieldset>
          <button className={VERDE}>Cargar saldo inicial</button>
        </form>
      )}

      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Fecha</th><th className={TH}>Vence</th><th className={TH}>Concepto</th><th className={THN}>Importe</th><th className={THN}>Pendiente</th><th className={THN}>Saldo</th></tr>
          </thead>
          <tbody>
            {movs.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Sin movimientos.</td></tr>}
            {movs.map((m) => {
              const href = linkDocumento(m.referencia_tipo, m.referencia_id);
              const mon = m.moneda === "USD" ? "USD" : "ARS";
              return (
                <tr key={m.id} className={TR}>
                  <td className={TD}>{fecha(m.fecha)}</td>
                  <td className={`${TD} ${m.pendiente > 0 && (m.vencimiento ?? m.fecha) < hoy ? "text-[#C03420]" : ""}`}>{m.vencimiento ? fecha(m.vencimiento) : "—"}</td>
                  <td className={TD}>{href ? <Link href={href} className="text-[#16577F] hover:underline">{m.descripcion}</Link> : m.descripcion}</td>
                  <td className={TDN}>
                    {ars(m.importe_ars)}
                    {mon === "USD" && <span className="block text-[10px] text-[#5C6B76]">{formatear(m.importe, "USD")}</span>}
                  </td>
                  <td className={`${TDN} ${Math.abs(m.pendiente) > 0.004 ? "" : "text-[#5C6B76]"}`}>{Math.abs(m.pendiente) > 0.004 ? formatear(m.pendiente, mon) : "—"}</td>
                  <td className={TDN}>{ars(m.saldo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {debitos.length > 0 && creditos.length > 0 && (
        <form action={accionImputar} className={`${CAJA} mb-4 flex flex-wrap items-end gap-3`}>
          {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <p className="w-full text-xs font-bold">Imputar a mano</p>
          <label><span className={ETIQUETA}>Deuda pendiente</span>
            <select name="debito" className={`${CAMPO} w-64`}>
              {debitos.map((m) => <option key={m.id} value={m.id}>{fecha(m.fecha)} · {m.descripcion} · {formatear(m.pendiente, m.moneda === "USD" ? "USD" : "ARS")}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Crédito pendiente</span>
            <select name="credito" className={`${CAMPO} w-64`}>
              {creditos.map((m) => <option key={m.id} value={m.id}>{fecha(m.fecha)} · {m.descripcion} · {formatear(-m.pendiente, m.moneda === "USD" ? "USD" : "ARS")}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Importe</span><CampoNumero name="importe" valor={null} tipo="pesos" className={`${CAMPO} w-32`} /></label>
          <button className={VERDE}>Imputar</button>
        </form>
      )}

      <h2 className="text-sm font-bold mb-2">{esCobro ? "Recibos" : "Órdenes de pago"}</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Número</th><th className={TH}>Fecha</th><th className={THN}>Total</th><th className={TH}>Estado</th><th className={TH}>Notas</th><th /></tr>
          </thead>
          <tbody>
            {recibos.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Todavía no hay.</td></tr>}
            {recibos.map((r) => (
              <tr key={r.id} className={TR}>
                <td className={TD}>{nombreDoc} {r.numero}</td>
                <td className={TD}>{fecha(r.fecha)}</td>
                <td className={TDN}>{ars(r.total_ars)}</td>
                <td className={TD}><Estado texto={r.estado === "anulado" ? "Anulado" : "Emitido"} tono={r.estado === "anulado" ? "rojo" : "verde"} /></td>
                <td className={`${TD} text-[#5C6B76]`}>{r.notas ?? ""}</td>
                <td className={`${TD} text-right`}>
                  {r.estado !== "anulado" && (
                    <span className="inline-flex justify-end">
                      <BotonConfirmar accion={accionAnularRecibo} campos={{ id: String(r.id), tercero, tercero_id: String(terceroId) }}
                        clase={BORRAR} texto="Anular" pregunta="¿Anular?" corriendo="Anulando…" />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
