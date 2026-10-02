// Una corrida de la importación desde Virtual Seller: mientras analiza, el
// avance; analizada, el resumen y las diferencias de IVA (con el botón para
// corregirlas en ML) y "Importar"; importando o terminada, el avance y los
// rechazos.

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { ESTADOS_VS } from "../estados";
import Refrescar from "../Refrescar";
import { accionCorregirIva, accionCorregirSku, accionImportarVs, accionReintentarVs } from "../acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Resumen = {
  ml_leidas?: number; ml_completo?: boolean; con_stock?: number; publicados?: number; sin_publicar?: number; inactivos?: number;
  notebooks_descartadas?: number; stock_sin_maestro?: string[]; kits?: number; kits_armados?: number; kits_sin_componente?: string[]; kits_sin_cantidad?: string[]; columna_iva?: string | null;
  iva_diferencias?: { sku: string; titulo: string; vs: number; ml: number; items: string[] }[];
  publicaciones?: { total: number; sin_sku: number; sin_producto: number };
  iva_corregido?: { ok: number; errores: string[]; items: string[] }; importados?: number; con_error?: number;
  sku_diferencias?: { item: string; sku_ml: string | null; sku: string }[]; packs_renombrados?: number;
  sku_corregido?: { ok: number; errores: string[]; items: string[] };
};

const n = (x: number | undefined) => (x ?? 0).toLocaleString("es-AR");

