// Administración → Facturación de Mercado Libre: lo que ML y Mercado Pago le
// cobran a cada cuenta, leído de su API (sólo lectura; de noche solo o con
// "Traer facturación de ML"). Por período:
//   · Resumen: cargos por tipo (comisión, envío, cargo fijo, publicidad,
//     impuestos, bonificaciones) y cuántos quedaron unidos a una venta;
//   · Retenciones y percepciones: el detalle y los totales, para el contador
//     (con Excel);
//   · Control con ARCA: cada factura / nota de crédito que ML dice haber
//     emitido contra las facturas de compra importadas de "Mis Comprobantes"
//     con el CUIT de Mercado Libre: cuáles están y cuáles faltan.
// Acá no se registra ninguna factura: entran por la importación de ARCA.

import Link from "next/link";
import { PRIMARIO, VERDE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import Pestanas from "@/app/componentes/Pestanas";
import { Paginado } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, Avisos, Estado, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { Desplegable } from "@/app/informes/Filtros";
import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { paginarEnMemoria } from "@/lib/lista";
import { CUITS_MERCADO_LIBRE } from "@/lib/administracion/arca-mc";
import { periodosLeidos, resumenPeriodo, impuestosPeriodo, controlPeriodo, TIPOS_CARGO, IMPUESTOS, type TipoCargo, type Impuesto } from "@/lib/mercadolibre/facturacion";
import { accionTraerFacturacionMl } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "/administracion/facturacion-ml";
const pesos = (n: number | null | undefined) => (n == null ? "—" : formatear(n, "ARS"));
const fechaAr = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "—");
const nombrePeriodo = (clave: string, hasta: string | null) => {
  const d = new Date(`${(hasta ?? clave).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? clave : d.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
};
const GRUPO: Record<string, string> = { ML: "Mercado Libre", MP: "Mercado Pago" };

type SP = { periodo?: string; ver?: string; p?: string; ok?: string; error?: string };

export default async function FacturacionMl({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("facturacion_ml_ver");
  const sp = await searchParams;
  const org = s.org.id;
  const [periodos, lecturas] = await Promise.all([
    periodosLeidos(org),
    consulta<{ nickname: string | null; ultimo_ts: Date; resultado: { avisos?: string[]; incompleto?: boolean } }>(`
      select mc.nickname, l.ultimo_ts, l.resultado from ml_facturacion_lectura l join meli_cuenta mc on mc.id = l.cuenta_id
       where l.organizacion_id = $1 order by mc.id`, [org]),
  ]);
  const periodo = periodos.find((p) => p.clave === sp.periodo) ?? periodos[0] ?? null;
  const ver = sp.ver === "impuestos" || sp.ver === "control" ? sp.ver : "resumen";
  const aqui = url(BASE, { periodo: sp.periodo, ver: sp.ver });
  const [resumen, impuestos, control] = periodo
    ? await Promise.all([resumenPeriodo(org, periodo.clave), impuestosPeriodo(org, periodo.clave), controlPeriodo(org, periodo.clave, CUITS_MERCADO_LIBRE)])
    : [[], [], { docs: [], sobran: [] }];
  const faltan = control.docs.filter((d) => !d.factura_id).length;

  return (
    <Pantalla titulo="Facturación de Mercado Libre"
      subtitulo="Lo que cobran Mercado Libre y Mercado Pago, leído de su API (sólo lectura): costo de cada venta, retenciones y percepciones, y el control contra las facturas importadas de ARCA. Las facturas se registran sólo por «Importar de ARCA»."
      acciones={<>
        {periodo && ver === "impuestos" && <a href={url(`${BASE}/excel`, { periodo: periodo.clave })} className={VERDE}>Descargar Excel</a>}
        <form action={accionTraerFacturacionMl}>
          <input type="hidden" name="volver" value={aqui} />
          <BotonEnviar clase={PRIMARIO} corriendo="Leyendo de Mercado Libre…">Traer facturación de ML</BotonEnviar>
        </form>
      </>}>
      <Avisos sp={sp} />
      {lecturas.length > 0 && (
        <p className="text-[11px] text-[#5C6B76] mb-2">
          Última lectura: {lecturas.map((l, i) => (
            <span key={i}>{i ? " · " : ""}{l.nickname ?? "cuenta"} {l.ultimo_ts.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {l.resultado?.incompleto ? " (quedó a medias)" : ""}{l.resultado?.avisos?.length ? ` — ${l.resultado.avisos[0]}` : ""}</span>
          ))}. Se lee sola cada noche.
        </p>
      )}
      {!periodo ? (
        <p className={`${CAJA} text-xs text-[#5C6B76]`}>Todavía no se leyó la facturación. Apretá «Traer facturación de ML».</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Desplegable parametro="periodo" etiqueta="Período" valor={periodo.clave} limpiar={["p"]}
              opciones={periodos.map((p) => ({ valor: p.clave, texto: `${nombrePeriodo(p.clave, p.hasta)}${p.desde && p.hasta ? ` (${fechaAr(p.desde)} al ${fechaAr(p.hasta)})` : ""}` }))} />
            {periodo.monto != null && <span className="text-xs text-[#5C6B76]">Total facturado por ML en el período: <b className="text-[#1B2A35]">{pesos(periodo.monto)}</b></span>}
          </div>
          <Pestanas items={[
            { clave: "resumen", texto: "Resumen", activa: ver === "resumen", href: url(BASE, { periodo: sp.periodo }) },
            { clave: "impuestos", texto: "Retenciones y percepciones", activa: ver === "impuestos", href: url(BASE, { periodo: sp.periodo, ver: "impuestos" }), cuenta: impuestos.length },
            { clave: "control", texto: "Control con ARCA", activa: ver === "control", href: url(BASE, { periodo: sp.periodo, ver: "control" }), cuenta: control.docs.length },
          ]} />
          {ver === "resumen" && <Resumen filas={resumen} />}
          {ver === "impuestos" && <Impuestos filas={impuestos} sp={sp} />}
          {ver === "control" && <Control docs={control.docs} sobran={control.sobran} faltan={faltan} />}
        </>
      )}
    </Pantalla>
  );
}

