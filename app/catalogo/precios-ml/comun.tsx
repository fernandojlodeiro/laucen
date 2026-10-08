// Piezas comunes de "Precios en Mercado Libre" y su vista previa: el
// selector de cuenta (canal) y la barra de pestañas con sus cuentas.

import Pestanas from "@/app/componentes/Pestanas";
import { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import { url } from "@/app/componentes/erp";
import { cuentasCanal, campanasBajoPisoCanal, type CanalMl } from "@/lib/precios-ml/datos";
import { BASE_PML, PREVIA } from "./lista";

export type VerPml = "general" | "excepciones" | "volumen" | "alertas" | "previa";

export async function BarraPml({ org, canales, canal, ver }: { org: string; canales: CanalMl[]; canal: CanalMl; ver: VerPml }) {
  const [n, bajo] = await Promise.all([cuentasCanal(org, canal.id), campanasBajoPisoCanal(org, canal.id)]);
  const con = (v: string | null) => url(BASE_PML, { canal: canal.id, ver: v });
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <label className="inline-flex items-center gap-2 text-xs text-[#5C6B76]">Cuenta
          <FiltroVivo parametro="canal" valor={String(canal.id)} etiqueta="Cuenta de Mercado Libre" limpiar={["editar", "nuevo", "p", "familia"]}>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </FiltroVivo>
        </label>
        <span className="text-[11px] text-[#5C6B76]">
          Clásica: lista {canal.lista ? <b>{canal.lista}</b> : <b className="text-[#C03420]">sin lista (cargala en Configuración → Canales)</b>}
          {canal.sincronizarPrecios ? " · sincroniza precios solo" : " · los cambios esperan tu clic"}
        </span>
      </div>
      <Pestanas className="mb-3" items={[
        { clave: "general", texto: "Descuento y planes", activa: ver === "general", href: con(null) },
        { clave: "excepciones", texto: "Excepciones", cuenta: n.excepciones, activa: ver === "excepciones", href: con("excepciones") },
        { clave: "volumen", texto: "Descuento por volumen", cuenta: n.volumen, activa: ver === "volumen", href: con("volumen") },
        { clave: "alertas", texto: "Alertas", cuenta: n.alertas + bajo.length, activa: ver === "alertas", href: con("alertas") },
        { clave: "previa", texto: "Vista previa", activa: ver === "previa", href: url(PREVIA, { canal: canal.id }) },
      ]} />
    </>
  );
}