export default async function CorridaVs({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("importar_ver");
  const iid = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(iid) || iid <= 0) notFound();
  const imp = await una<{ estado: string; resumen: Resumen; archivos: Record<string, string>; error: string | null; creado_ts: Date; terminado_ts: Date | null }>(
    "select estado, resumen, archivos, error, creado_ts, terminado_ts from importacion_vs where id = $1 and organizacion_id = $2", [iid, s.org.id]);
  if (!imp) notFound();
  const r = imp.resumen;
  const [texto, tono] = ESTADOS_VS[imp.estado] ?? [imp.estado, "gris"];
  const avance = await una<{ total: number; ok: number; err: number }>(`
    select count(*) filter (where destino in ('activo', 'inactivo'))::int total, count(*) filter (where resultado = 'ok')::int ok,
           count(*) filter (where resultado = 'error')::int err from importacion_vs_sku where importacion_id = $1`, [iid]);
  const errores = (avance?.err ?? 0) > 0 ? await consulta<{ sku: string; motivo: string | null }>(
    "select sku, motivo from importacion_vs_sku where importacion_id = $1 and resultado = 'error' order by sku limit 100", [iid]) : [];
  const corregidos = new Set(r.iva_corregido?.items ?? []);
  const andando = imp.estado === "cargando" || imp.estado === "importando";

  return (
    <Pantalla titulo="Importación desde Virtual Seller" ancho="max-w-5xl"
      subtitulo={<><Link href="/importar/virtualseller" className="text-[#16577F] hover:underline">← Corridas</Link> · {fechaHora(imp.creado_ts)} · <Estado texto={texto} tono={tono} /></>}>
      <Avisos sp={sp} />
      {andando && <Refrescar />}
      {imp.error && <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FDECEA] text-[#C03420]">{imp.error} Se reintenta sola en la próxima vuelta.</p>}

      {imp.estado === "cargando" && (
        <div className={`${CAJA} mb-4 text-xs`}>
          Trayendo las publicaciones de Mercado Libre ({n(r.ml_leidas)} leídas{r.ml_completo ? ", ya están todas; armando el resumen" : ""})…
          Sigue sola en segundo plano; esta pantalla se actualiza cada 10 segundos.
        </div>
      )}

      {imp.estado !== "cargando" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              ["Con stock (activos)", r.con_stock], ["· publicados en ML", r.publicados], ["· sin publicar", r.sin_publicar],
              ["Sin stock (inactivos)", r.inactivos], ["Notebooks sin stock (no entran)", r.notebooks_descartadas], ["Kits (armados con su -U)", r.kits_armados],
              ["Publicaciones de la cuenta", r.publicaciones?.total], ["· sin SKU / sin producto en VS", undefined],
            ].map(([t, v], i) => (
              <div key={i} className={CAJA}>
                <div className="text-[11px] text-[#5C6B76]">{t as string}</div>
                <div className="text-lg font-bold tabular-nums text-right">
                  {i === 7 ? `${n(r.publicaciones?.sin_sku)} / ${n(r.publicaciones?.sin_producto)}` : n(v as number | undefined)}
                </div>
              </div>
            ))}
          </div>

          {(r.stock_sin_maestro?.length ?? 0) > 0 && (
            <p className="text-xs rounded-lg px-3 py-2 mb-4 bg-[#FFF8E5] text-[#8a6100]">
              {r.stock_sin_maestro!.length} SKU tienen stock pero no están en el maestro (no se importan): {r.stock_sin_maestro!.slice(0, 30).join(", ")}{r.stock_sin_maestro!.length > 30 ? "…" : ""}
            </p>
          )}

          {((r.kits_sin_componente?.length ?? 0) + (r.kits_sin_cantidad?.length ?? 0)) > 0 && (
            <p className="text-xs rounded-lg px-3 py-2 mb-4 bg-[#FFF8E5] text-[#8a6100]">
              De {n(r.kits)} kits, {n(r.kits_armados)} se arman solos. Los demás entran marcados &quot;Kit VS&quot; para armarlos a mano:
              {r.kits_sin_componente?.length ? <> sin su &quot;-U&quot; en el maestro: {r.kits_sin_componente.slice(0, 30).join(", ")}{r.kits_sin_componente.length > 30 ? "…" : ""}.</> : null}
              {r.kits_sin_cantidad?.length ? <> El título no dice cuántas unidades: {r.kits_sin_cantidad.slice(0, 30).join(", ")}{r.kits_sin_cantidad.length > 30 ? "…" : ""}.</> : null}
            </p>
          )}

          <h2 className="text-sm font-bold mb-2">IVA distinto entre Virtual Seller y Mercado Libre</h2>
          {!r.columna_iva ? (
            <p className="text-xs text-[#5C6B76] mb-4">El maestro no trae una columna de IVA: se usa el de Mercado Libre (o 21 % si no está publicado).</p>
          ) : !r.iva_diferencias?.length ? (
            <p className="text-xs text-[#5C6B76] mb-4">No hay diferencias.</p>
          ) : (
            <>
              <div className={`${CAJA_TABLA} mb-2`}>
                <table className={TABLA}>
                  <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Publicación</th><th className={THN}>IVA VS</th><th className={THN}>IVA ML</th><th className={TH}>Publicaciones</th></tr></thead>
                  <tbody>
                    {r.iva_diferencias.map((d) => (
                      <tr key={d.sku} className={TR}>
                        <td className={TD}>{d.sku}</td>
                        <td className={TD}>{d.titulo}</td>
                        <td className={TDN}>{d.vs} %</td>
                        <td className={TDN}>{d.ml} %</td>
                        <td className={`${TD} text-[11px]`}>{d.items.map((i) => <span key={i} className={corregidos.has(i) ? "text-[#1F6E4A]" : ""}>{i}{corregidos.has(i) ? " ✓" : ""} </span>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <BotonConfirmar accion={accionCorregirIva} campos={{ id: String(iid) }} clase={SUAVE} texto="Corregir el IVA en Mercado Libre"
                  pregunta={`¿Cambiar el IVA de ${r.iva_diferencias.reduce((a, d) => a + d.items.length, 0)} publicaciones al de Virtual Seller?`} corriendo="Corrigiendo…" />
                <span className="text-[11px] text-[#5C6B76]">En Laucen queda el de Virtual Seller igual, lo corrijas o no en ML.</span>
              </div>
              {r.iva_corregido?.errores?.length ? (
                <ul className="text-[11px] text-[#C03420] mb-4 list-disc pl-4">{r.iva_corregido.errores.map((e) => <li key={e}>{e}</li>)}</ul>
              ) : <div className="mb-4" />}
            </>
          )}

          <h2 className="text-sm font-bold mb-2">SKU distinto en Mercado Libre</h2>
          <p className="text-[11px] text-[#5C6B76] mb-2">
            Packs renombrados a la convención BASE-Xn (la unidad sigue BASE-U): {n(r.packs_renombrados)}. Las equivalencias (SKU viejo → nuevo, y las que cargaste a mano)
            quedan guardadas para corregir también las cuentas de ML que conectes después.
          </p>
          {!r.sku_diferencias?.length ? <p className="text-xs text-[#5C6B76] mb-4">Todas las publicaciones ya tienen el SKU de Laucen.</p> : (
            <>
              <div className={`${CAJA_TABLA} mb-2 max-h-80 overflow-y-auto`}>
                <table className={TABLA}>
                  <thead className={THEAD}><tr><th className={TH}>Publicación</th><th className={TH}>SKU en ML</th><th className={TH}>SKU en Laucen</th></tr></thead>
                  <tbody>
                    {r.sku_diferencias.map((d) => {
                      const hecho = r.sku_corregido?.items?.includes(d.item);
                      return (
                        <tr key={d.item} className={TR}>
                          <td className={TD}>{d.item}{hecho ? <span className="text-[#1F6E4A]"> ✓</span> : null}</td>
                          <td className={TD}>{d.sku_ml ?? "—"}</td>
                          <td className={`${TD} font-semibold`}>{d.sku}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <BotonConfirmar accion={accionCorregirSku} campos={{ id: String(iid) }} clase={SUAVE} texto="Corregir el SKU en Mercado Libre"
                  pregunta={`¿Cambiar el SKU de ${r.sku_diferencias.length} publicaciones al de Laucen?`} corriendo="Corrigiendo…" />
                <span className="text-[11px] text-[#5C6B76]">Conviene hacerlo después de importar: la importación las vincula igual por el SKU viejo.</span>
              </div>
              {r.sku_corregido?.errores?.length ? (
                <ul className="text-[11px] text-[#C03420] mb-4 list-disc pl-4">{r.sku_corregido.errores.map((e) => <li key={e}>{e}</li>)}</ul>
              ) : <div className="mb-4" />}
            </>
          )}

          {imp.estado === "analizado" && (
            <div className={`${CAJA} mb-4 flex flex-wrap items-center gap-3`}>
              <BotonConfirmar accion={accionImportarVs} campos={{ id: String(iid) }} clase={VERDE} texto="Importar"
                pregunta={`¿Importar ${n((r.con_stock ?? 0) + (r.inactivos ?? 0))} productos?`} corriendo="Arrancando…" />
              <span className="text-xs text-[#5C6B76]">Se puede volver a correr: actualiza lo que ya está y el stock queda igual al del archivo.</span>
            </div>
          )}

          {(imp.estado === "importando" || imp.estado === "terminado") && (
            <div className="grid grid-cols-3 gap-3 mb-4 max-w-xl">
              <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Importados</div><div className="text-lg font-bold text-[#1F6E4A] tabular-nums text-right">{n(avance?.ok)}</div></div>
              <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Con error</div><div className="text-lg font-bold text-[#C03420] tabular-nums text-right">{n(avance?.err)}</div></div>
              <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Pendientes</div><div className="text-lg font-bold tabular-nums text-right">{n((avance?.total ?? 0) - (avance?.ok ?? 0) - (avance?.err ?? 0))}</div></div>
            </div>
          )}
          {imp.estado === "importando" && <p className="text-xs text-[#5C6B76] mb-4">Importando sola en segundo plano: podés cerrar la pestaña. Se actualiza cada 10 segundos.</p>}
          {imp.estado === "terminado" && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Link href="/catalogo/productos" className={PRIMARIO}>Ver los productos</Link>
              {errores.length > 0 && (
                <form action={accionReintentarVs}><input type="hidden" name="id" value={iid} /><button className={SUAVE}>Reintentar los que dieron error</button></form>
              )}
            </div>
          )}
          {errores.length > 0 && (
            <div className={CAJA_TABLA}>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Motivo</th></tr></thead>
                <tbody>{errores.map((e) => <tr key={e.sku} className={TR}><td className={TD}>{e.sku}</td><td className={TD}>{e.motivo}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Pantalla>
  );
}
