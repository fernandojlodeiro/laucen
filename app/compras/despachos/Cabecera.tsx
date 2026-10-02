// Los campos de la cabecera de un despacho (alta y edición del borrador).
// El FOB no se carga: es la suma de las líneas.

import { consulta } from "@/lib/erp/base";
import { tcDelDia } from "@/lib/moneda";
import CampoNumero from "@/app/componentes/CampoNumero";
import { CAMPO, ETIQUETA } from "@/app/componentes/erp";

export type DatosDespacho = {
  numero: string | null; proveedor_id: number | null; fecha: string; cotizacion: number | null;
  flete_usd: number; seguro_usd: number; deposito_id: number | null; notas: string | null;
};

export async function opcionesDespacho(org: string) {
  const [proveedores, depositos, tc] = await Promise.all([
    // Primero los del exterior (país distinto de AR).
    consulta<{ id: number; nombre: string; pais: string }>(
      "select id::int, nombre, pais from proveedor where organizacion_id = $1 and estado = 'activo' order by (pais = 'AR'), nombre", [org]),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo <> 'full_ml' order by id", [org]),
    tcDelDia(org),
  ]);
  return { proveedores, depositos, tc: tc?.venta ?? null };
}

export function CamposDespacho({ d, o }: { d: DatosDespacho; o: Awaited<ReturnType<typeof opcionesDespacho>> }) {
  const proveedorFuera = d.proveedor_id && !o.proveedores.some((p) => p.id === d.proveedor_id);
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 items-start">
      <label><span className={ETIQUETA}>Nº de despacho</span>
        <input name="numero" defaultValue={d.numero ?? ""} placeholder="26001IC04012345X" className={`${CAMPO} w-full font-mono`} /></label>
      <label><span className={ETIQUETA}>Proveedor del exterior (opcional)</span>
        <select name="proveedor" defaultValue={d.proveedor_id ?? ""} className={`${CAMPO} w-full`}>
          <option value="">—</option>
          {proveedorFuera && <option value={d.proveedor_id!}>(proveedor archivado)</option>}
          {o.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.pais !== "AR" ? ` (${p.pais})` : ""}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>Fecha</span>
        <input type="date" name="fecha" defaultValue={d.fecha} className={`${CAMPO} w-full`} required /></label>
      <label><span className={ETIQUETA}>Cotización del dólar</span>
        <CampoNumero name="cotizacion" valor={d.cotizacion ?? o.tc} tipo="decimal" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Flete (US$)</span>
        <CampoNumero name="flete_usd" valor={d.flete_usd} tipo="usd" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Seguro (US$)</span>
        <CampoNumero name="seguro_usd" valor={d.seguro_usd} tipo="usd" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Depósito donde entra</span>
        <select name="deposito" defaultValue={d.deposito_id ?? ""} className={`${CAMPO} w-full`}>
          <option value="">—</option>
          {o.depositos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>Notas</span>
        <input name="notas" defaultValue={d.notas ?? ""} className={`${CAMPO} w-full`} /></label>
    </div>
  );
}