function Resumen({ filas }: { filas: Awaited<ReturnType<typeof resumenPeriodo>> }) {
  const tipos = Object.keys(TIPOS_CARGO) as TipoCargo[];
  const de = (g: string, t: string) => filas.find((f) => f.grupo === g && f.tipo === t);
  const total = (g?: string) => filas.filter((f) => !g || f.grupo === g).reduce((a, f) => a + f.monto, 0);
  if (!filas.length) return <p className={`${CAJA} text-xs text-[#5C6B76]`}>El período no tiene cargos leídos.</p>;
  return (
    <div className={CAJA_TABLA}>
      <table className={TABLA}>
        <thead className={THEAD}><tr><th className={TH}>Cargo</th><th className={THN}>Mercado Libre</th><th className={THN}>Mercado Pago</th><th className={THN}>Total</th><th className={THN}>Unidos a una venta</th></tr></thead>
        <tbody>
          {tipos.filter((t) => filas.some((f) => f.tipo === t)).map((t) => {
            const ml = de("ML", t), mp = de("MP", t);
            const n = (ml?.n ?? 0) + (mp?.n ?? 0), v = (ml?.vinculados ?? 0) + (mp?.vinculados ?? 0);
            return (
              <tr key={t} className={TR}>
                <td className={TD}>{TIPOS_CARGO[t]}</td>
                <td className={TDN}>{pesos(ml?.monto)}</td><td className={TDN}>{pesos(mp?.monto)}</td>
                <td className={`${TDN} font-semibold`}>{pesos((ml?.monto ?? 0) + (mp?.monto ?? 0))}</td>
                <td className={TDN}>{v.toLocaleString("es-AR")} de {n.toLocaleString("es-AR")}</td>
              </tr>
            );
          })}
          <tr className={`${TR} font-bold bg-[#FAFBFC]`}><td className={TD}>Total</td><td className={TDN}>{pesos(total("ML"))}</td><td className={TDN}>{pesos(total("MP"))}</td><td className={TDN}>{pesos(total())}</td><td className={TD} /></tr>
        </tbody>
      </table>
      <p className="px-2 py-1.5 text-[10px] text-[#5C6B76]">Importes tal como los factura Mercado Libre (con IVA). Las bonificaciones restan. Los cargos unidos a una venta se ven en la ficha del pedido y en el informe de rentabilidad.</p>
    </div>
  );
}

