// Precios en Mercado Libre › Planes de cuotas (la última pestaña; Fer, 8/10): qué planes de cuotas de
// Mercado Libre se crean, por grupo de categorías (hoy «Notebooks» y
// «Resto»), cuántas cuotas ve el comprador en cada uno (a mano y "a chequear":
// ML no lo informa) y el % extra sobre lo que deja la Clásica. Vale para todas
// las cuentas. Los planes van desde la Clásica en que ML empieza a dar envío
// gratis (lo lee de Costos ML). Cada grupo es una caja que se edita por
// separado (lápiz y Grabar en su título; el modo va en ?editar=g<id>).

import Link from "next/link";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, TituloSeccion, BotonesFicha, ValorVista, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO,
} from "@/app/componentes/erp";
import { formatear } from "@/lib/moneda";
import { formatearNumero } from "@/lib/numeros";
import { gruposPlanes, barreraPlanes, comisionReferencia, type GrupoPlanes, type Gana } from "@/lib/precios-ml/grupos";
import { PLANES, PLAN_INFO, precioPlan, FRANJA_SIN_PLANES_PCT, type Comisiones, type PlanOClasica } from "@/lib/precios-ml/motor";
import { accionGuardarGrupo } from "./acciones";
import { BarraPml } from "../comun";
import { PLANES_PML, canalElegido } from "../lista";

export const dynamic = "force-dynamic";

const BASE = PLANES_PML;
type SP = { canal?: string; editar?: string; ok?: string; error?: string };

const pct = (v: number) => `${formatearNumero(Math.round(v * 10) / 10, "pct")} %`;
const EJEMPLO = 100_000;

export default async function PlanesCuotas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ml_ver");
  const sp = await searchParams;
  const [grupos, barrera, referencia, { canales, canal }] = await Promise.all([gruposPlanes(s.org.id), barreraPlanes(), comisionReferencia(s.org.id), canalElegido(s.org.id, sp)]);
  return (
    <Pantalla titulo="Precios en Mercado Libre"
      subtitulo="Planes de cuotas: qué publicaciones de cuotas se crean además de la Clásica, por grupo de categorías. Vale para todas las cuentas de Mercado Libre.">
      <Avisos sp={sp} />
      {canal && <BarraPml org={s.org.id} canales={canales} canal={canal} ver="planes" />}
      <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#EEF4FA] text-[#16577F]">
        Mercado Libre da envío gratis desde <b>{formatear(barrera, "ARS")}</b> (lo toma solo de los costos de Mercado Libre; si cambia, se ajusta).
        Cada plan va desde la Clásica que dice su columna «Desde»: vacío, desde el envío gratis; 0, siempre.
        Ningún plan se crea si su precio cae a menos de {FRANJA_SIN_PLANES_PCT} % abajo del envío gratis (entre <b>{formatear(Math.round(barrera * (1 - FRANJA_SIN_PLANES_PCT / 100)), "ARS")}</b> y {formatear(barrera, "ARS")}), para que no lo cruce por poco.
      </p>
      <div className="grid gap-4">
        {grupos.map((g) => <Grupo key={g.id} g={g} canal={canal?.id ?? null} cuentas={canales.map((c) => ({ id: c.id, nombre: c.nombre }))}
          editando={sp.editar === `g${g.id}`} referencia={referencia.get(g.id) ?? null} barrera={barrera} />)}
        {!grupos.length && <p className="text-xs text-[#5C6B76]">Todavía no hay grupos de planes.</p>}
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-3">
        <b>Comisión extra sobre la Clásica</b>: cuántos puntos más que la Clásica cobra Mercado Libre por ese plan, en la categoría con más productos publicados del grupo (cada producto usa la de su propia categoría).
        <b> Cuotas que ve el comprador</b>: Mercado Libre no lo informa y cambia según la categoría y las fechas especiales; se carga a mano mirando una publicación y conviene volver a chequearlo.
        <b> % extra sobre la Clásica</b>: cuánto más tiene que dejarte ese plan, después de su comisión, que lo que te deja la Clásica. Precio del plan = Clásica × (1 − comisión de la Clásica) ÷ (1 − comisión del plan) × (1 + % extra).
        <b> Quién gana</b>: tus cuentas venden lo mismo; para que no compitan entre ellas, una sola tiene el precio más bajo de cada publicación (la Clásica y cada plan) y las demás van el % de abajo más caras. «Rota» reparte los productos parejo entre las cuentas que no ganan nada fijo en el grupo (cada producto, siempre la misma). Un producto o una categoría puede tener otra cosa en la pestaña Excepciones.
        El descuento que ve el comprador va en las otras pestañas de <Link href="/catalogo/precios-ml" className="text-[#16577F] hover:underline">Precios en Mercado Libre</Link>; en la vista previa se ve qué cambia en cada publicación antes de mandarlo.
      </p>
    </Pantalla>
  );
}

