// Ficha del producto, pestaña Preventa: lo que el producto dice de la preventa (si no dice nada, vale lo general de
// Ventas › Preventas › Configuración) y lo que viene llegando de él con lo que se ofrece hoy en cada canal.

import Link from "next/link";
import { Dato, Estado, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { consulta, una } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { configPreventa, ofertasPreventa } from "@/lib/preventa";
import { diaAr } from "@/lib/compras/invoices";
import { accionGuardarPreventaProducto } from "./acciones-preventa";

const siNo = (v: boolean | null, general: boolean) => (v == null ? `Lo general (${general ? "sí" : "no"})` : v ? "Sí" : "No");

export default async function PreventaProducto({ org, productoId, editando, noPublicable, nuncaMl }: { org: string; productoId: number; editando: boolean; noPublicable: boolean; nuncaMl: boolean }) {
  const [p, cfg, variaciones, canales] = await Promise.all([
    una<{ web: boolean | null; ml: boolean | null; mu: number | null; mp: number | null; modo: string | null; d: number | null }>(`
      select preventa_web web, preventa_ml ml, preventa_margen_unidades mu, preventa_margen_pct::float8 mp, preventa_margen_modo modo, preventa_descuento_pct::float8 d
        from producto where id = $1 and organizacion_id = $2`, [productoId, org]),
    configPreventa(org),
    consulta<{ id: number; sku: string }>("select id::int, sku from variacion where producto_id = $1 and organizacion_id = $2 and estado = 'activa' order by es_default desc, sku", [productoId, org]),
    consulta<{ id: number; nombre: string; tipo: string }>("select id::int, nombre, tipo from canal where organizacion_id = $1 and estado = 'activo' and tipo in ('web_minorista', 'mercadolibre') order by tipo desc, nombre", [org]),
  ]);
  if (!p) return null;
  const ofertas = await Promise.all(canales.map(async (c) => ({ c, o: await ofertasPreventa(org, variaciones.map((v) => v.id), { id: c.id, tipo: c.tipo === "mercadolibre" ? "ml" : "web" }) })));
  const sel = (name: string, v: boolean | null) => (
    <select name={name} defaultValue={v == null ? "" : v ? "si" : "no"} className={`${CAMPO} w-full`}>
      <option value="">Lo general</option><option value="si">Sí</option><option value="no">No</option>
    </select>
  );
  return (
    <>
      {(noPublicable || nuncaMl) && (
        <p className="text-xs mb-3 rounded-lg px-3 py-2 bg-[#FFF8E8] text-[#8a6100]">
          {noPublicable ? "Es «No publicable»: no tiene preventa en ningún canal." : "Tiene «Jamás publicar en Mercado Libre»: no tiene preventa en Mercado Libre."}
        </p>
      )}
      <form id="ficha" action={accionGuardarPreventaProducto} className={`${CAJA} grid grid-cols-2 sm:grid-cols-6 gap-3 items-start mb-4`}>
        <input type="hidden" name="producto_id" value={productoId} />
        {editando ? (
          <>
            <label><span className={ETIQUETA}>Preventa en la web</span>{sel("preventa_web", p.web)}</label>
            <label><span className={ETIQUETA}>Preventa en Mercado Libre</span>{sel("preventa_ml", p.ml)}</label>
            <label><span className={ETIQUETA}>Descuento de preventa %</span><CampoNumero name="descuento_pct" valor={p.d} tipo="pct" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Margen de seguridad (u.)</span><CampoNumero name="margen_unidades" valor={p.mu} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Margen de seguridad %</span><CampoNumero name="margen_pct" valor={p.mp} tipo="pct" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Toma</span>
              <select name="margen_modo" defaultValue={p.modo ?? ""} className={`${CAMPO} w-full`}><option value="">El general</option><option value="menor">El menor</option><option value="mayor">El mayor</option></select></label>
          </>
        ) : (
          <>
            <Dato etiqueta="Preventa en la web">{siNo(p.web, cfg.admiteWeb)}</Dato>
            <Dato etiqueta="Preventa en Mercado Libre">{siNo(p.ml, cfg.admiteMl)}</Dato>
            <Dato etiqueta="Descuento de preventa %" numero>{p.d != null ? formatearNumero(p.d, "pct") : null}</Dato>
            <Dato etiqueta="Margen de seguridad (u.)" numero>{p.mu != null ? String(p.mu) : null}</Dato>
            <Dato etiqueta="Margen de seguridad %" numero>{p.mp != null ? formatearNumero(p.mp, "pct") : null}</Dato>
            <Dato etiqueta="Toma">{p.modo ? `El ${p.modo}` : null}</Dato>
          </>
        )}
        <p className="col-span-2 sm:col-span-6 text-[11px] text-[#5C6B76]">
          Vacíos: el descuento y el margen de la orden; si la orden no los tiene, los generales ({formatearNumero(cfg.descuentoPct, "pct")} % de descuento; margen {cfg.margenUnidades ?? "—"} u. / {cfg.margenPct ?? "—"} %, el {cfg.margenModo}). <Link href="/ventas/preventas?ver=config" className="text-[#16577F] underline">Configuración general</Link>.
        </p>
      </form>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Variación</th><th className={TH}>Canal</th><th className={TH}>Hoy</th><th className={TH}>Orden</th><th className={TH}>Llega</th><th className={THN}>Cupo</th><th className={THN}>Descuento</th></tr></thead>
          <tbody>
            {ofertas.flatMap(({ c, o }) => variaciones.map((v) => {
              const x = o.get(v.id);
              return (
                <tr key={`${c.id}-${v.id}`} className={TR} data-canal={c.id}>
                  <td className={`${TD} font-mono`}>{v.sku}</td><td className={TD}>{c.nombre}</td>
                  <td className={TD}>{x ? <Estado texto="En preventa" tono="azul" /> : <span className="text-[11px] text-[#5C6B76]">Normal (o sin nada que ofrecer)</span>}</td>
                  <td className={TD}>{x ? <Link href={`/compras/ordenes/${x.ordenId}`} className="font-mono text-[#16577F] hover:underline">{x.codigo}</Link> : ""}</td>
                  <td className={TD}>{x ? diaAr(x.llegada) : ""}</td><td className={TDN}>{x ? x.cupo : ""}</td><td className={TDN}>{x ? `${formatearNumero(x.descuentoPct, "pct")} %` : ""}</td>
                </tr>
              );
            }))}
            {!canales.length && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>No hay canales de la web ni de Mercado Libre.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