function Impuestos({ filas, sp }: { filas: Awaited<ReturnType<typeof impuestosPeriodo>>; sp: SP }) {
  if (!filas.length) return <p className={`${CAJA} text-xs text-[#5C6B76]`}>El período no tiene retenciones ni percepciones.</p>;
  const claves = Object.keys(IMPUESTOS) as Impuesto[];
  const suma = (i: Impuesto, g?: string) => filas.filter((f) => (f.impuesto ?? "otro") === i && (!g || f.grupo === g)).reduce((a, f) => a + f.monto, 0);
  return (
    <>
      <div className={`${CAJA_TABLA} mb-3`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Impuesto</th><th className={THN}>Mercado Libre</th><th className={THN}>Mercado Pago</th><th className={THN}>Total</th></tr></thead>
          <tbody>
            {claves.filter((i) => suma(i) !== 0).map((i) => (
              <tr key={i} className={TR}><td className={TD}>{IMPUESTOS[i]}</td><td className={TDN}>{pesos(suma(i, "ML"))}</td><td className={TDN}>{pesos(suma(i, "MP"))}</td><td className={`${TDN} font-semibold`}>{pesos(suma(i))}</td></tr>
            ))}
            <tr className={`${TR} font-bold bg-[#FAFBFC]`}><td className={TD}>Total</td><td className={TDN} /><td className={TDN} /><td className={TDN}>{pesos(filas.reduce((a, f) => a + f.monto, 0))}</td></tr>
          </tbody>
        </table>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={TH}>Cobra</th><th className={TH}>Impuesto</th><th className={TH}>Concepto</th><th className={TH}>Venta</th><th className={TH}>Comprobante de ML</th><th className={THN}>Importe</th></tr></thead>
          <tbody>
            {paginarEnMemoria(filas, sp).map((f) => (
              <tr key={f.id} className={TR}>
                <td className={`${TD} whitespace-nowrap`}>{f.fecha ? f.fecha.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "—"}</td>
                <td className={TD}>{GRUPO[f.grupo]}</td>
                <td className={TD}>{IMPUESTOS[f.impuesto ?? "otro"]}</td>
                <td className={TD}>{f.concepto ?? "—"}</td>
                <td className={`${TD} font-mono`}>{f.pedido_id ? <Link href={`/ventas/pedidos/${f.pedido_id}`} className="text-[#16577F] hover:underline">{f.order_id}</Link> : f.order_id ?? "—"}</td>
                <td className={`${TD} font-mono`}>{f.documento ?? "—"}</td>
                <td className={TDN}>{pesos(f.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={filas.length} />
    </>
  );
}

function Control({ docs, sobran, faltan }: Awaited<ReturnType<typeof controlPeriodo>> & { faltan: number }) {
  return (
    <>
      <p className={`text-xs rounded-lg px-3 py-2 mb-3 ${faltan ? "bg-[#FFF8E5] text-[#8a6100]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>
        {docs.length === 0 ? "Mercado Libre no informó facturas en este período."
          : faltan ? `${faltan} de ${docs.length} comprobantes de Mercado Libre no están en las facturas de compra: importá "Mis Comprobantes" de ARCA de ese mes (Compras → Facturas de compra).`
          : `Los ${docs.length} comprobantes de Mercado Libre están en las facturas de compra importadas de ARCA.`}
      </p>
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={TH}>Cobra</th><th className={TH}>Comprobante</th><th className={THN}>Importe según ML</th><th className={TH}>En las facturas de compra (ARCA)</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className={TR}>
                <td className={`${TD} whitespace-nowrap`}>{fechaAr(d.fecha)}</td>
                <td className={TD}>{GRUPO[d.grupo]}</td>
                <td className={TD}>{d.tipo === "CREDIT_NOTE" ? "Nota de crédito" : "Factura"} <span className="font-mono">{d.numero ?? "—"}</span></td>
                <td className={TDN}>{pesos(d.tipo === "CREDIT_NOTE" ? -d.monto : d.monto)}</td>
                <td className={TD}>
                  {d.factura_id
                    ? <><Link href={`/compras/facturas/${d.factura_id}`} className="text-[#16577F] hover:underline"><Estado texto="Está" tono="verde" /></Link>
                      {d.factura_total != null && Math.abs(d.factura_total - d.monto) > 1 && <span className="ml-1 text-[10px] text-[#8a6100]">con otro total ({pesos(d.factura_total)})</span>}</>
                    : <Estado texto="Falta en la importación de ARCA" tono="amarillo" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sobran.length > 0 && (
        <>
          <h2 className="text-sm font-bold mb-2">En ARCA y no en la API ({sobran.length})</h2>
          <p className="text-[11px] text-[#5C6B76] mb-2">Facturas de compra de Mercado Libre de esas fechas que no coinciden con ningún comprobante que informó la API (puede ser de otra cuenta o de otro período).</p>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Fecha</th><th className={TH}>Comprobante</th><th className={THN}>Total</th></tr></thead>
              <tbody>
                {sobran.map((f) => (
                  <tr key={f.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap`}>{fechaAr(f.fecha)}</td>
                    <td className={TD}><Link href={`/compras/facturas/${f.id}`} className="font-mono text-[#16577F] hover:underline">{f.es_nota_credito ? "NC " : ""}{f.letra} {f.punto_venta != null ? `${String(f.punto_venta).padStart(5, "0")}-` : ""}{String(f.numero ?? "").padStart(8, "0")}</Link></td>
                    <td className={TDN}>{pesos(f.es_nota_credito ? -f.total : f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
