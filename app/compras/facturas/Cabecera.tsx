// Los campos de la cabecera de una factura de compra: los usa el alta
// (nueva) y la edición del borrador (detalle, con las percepciones).

import { consulta } from "@/lib/erp/base";
import { tcDelDia } from "@/lib/moneda";
import { asegurarPlan, cuentasImputables } from "@/lib/administracion/contabilidad";
import CampoNumero from "@/app/componentes/CampoNumero";
import { CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { fecha as fechaAR } from "@/app/ventas/formato";
import { LETRAS } from "../comun";

export type DatosCabecera = {
  proveedor_id: number | null; letra: string; es_nota_credito: boolean; punto_venta: number | null; numero: string | null;
  fecha: string; vencimiento: string | null; moneda: "ARS" | "USD"; cotizacion: number | null;
  deposito_id: number | null; recepcion_id: number | null; cuenta_gasto_id: number | null; notas: string | null;
  percepcion_iva?: number; percepcion_iibb?: number; otros_impuestos?: number; no_gravado?: number;
};

/** Las listas para elegir (proveedor, depósito, recepción, cuenta) y la cotización del día. */
export async function opcionesCabecera(org: string) {
  await asegurarPlan(org);
  const [proveedores, depositos, recepciones, cuentas, tc] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from proveedor where organizacion_id = $1 and estado = 'activo' order by nombre", [org]),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo <> 'full_ml' order by id", [org]),
    consulta<{ id: number; creado_ts: Date; deposito: string; proveedor: string | null; documento: string | null }>(`
      select r.id::int, r.creado_ts, d.nombre deposito, pr.nombre proveedor, r.documento
        from recepcion r join deposito d on d.id = r.deposito_id left join proveedor pr on pr.id = r.proveedor_id
       where r.organizacion_id = $1 and r.tipo = 'compra' order by r.id desc limit 100`, [org]),
    cuentasImputables(org),
    tcDelDia(org),
  ]);
  return { proveedores, depositos, recepciones, cuentas, tc: tc?.venta ?? null };
}

export function CamposCabecera({ d, o, conImpuestos = false }: { d: DatosCabecera; o: Awaited<ReturnType<typeof opcionesCabecera>>; conImpuestos?: boolean }) {
  // Si el elegido quedó archivado, igual tiene que aparecer en la lista.
  const proveedorFuera = d.proveedor_id && !o.proveedores.some((p) => p.id === d.proveedor_id);
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 items-start">
      <label className="col-span-2"><span className={ETIQUETA}>Proveedor</span>
        <select name="proveedor" defaultValue={d.proveedor_id ?? ""} className={`${CAMPO} w-full`} required>
          <option value="">Elegí…</option>
          {proveedorFuera && <option value={d.proveedor_id!}>(proveedor archivado)</option>}
          {o.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>Letra</span>
        <select name="letra" defaultValue={d.letra} className={`${CAMPO} w-full`}>
          {LETRAS.map((l) => <option key={l} value={l}>{l}{l === "E" ? " (exterior)" : l === "X" ? " (otro, sin IVA)" : ""}</option>)}
        </select></label>
      <label className="flex items-center gap-2 text-xs pt-5">
        <input type="checkbox" name="es_nota_credito" defaultChecked={d.es_nota_credito} className="h-4 w-4" /> Es nota de crédito
      </label>
      <label><span className={ETIQUETA}>Punto de venta</span>
        <CampoNumero name="punto_venta" valor={d.punto_venta} tipo="entero" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Número</span>
        <CampoNumero name="numero" valor={d.numero != null ? Number(d.numero) : null} tipo="entero" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Fecha</span>
        <input type="date" name="fecha" defaultValue={d.fecha} className={`${CAMPO} w-full`} required /></label>
      <label><span className={ETIQUETA}>Vencimiento</span>
        <input type="date" name="vencimiento" defaultValue={d.vencimiento ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Moneda</span>
        <select name="moneda" defaultValue={d.moneda} className={`${CAMPO} w-full`}>
          <option value="ARS">Pesos</option><option value="USD">Dólares</option>
        </select></label>
      <label><span className={ETIQUETA}>Cotización (si es en dólares)</span>
        <CampoNumero name="cotizacion" valor={d.cotizacion ?? o.tc} tipo="decimal" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Depósito donde entra</span>
        <select name="deposito" defaultValue={d.deposito_id ?? ""} className={`${CAMPO} w-full`}>
          <option value="">—</option>
          {o.depositos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>O la recepción por la que ya entró</span>
        <select name="recepcion" defaultValue={d.recepcion_id ?? ""} className={`${CAMPO} w-full`}>
          <option value="">—</option>
          {o.recepciones.map((r) => (
            <option key={r.id} value={r.id}>#{r.id} · {fechaAR(r.creado_ts)} · {r.deposito}{r.proveedor ? ` · ${r.proveedor}` : ""}{r.documento ? ` · ${r.documento}` : ""}</option>
          ))}
        </select></label>
      <label className="col-span-2"><span className={ETIQUETA}>Cuenta de gasto (si no es mercadería)</span>
        <select name="cuenta_gasto" defaultValue={d.cuenta_gasto_id ?? ""} className={`${CAMPO} w-full`}>
          <option value="">— Es mercadería —</option>
          {o.cuentas.map((c) => <option key={c.id} value={c.id}>{c.codigo} {c.nombre}</option>)}
        </select></label>
      {conImpuestos && (
        <>
          <label><span className={ETIQUETA}>Percepción IVA</span>
            <CampoNumero name="percepcion_iva" valor={d.percepcion_iva ?? 0} tipo="pesos" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Percepción IIBB</span>
            <CampoNumero name="percepcion_iibb" valor={d.percepcion_iibb ?? 0} tipo="pesos" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Otros impuestos</span>
            <CampoNumero name="otros_impuestos" valor={d.otros_impuestos ?? 0} tipo="pesos" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>No gravado</span>
            <CampoNumero name="no_gravado" valor={d.no_gravado ?? 0} tipo="pesos" className={`${CAMPO} w-full`} /></label>
        </>
      )}
      <label className="col-span-2 sm:col-span-4"><span className={ETIQUETA}>Notas</span>
        <input name="notas" defaultValue={d.notas ?? ""} className={`${CAMPO} w-full`} /></label>
    </div>
  );
}
