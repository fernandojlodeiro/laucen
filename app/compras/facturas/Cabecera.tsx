// Los campos de la cabecera de una factura de compra: los usa el alta
// (nueva) y la edición del borrador (detalle, con las percepciones).

import { consulta } from "@/lib/erp/base";
import { tcDelDia } from "@/lib/moneda";
import { asegurarPlan, cuentasImputables } from "@/lib/administracion/contabilidad";
import CampoNumero from "@/app/componentes/CampoNumero";
import { CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { fecha as fechaAR } from "@/app/ventas/formato";
import { emisoresDe } from "@/lib/arca/facturar";
import { LETRAS } from "../comun";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import { CODIGOS_JURISDICCION, nombreJurisdiccion } from "@/lib/impuestos/jurisdicciones";
import { cuitLegible } from "@/lib/cuit";
import { accionCrearProveedorRapido } from "@/app/compras/proveedores/acciones";
import { accionCrearCuentaGasto } from "./acciones";

export type DatosCabecera = {
  proveedor_id: number | null; letra: string; es_nota_credito: boolean; punto_venta: number | null; numero: string | null;
  fecha: string; vencimiento: string | null; moneda: "ARS" | "USD"; cotizacion: number | null;
  deposito_id: number | null; recepcion_id: number | null; cuenta_gasto_id: number | null; notas: string | null;
  percepcion_iva?: number; percepcion_iibb?: number; otros_impuestos?: number; no_gravado?: number;
  /** A nombre de qué razón social viene facturada (el stock entra igual al general); sin dato, la principal. */
  emisor_id?: number | null;
  /** La provincia de la percepción de IIBB (si es una sola; con varias, viene null y se respeta el detalle leído). */
  iibb_jur?: number | null;
  /** Con varias provincias, el detalle tal cual (para mostrarlo). */
  iibb_detalle?: { jur: number; importe: number }[] | null;
};

/** Las listas para elegir (proveedor, depósito, recepción, cuenta) y la cotización del día. */
export async function opcionesCabecera(org: string) {
  await asegurarPlan(org);
  const [proveedores, depositos, recepciones, cuentas, tc, razones] = await Promise.all([
    consulta<{ id: number; nombre: string; cuit: string | null; pais: string }>("select id::int, nombre, cuit, pais from proveedor where organizacion_id = $1 and estado = 'activo' order by nombre", [org]),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo not in ('full_ml', 'transito') order by id", [org]),
    consulta<{ id: number; creado_ts: Date; deposito: string; proveedor: string | null; documento: string | null }>(`
      select r.id::int, r.creado_ts, d.nombre deposito, pr.nombre proveedor, r.documento
        from recepcion r join deposito d on d.id = r.deposito_id left join proveedor pr on pr.id = r.proveedor_id
       where r.organizacion_id = $1 and r.tipo = 'compra' order by r.id desc limit 100`, [org]),
    cuentasImputables(org),
    tcDelDia(org),
    emisoresDe(org),
  ]);
  return { proveedores, depositos, recepciones, cuentas, tc: tc?.venta ?? null, razones };
}

export function CamposCabecera({ d, o, conImpuestos = false }: { d: DatosCabecera; o: Awaited<ReturnType<typeof opcionesCabecera>>; conImpuestos?: boolean }) {
  // Si el elegido quedó archivado, igual tiene que aparecer en la lista.
  const proveedorFuera = d.proveedor_id && !o.proveedores.some((p) => p.id === d.proveedor_id);
  // Proveedor con buscador y «+ Crear» ahí mismo (Fer, 22/10).
  const opcionesProv = [
    ...(proveedorFuera ? [{ id: d.proveedor_id!, texto: "(proveedor archivado)" }] : []),
    ...o.proveedores.map((p) => ({ id: p.id, texto: p.nombre, detalle: p.cuit ? cuitLegible(p.cuit) : p.pais !== "AR" ? p.pais : undefined })),
  ];
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 items-start">
      <div className="col-span-2"><span className={ETIQUETA}>Proveedor</span>
        <ElegirDeLista name="proveedor" opciones={opcionesProv} valor={d.proveedor_id} vacio="Sin proveedor" placeholder="Buscá o creá el proveedor…"
          etiqueta="Proveedor" crear={accionCrearProveedorRapido} /></div>
      {o.razones.length > 1 && (
        <label className="col-span-2"><span className={ETIQUETA}>A nombre de (razón social)</span>
          <select name="emisor" defaultValue={d.emisor_id ?? o.razones.find((r) => r.es_principal)?.id} className={`${CAMPO} w-full`}>
            {o.razones.map((r) => <option key={r.id} value={r.id}>{r.nombre ?? r.razon_social}</option>)}
          </select>
          <span className="block text-[10px] text-[#5C6B76] mt-0.5">La mercadería entra al stock general igual, sea a nombre de quien sea.</span></label>
      )}
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
      {/* Con buscador y «+ Crear» (Fer, 23/10); la elegida queda recordada en el proveedor. */}
      <div className="col-span-2"><span className={ETIQUETA}>Cuenta de gasto (si no es mercadería; queda recordada en el proveedor)</span>
        <ElegirDeLista name="cuenta_gasto" valor={d.cuenta_gasto_id} vacio="— Es mercadería —" placeholder="Buscá o creá la cuenta…" etiqueta="Cuenta de gasto"
          opciones={o.cuentas.map((c) => ({ id: c.id, texto: `${c.codigo} ${c.nombre}` }))} crear={accionCrearCuentaGasto} /></div>
      {conImpuestos && (
        <>
          <label><span className={ETIQUETA}>Percepción IVA</span>
            <CampoNumero name="percepcion_iva" valor={d.percepcion_iva ?? 0} tipo="pesos" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Percepción IIBB</span>
            <CampoNumero name="percepcion_iibb" valor={d.percepcion_iibb ?? 0} tipo="pesos" className={`${CAMPO} w-full`} /></label>
          <div><span className={ETIQUETA}>Provincia de la percepción IIBB</span>
            {(d.iibb_detalle?.length ?? 0) > 1
              ? <span className="block text-[11px] text-[#5C6B76] pt-1.5">{d.iibb_detalle!.map((x) => `${nombreJurisdiccion(x.jur)} ${x.importe.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`).join(" · ")}</span>
              : <ElegirDeLista name="iibb_jur" valor={d.iibb_jur ?? null} vacio="La del proveedor (o Córdoba)" etiqueta="Provincia de la percepción IIBB"
                  opciones={CODIGOS_JURISDICCION.map((c) => ({ id: c, texto: nombreJurisdiccion(c) }))} />}</div>
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
