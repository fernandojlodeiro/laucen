// Cuentas corrientes: la misma pantalla para clientes y proveedores. Sin
// tercero elegido, la tabla de saldos; con `?id=N`, su estado de cuenta con
// recibos / órdenes de pago, imputación a mano y saldo inicial.

import { parametroBusqueda, sqlBusqueda, type CampoBusqueda } from "@/lib/busqueda";
import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { formatear, hoyAR, tcDelDia, type Moneda } from "@/lib/moneda";
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
import SelectorRazonSocial from "@/app/componentes/SelectorRazonSocial";
import { elegirRazonSocial, nombreRs, type EleccionRs } from "@/lib/razon-social";
import FormRecibo from "./FormRecibo";
import FormImputar, { type RenglonImputar } from "./FormImputar";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_CC_CLIENTES, LISTA_CC_PROVEEDORES } from "./lista";
import { accionEmitirRecibo, accionAnularRecibo, accionImputar, accionSaldoInicial } from "./acciones";

const BASE = "/administracion/cuentas-corrientes";
export type SP = { rs?: string; id?: string; q?: string; form?: string; tercero?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

const PESTANAS = [
  { href: BASE, texto: "Clientes" },
  { href: `${BASE}/proveedores`, texto: "Proveedores" },
];

/** Un importe de la cuenta corriente: en pesos, o en dólares exactos de su día (cada renglón guarda los dos). */
const plata = (moneda: Moneda, ars: number, usd: number | null | undefined) => (moneda === "USD" && usd != null ? formatear(usd, "USD") : formatear(ars, "ARS"));

/** Un renglón pendiente para "Imputar a mano": en positivo y en su moneda. */
const paraImputar = (m: { id: number; descripcion: string; moneda: string; pendiente: number; cot: number | null; fecha: string }, signo: 1 | -1): RenglonImputar =>
  ({ id: m.id, texto: m.descripcion, moneda: m.moneda === "USD" ? "USD" : "ARS", pendiente: signo * m.pendiente, cot: m.cot, fecha: m.fecha });

/** Link al documento que originó el renglón (si tiene pantalla). */
function linkDocumento(tipo: string | null, id: number | null) {
  if (!id) return null;
  if (tipo === "factura_compra") return `/compras/facturas/${id}`;
  if (tipo === "comprobante") return `/administracion/facturacion/${id}`;
  return null;
}

export async function VistaCc({ org, tercero, sp, moneda = "ARS" }: { org: string; tercero: Tercero; sp: SP; moneda?: Moneda }) {
  const ruta = tercero === "cliente" ? BASE : `${BASE}/proveedores`;
  const terceroId = Number(sp.id) || 0;
  // Cada razón social lleva su propia cuenta corriente con cada cliente o proveedor: se mira de una o de todas.
  const rs = await elegirRazonSocial(org, sp.rs);
  // Cada pestaña cuenta los clientes / proveedores que tienen cuenta corriente.
  const [n] = await consulta<{ cliente: number; proveedor: number }>(`
    select count(distinct tercero_id) filter (where tercero_tipo = 'cliente')::int cliente,
           count(distinct tercero_id) filter (where tercero_tipo = 'proveedor')::int proveedor
      from cc_movimiento where organizacion_id = $1`, [org]);
  return (
    <Pantalla titulo="Cuentas corrientes" subtitulo="Lo que nos deben los clientes y lo que les debemos a los proveedores (en pesos)">
      <Pestanas items={PESTANAS.map((x, i) => ({ ...x, href: url(x.href, { rs: rs.multi ? (rs.id ?? "todas") : null }), cuenta: (i === 0 ? n?.cliente : n?.proveedor) ?? 0 }))} />
      <Avisos sp={sp} />
      {rs.multi && (
        <div className="mb-3">
          <SelectorRazonSocial razones={rs.razones.map((x) => ({ id: x.id, nombre: nombreRs(x) }))} valor={rs.id} />
        </div>
      )}
      {terceroId
        ? <EstadoDeCuenta org={org} tercero={tercero} terceroId={terceroId} ruta={ruta} sp={sp} rs={rs} vista={moneda} />
        : <Saldos org={org} tercero={tercero} ruta={ruta} q={sp.q} sp={sp} rs={rs} vista={moneda} />}
    </Pantalla>
  );
}

/** Dónde se busca el cliente o proveedor (regla común, lib/busqueda.ts): todos sus campos de texto. */
const CAMPOS_TERCERO: Record<Tercero, CampoBusqueda[]> = {
  cliente: ["id::text", "nombre", "razon_social", "nombre_pila", "apellido", "apodo_ml", "email", "tipo", "documento_tipo",
    { num: "documento_numero" }, { num: "cuit" }, { num: "telefono" }, { num: "telefono_movil" }, "condicion_iva", "notas"],
  proveedor: ["id::text", "nombre", "razon_social", { num: "cuit" }, "condicion_iva", "pais", "email", { num: "telefono" },
    { num: "telefono_movil" }, "contacto", "calle", "localidad", "provincia", "codigo_postal", "moneda", "condiciones_pago", "notas", "estado"],
};

async function Saldos({ org, tercero, ruta, q, sp, rs, vista: moneda }: { org: string; tercero: Tercero; ruta: string; q?: string; sp: SP; rs: EleccionRs; vista: Moneda }) {
  const todas = await saldos(org, tercero, rs.id);
  const rsUrl = rs.multi ? (rs.id ?? "todas") : null;
  const filas = todas;
  const vista = paginarEnMemoria(ordenarEnMemoria(todas, sp, {
    nombre: (f) => f.nombre, saldo: (f) => f.saldo, vencido: (f) => f.vencido, ultimo: (f) => f.ultimo,
  }), sp);
  const total = filas.reduce((a, f) => a + f.saldo, 0), vencido = filas.reduce((a, f) => a + f.vencido, 0);
  const totalUsd = filas.reduce((a, f) => a + f.saldo_usd, 0), vencidoUsd = filas.reduce((a, f) => a + f.vencido_usd, 0);
  const tabla = tercero === "cliente" ? "cliente" : "proveedor";
  const buscar = q?.trim();
  const encontrados = buscar
    ? await consulta<{ id: number; nombre: string }>(`select id::int, nombre from ${tabla}
         where organizacion_id = $1 and ${sqlBusqueda("$2", CAMPOS_TERCERO[tercero])} order by nombre limit 20`,
        [org, parametroBusqueda(buscar)])
    : [];
  const quien = tercero === "cliente" ? "cliente" : "proveedor";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <AccionesExcel lista={tercero === "cliente" ? LISTA_CC_CLIENTES : LISTA_CC_PROVEEDORES} org={org} />
          <p>{tercero === "cliente" ? "Nos deben" : "Les debemos"}: <b className="tabular-nums">{plata(moneda, total, totalUsd)}</b></p>
          <p>Vencido: <b className={`tabular-nums ${vencido > 0 ? "text-[#C03420]" : ""}`}>{plata(moneda, vencido, vencidoUsd)}</b></p>
        </div>
        <form className="flex items-end gap-2">
          {rsUrl && <input type="hidden" name="rs" value={rsUrl} />}
          <label><span className={ETIQUETA}>Abrir la cuenta de otro {quien}</span>
            <input name="q" defaultValue={buscar} placeholder="Nombre" className={`${CAMPO} w-56`} /></label>
          <button className={SUAVE}>Buscar</button>
        </form>
      </div>
      {buscar && (
        <div className={`${CAJA} mb-3 text-xs`}>
          {encontrados.length === 0 ? <p className="text-[#5C6B76]">No encontré ningún {quien} con “{buscar}”.</p> : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {encontrados.map((e) => <li key={e.id}><Link href={url(ruta, { id: e.id, rs: rsUrl })} className="text-[#16577F] underline">{e.nombre}</Link></li>)}
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
                <td className={TD}><Link href={url(ruta, { id: f.id, rs: rsUrl })} className="text-[#16577F] font-semibold hover:underline">{f.nombre}</Link></td>
                <td className={TDN}>{plata(moneda, f.saldo, f.saldo_usd)}</td>
                <td className={`${TDN} ${f.vencido > 0 ? "text-[#C03420]" : "text-[#5C6B76]"}`}>{f.vencido ? plata(moneda, f.vencido, f.vencido_usd) : "—"}</td>
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

async function EstadoDeCuenta({ org, tercero, terceroId, ruta, sp, rs, vista: moneda }: { org: string; tercero: Tercero; terceroId: number; ruta: string; sp: SP; rs: EleccionRs; vista: Moneda }) {
  const rsUrl = rs.multi ? (rs.id ?? "todas") : null;
  const nombreDe = new Map(rs.razones.map((x) => [x.id, nombreRs(x)]));
  const tabla = tercero === "cliente" ? "cliente" : "proveedor";
  const t = await una<{ nombre: string }>(`select nombre from ${tabla} where id = $1 and organizacion_id = $2`, [terceroId, org]);
  if (!t) notFound();
  const esCobro = tercero === "cliente";
  const [movs, recibos, cuentas, tc] = await Promise.all([
    estadoDeCuenta(org, tercero, terceroId, rs.id),
    consulta<{ id: number; numero: number; fecha: string; total_ars: number; total_usd: number; estado: string; notas: string | null }>(`
      select id::int, numero::int, to_char(fecha, 'YYYY-MM-DD') fecha, total_ars::float, total_usd::float, estado, notas
        from recibo where organizacion_id = $1 and tercero_tipo = $2 and tercero_id = $3 and ($4::bigint is null or emisor_id = $4) order by fecha desc, numero desc limit 200`, [org, tercero, terceroId, rs.id]),
    consulta<{ id: number; nombre: string; moneda: "ARS" | "USD" }>(
      `select id::int, case when $2::boolean then nombre || ' · ' || coalesce((select coalesce(e.nombre, e.razon_social) from emisor e where e.id = cuenta_fondos.emisor_id), '') else nombre end nombre, moneda
         from cuenta_fondos where organizacion_id = $1 and activa and ($3::bigint is null or emisor_id = $3) order by emisor_id, tipo, nombre`, [org, rs.multi, rs.id]),
    tcDelDia(org),
  ]);
  const saldo = movs.length ? movs[movs.length - 1].saldo : 0;
  const saldoUsd = movs.length ? movs[movs.length - 1].saldo_usd : 0;
  const hoy = hoyAR();
  const vencido = movs.reduce((a, m) => a + (m.pendiente > 0 && (m.vencimiento ?? m.fecha) < hoy ? m.pendiente * (m.importe ? m.importe_ars / m.importe : 1) : 0), 0);
  const vencidoUsd = movs.reduce((a, m) => a + (m.pendiente > 0 && (m.vencimiento ?? m.fecha) < hoy ? m.pendiente * (m.importe ? m.importe_usd / m.importe : 1) : 0), 0);
  const debitos = movs.filter((m) => m.pendiente > 0.004), creditos = movs.filter((m) => m.pendiente < -0.004);
  const nombreDoc = esCobro ? "Recibo" : "Orden de pago";
  const campos = { tercero, id: String(terceroId), ...(rsUrl ? { rs: String(rsUrl) } : {}) };
  const form = sp.form;
  const leyenda = (n: number) => (n > 0.004 ? (esCobro ? "nos debe" : "le debemos") : n < -0.004 ? (esCobro ? "le debemos" : "nos debe") : "");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold">
            <Link href={url(ruta, { rs: rsUrl })} className="text-[#16577F] font-normal hover:underline">{esCobro ? "Clientes" : "Proveedores"}</Link> › {t.nombre}
          </p>
          <p className="text-xs mt-1">
            Saldo: <b className="tabular-nums">{plata(moneda, saldo, saldoUsd)}</b> <span className="text-[#5C6B76]">{leyenda(saldo)}</span>
            {vencido > 0.004 && <> · Vencido: <b className="tabular-nums text-[#C03420]">{plata(moneda, vencido, vencidoUsd)}</b></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={url(ruta, { id: terceroId, rs: rsUrl, form: form === "recibo" ? undefined : "recibo" })} className={PRIMARIO} scroll={false}>
            {esCobro ? "Nuevo recibo" : "Nueva orden de pago"}
          </Link>
          <Link href={url(ruta, { id: terceroId, rs: rsUrl, form: form === "saldo" ? undefined : "saldo" })} className={SUAVE} scroll={false}>Saldo inicial</Link>
        </div>
      </div>

      {form === "recibo" && (
        <FormRecibo accion={accionEmitirRecibo} campos={campos} cuentas={cuentas} tc={tc?.venta ?? null} hoy={hoy} esCobro={esCobro} />
      )}

      {form === "saldo" && (
        <form action={accionSaldoInicial} className={`${CAJA} mb-4 flex flex-wrap items-end gap-3`}>
          {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label><span className={ETIQUETA}>Fecha</span><input type="date" name="fecha" defaultValue={hoy} className={CAMPO} /></label>
          {rs.multi && (
            <label><span className={ETIQUETA}>Razón social</span>
              <select name="emisor" defaultValue={rs.id ?? rs.razones.find((x) => x.es_principal)?.id} className={CAMPO}>
                {rs.razones.map((x) => <option key={x.id} value={x.id}>{nombreRs(x)}</option>)}
              </select></label>
          )}
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
            <tr><th className={TH}>Fecha</th><th className={TH}>Vence</th><th className={TH}>Concepto</th>{rs.multi && !rs.id && <th className={TH}>Razón social</th>}<th className={THN}>Importe</th><th className={THN}>Pendiente</th><th className={THN}>Saldo</th></tr>
          </thead>
          <tbody>
            {movs.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Sin movimientos.</td></tr>}
            {movs.map((m) => {
              const href = linkDocumento(m.referencia_tipo, m.referencia_id);
              const mon = m.moneda === "USD" ? "USD" : "ARS";
              return (
                <tr key={m.id} className={TR}>
                  <td className={TD}>{fecha(m.fecha)}</td>
                  <td className={`${TD} ${m.pendiente > 0 && (m.vencimiento ?? m.fecha) < hoy ? "text-[#C03420]" : ""}`}>{m.vencimiento ? fecha(m.vencimiento) : "—"}</td>
                  <td className={TD}>{href ? <Link href={href} className="text-[#16577F] hover:underline">{m.descripcion}</Link> : m.descripcion}</td>
                  {rs.multi && !rs.id && <td className={TD}>{(m.emisor_id && nombreDe.get(m.emisor_id)) ?? "—"}</td>}
                  <td className={TDN}>
                    {plata(moneda, m.importe_ars, m.importe_usd)}
                    {mon === "USD" && <span className="block text-[10px] text-[#5C6B76]">{formatear(m.importe, "USD")}</span>}
                  </td>
                  <td className={`${TDN} ${Math.abs(m.pendiente) > 0.004 ? "" : "text-[#5C6B76]"}`}>{Math.abs(m.pendiente) > 0.004 ? formatear(m.pendiente, mon) : "—"}</td>
                  <td className={TDN}>{plata(moneda, m.saldo, m.saldo_usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {debitos.length > 0 && creditos.length > 0 && (
        <FormImputar accion={accionImputar} campos={campos}
          debitos={debitos.map((m) => paraImputar(m, 1))} creditos={creditos.map((m) => paraImputar(m, -1))} />
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
                <td className={TDN}>{plata(moneda, r.total_ars, r.total_usd)}</td>
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