function Grupo({ g, canal, cuentas, editando, referencia, barrera }: { g: GrupoPlanes; canal: number | null; cuentas: { id: number; nombre: string }[]; editando: boolean; referencia: { categoria: string; ruta: string | null; productos: number; comisiones: Comisiones } | null; barrera: number }) {
  const form = `grupo${g.id}`;
  const c = referencia?.comisiones ?? null;
  const usados = PLANES.filter((p) => g.planes[p].usar).length;
  // Quién gana (Fer, 8/10): una cuenta fija o «Rota» (los productos se reparten parejo entre las cuentas que no ganan nada fijo).
  const textoGana = (x: Gana) => (x === "rota" ? "Rota" : cuentas.find((c) => c.id === x)?.nombre ?? "—");
  const celdaGana = (p: PlanOClasica) => (
    <td className={TD}>
      {editando
        ? <select name={`${p}_gana`} defaultValue={String(g.gana[p])} className={`${CAMPO} w-40`} aria-label={`Quién gana ${p === "clasica" ? "la Clásica" : PLAN_INFO[p].nombre}`}>
            <option value="rota">Rota</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        : <ValorVista className="w-40">{textoGana(g.gana[p])}</ValorVista>}
    </td>
  );
  return (
    <section className={CAJA}>
      <TituloSeccion titulo={<>{g.nombre} <span className="font-normal text-[#5C6B76]">({usados} plan{usados === 1 ? "" : "es"} además de la Clásica)</span></>}>
        <BotonesFicha editando={editando} ver={url(BASE, { canal })} editar={url(BASE, { canal, editar: `g${g.id}` })} form={form} />
      </TituloSeccion>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        {g.familias.length ? <>Categorías: {g.nombresFamilias.join(", ")} (y sus subcategorías).</> : "Todas las categorías que no están en otro grupo."}
        {referencia ? <> Comisiones de referencia: {referencia.ruta ?? referencia.categoria} ({referencia.productos} producto{referencia.productos === 1 ? "" : "s"} publicados).</> : " Sin comisiones de referencia todavía."}
      </p>
      <form id={form} action={accionGuardarGrupo}>
        <input type="hidden" name="grupo" value={g.id} />
        <input type="hidden" name="canal" value={canal ?? ""} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Plan</th><th className={TH}>Usar</th><th className={THN}>Comisión extra sobre la Clásica</th>
                <th className={THN}>Cuotas que ve el comprador <span className="font-normal">(a chequear)</span></th><th className={THN}>% extra sobre la Clásica</th>
                <th className={THN} title="Desde qué precio de la Clásica se crea el plan. Vacío: desde el envío gratis. 0: siempre.">Desde (Clásica)</th>
                <th className={THN}>Con una Clásica de {formatear(EJEMPLO, "ARS")}</th>
                <th className={TH} title="La cuenta que tiene el precio más bajo para esta publicación; las demás van más caras para no competir entre ellas">Quién gana</th>
              </tr>
            </thead>
            <tbody>
              <tr className={TR}>
                <td className={TD}>Clásica</td>
                <td className={TD}><input type="checkbox" checked disabled readOnly aria-label="La Clásica va siempre" className="h-4 w-4 accent-[#16577F]" /></td>
                <td className={TDN}>—</td><td className={TDN}>—</td><td className={TDN}>—</td><td className={TDN}>Siempre</td>
                <td className={TDN}>{formatear(EJEMPLO, "ARS")}</td>
                {celdaGana("clasica")}
              </tr>
              {PLANES.map((p) => {
                const x = g.planes[p];
                const extra = c ? c[p] - c.clasica : null;
                const ejemplo = c && x.usar ? precioPlan(EJEMPLO, c.clasica, c[p], x.margenPct ?? 0) : null;
                return (
                  <tr key={p} className={TR}>
                    <td className={TD}>{PLAN_INFO[p].nombre}</td>
                    <td className={TD}>
                      <input type="checkbox" name={`${p}_usar`} defaultChecked={x.usar} disabled={!editando} aria-label={`Usar ${PLAN_INFO[p].nombre}`} className="h-4 w-4 accent-[#16577F]" />
                    </td>
                    <td className={TDN}>{extra != null ? `+${pct(extra)}` : "—"}</td>
                    <td className={TD}>
                      {editando
                        ? <CampoNumero name={`${p}_cuotas`} valor={x.cuotasVisibles} tipo="entero" placeholder="?" className={`${CAMPO} w-16 ml-auto block`} />
                        : <ValorVista numero className="w-16 ml-auto">{x.cuotasVisibles ?? "?"}</ValorVista>}
                    </td>
                    <td className={TD}>
                      {editando
                        ? <CampoNumero name={`${p}_margen`} valor={x.margenPct} tipo="pct" placeholder="—" className={`${CAMPO} w-20 ml-auto block`} />
                        : <ValorVista numero className="w-20 ml-auto">{x.margenPct != null ? pct(x.margenPct) : null}</ValorVista>}
                    </td>
                    <td className={TD}>
                      {editando
                        ? <CampoNumero name={`${p}_desde`} valor={x.desdePrecio ?? null} tipo="pesos" placeholder="envío gratis" className={`${CAMPO} w-28 ml-auto block`} />
                        : <ValorVista numero className="w-28 ml-auto">{x.desdePrecio == null ? `Envío gratis` : x.desdePrecio === 0 ? "Siempre" : formatear(x.desdePrecio, "ARS")}</ValorVista>}
                    </td>
                    <td className={TDN}>{ejemplo != null ? formatear(ejemplo, "ARS") : "—"}</td>
                    {celdaGana(p)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs">
          <span>Las cuentas que no ganan van</span>
          {editando
            ? <CampoNumero name="no_gana" valor={g.ajusteNoGana} tipo="pct" className={`${CAMPO} w-20`} />
            : <ValorVista numero className="w-20">{pct(g.ajusteNoGana)}</ValorVista>}
          <span>más caras.</span>
        </div>
      </form>
    </section>
  );
}
