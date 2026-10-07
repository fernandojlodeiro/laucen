import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { esNotebook } from "@/lib/mercadolibre/es-notebook";
import { SKUS_CONSERVAR, seConserva, notebooksLaucenFuera, revisionesGuardadas, contarSinDescripcion, type Decision, type Revision } from "@/lib/limpieza-notebooks";
import { SUAVE } from "@/app/botones";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { accionDescripcionesMl, accionNotebooksLaucen, accionNotebooksMl, accionRevisarNotebooksMl } from "./actions";
import { BotonBorrar } from "./Botones";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { title: "Limpieza de datos", robots: { index: false, follow: false } };

// Tareas de una sola vez para dejar la base y Mercado Libre limpios. Sólo Fer.
// Las tarjetas que ya se usaron se sacaron (pedido de Fer, 7/10); queda la de
// los ajustes de la carga de stock y la limpieza de notebooks (bitácora #425).

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-4 space-y-2";
const n = (x: number) => formatearNumero(x, "entero");
const DECISION: Record<Decision, { texto: string; color: string }> = {
  eliminar: { texto: "Se elimina", color: "text-[#C03420]" },
  conservar: { texto: "De la lista: queda", color: "text-[#167655]" },
  activa_fuera: { texto: "Activa fuera de la lista: no se toca", color: "text-[#8a6100]" },
  ya_pedida: { texto: "Ya pedida antes", color: "text-[#5C6B76]" },
};
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Limpieza({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sp = await searchParams;
  const org = (await orgRequerida()).id;

  // Por cuenta: lo que Laucen tiene guardado de sus notebooks (el botón igual lee la cuenta entera en ML).
  const cuentas = await consulta<{ id: number; nombre: string }>(`
    select c.id::int, c.nombre from meli_cuenta mc join canal c on c.id = mc.canal_id
     where mc.organizacion_id = $1 and mc.estado = 'activa' order by c.id`, [org]);
  const items = await consulta<{ canal_id: number; item_id: string; titulo: string | null; categoria: string | null; estado: string | null; skus: string[] }>(`
    select i.canal_id::int, i.item_id, max(i.titulo) titulo, max(i.categoria) categoria, max(i.estado) estado,
           array_remove(array_agg(distinct i.sku) || array_agg(distinct v.sku), null) skus
      from meli_item i left join publicacion p on p.id = i.publicacion_id left join variacion v on v.id = p.variacion_id
     where i.organizacion_id = $1 group by i.canal_id, i.item_id`, [org]);
  const porCuenta = new Map<number, { borrar: number; conservar: number; activasFuera: string[] }>();
  for (const i of items) {
    if (!esNotebook(i.titulo, i.categoria)) continue;
    const c = porCuenta.get(i.canal_id) ?? { borrar: 0, conservar: 0, activasFuera: [] };
    if (seConserva(i.skus)) c.conservar++;
    else if (i.estado === "active") c.activasFuera.push(i.item_id);
    else c.borrar++;
    porCuenta.set(i.canal_id, c);
  }
  const [enLaucen, revisiones, sinDescripcion] = await Promise.all([notebooksLaucenFuera(org), revisionesGuardadas(org), contarSinDescripcion(org)]);

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold text-[#16577F]">Limpieza de datos</h1>
      <p className="text-sm text-[#5C6B76]">Tareas de una sola vez.</p>

      {sp.ok && <p className="text-sm bg-[#E8F5EE] border border-[#BFE3CF] rounded-lg p-3 text-[#167655]">{sp.ok}</p>}
      {sp.error && <p className="text-sm bg-[#FDF0EE] border border-[#EFD3CE] rounded-lg p-3 text-[#C03420]">{sp.error}</p>}

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">Para revisar el lunes: ajustes de la carga de stock</h2>
        <p className="text-sm text-[#5C6B76]">
          Las unidades que la carga del 3/10 sacó de ubicaciones reales del depósito, para cotejarlas con lo que hay en las estanterías.
        </p>
        <Link href="/admin/limpieza/ajustes" className={SUAVE}>Ver ajustes a revisar</Link>
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">Descripciones de Mercado Libre que faltan en los productos</h2>
        <p className="text-sm text-[#5C6B76]">
          La descripción larga de una publicación no viene en la copia que Laucen guarda de Mercado Libre: se pide aparte. Este botón
          trae, para cada producto activo sin descripción, la de una de sus publicaciones vinculadas (primero las comunes, después las de
          catálogo). Sólo lee de Mercado Libre; no pisa una descripción que ya esté cargada. Hoy hay {n(sinDescripcion)} productos así.
        </p>
        <BotonTarea accion={accionDescripcionesMl} tipo="descripciones-ml" clase={SUAVE} texto="Traer descripciones de ML" />
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">Notebooks: eliminar todas salvo las de la lista</h2>
        <p className="text-sm text-[#5C6B76]">
          Se conservan sólo estos SKU (en Mercado Libre y en Laucen): <b>{SKUS_CONSERVAR.join(", ")}</b>. Es notebook la de la categoría
          Notebooks o con título que empieza con &quot;Notebook&quot;.
        </p>

        <h3 className="text-sm font-semibold pt-2">1. En Mercado Libre</h3>
        <p className="text-sm text-[#5C6B76]">
          Primero <b>&quot;Revisar en ML&quot;</b>: lee la cuenta entera en Mercado Libre por la API y muestra acá abajo, publicación por
          publicación, qué se haría con cada notebook. <b>No cambia nada.</b> Después, &quot;Preparar eliminación en ML&quot; lee la cuenta entera en Mercado Libre (también lo que Laucen no guarda; tarda unos minutos y corre de
          fondo) y deja <b>preparado un lote</b> que finaliza y elimina cada notebook que no sea de la lista, en cualquier estado (pausada,
          finalizada, en revisión, inactiva). <b>Las activas que no son de la lista no se tocan</b>: se avisan. No sale nada hasta que revises
          el lote en la <Link href="/config/canales/cola?ver=lotes" className="underline">Cola de Mercado Libre</Link> y aprietes
          &quot;Mandar a Mercado Libre&quot;. Eliminar no tiene vuelta atrás.
        </p>
        <div className="space-y-2">
          {cuentas.map((c) => {
            const x = porCuenta.get(c.id) ?? { borrar: 0, conservar: 0, activasFuera: [] };
            return (
              <div key={c.id} className="border border-[#E3E9F0] rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <span className="font-semibold text-[#16577F]">{c.nombre}</span>
                  <span className="block text-xs text-[#5C6B76]">
                    Según lo que guarda Laucen: {n(x.borrar)} para eliminar, {n(x.conservar)} de la lista.
                    {x.activasFuera.length > 0 && <span className="text-[#C03420]"> {n(x.activasFuera.length)} activas que no son de la lista: {x.activasFuera.join(", ")}.</span>}
                  </span>
                </div>
                <span className="flex gap-2 flex-wrap">
                  <BotonTarea accion={accionRevisarNotebooksMl} tipo={`limpieza-notebooks:${c.id}`} campos={{ canal: String(c.id) }} clase={SUAVE}
                    texto="Revisar en ML (sólo lectura)" />
                  <BotonTarea accion={accionNotebooksMl} tipo={`limpieza-notebooks:${c.id}`} campos={{ canal: String(c.id) }} clase={SUAVE}
                    texto="Preparar eliminación en ML" />
                </span>
                {revisiones.get(c.id) && <DetalleRevision r={revisiones.get(c.id)!} />}
              </div>
            );
          })}
        </div>

        <h3 className="text-sm font-semibold pt-2">2. En Laucen</h3>
        <p className="text-sm text-[#5C6B76]">
          Las notebooks de Laucen que no son de la lista. La que no tiene historia se borra; la que tiene ventas, picking, recepciones o
          compras se <b>archiva</b> (para no romper esa historia). Sus publicaciones de Mercado Libre se van de Laucen solas cuando Mercado
          Libre las elimina (paso 1).
        </p>
        {enLaucen.length === 0 ? <p className="text-sm text-[#167655]">No queda ninguna.</p> : (
          <>
            <ul className="text-sm list-disc pl-5">
              {enLaucen.map((p) => (
                <li key={p.id}>
                  <Link href={`/catalogo/productos/${p.id}`} className="text-[#16577F] underline">{p.sku}</Link> — {p.titulo}
                  {" "}<span className="text-xs text-[#5C6B76]">({n(p.stock)} en stock · {p.historia ? "se archiva" : "se borra"})</span>
                </li>
              ))}
            </ul>
            <form action={accionNotebooksLaucen}><BotonBorrar texto={`Limpiar ${n(enLaucen.length)} notebook${enLaucen.length === 1 ? "" : "s"} de Laucen`} trabajando="Limpiando…" /></form>
          </>
        )}
      </section>
    </main>
  );
}

/** Lo que trajo la última revisión de la cuenta: conteos y el detalle, publicación por publicación. */
function DetalleRevision({ r }: { r: Revision }) {
  const cuenta = (d: Decision) => r.items.filter((x) => x.decision === d).length;
  const porEstado = (d: Decision) => Object.entries(r.items.filter((x) => x.decision === d).reduce<Record<string, number>>((a, x) => ({ ...a, [x.estado]: (a[x.estado] ?? 0) + 1 }), {}))
    .map(([k, v]) => `${n(v)} ${k}`).join(", ");
  const orden: Decision[] = ["activa_fuera", "eliminar", "conservar", "ya_pedida"];
  const items = [...r.items].sort((a, b) => orden.indexOf(a.decision) - orden.indexOf(b.decision) || a.id.localeCompare(b.id));
  return (
    <div className="w-full text-xs text-[#5C6B76] space-y-1">
      <p>
        <b>Revisión de ML del {fechaHora(r.fecha)}</b>: la cuenta tiene {n(r.totalCuenta)} publicaciones en Mercado Libre. Notebooks:{" "}
        <span className="text-[#C03420] font-semibold">{n(cuenta("eliminar"))} se eliminan</span>{cuenta("eliminar") ? ` (${porEstado("eliminar")})` : ""} ·{" "}
        <span className="text-[#167655]">{n(cuenta("conservar"))} de la lista</span> ·{" "}
        <span className={cuenta("activa_fuera") ? "text-[#8a6100] font-semibold" : ""}>{n(cuenta("activa_fuera"))} activas fuera de la lista</span>
        {cuenta("ya_pedida") ? ` · ${n(cuenta("ya_pedida"))} ya pedidas` : ""}.
        {r.quedan > 0 && <span className="text-[#8a6100]"> Incompleta: faltaron {n(r.quedan)} por leer, apretá de nuevo.</span>}
      </p>
      {items.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[#16577F]">Ver el detalle ({n(items.length)})</summary>
          <div className="max-h-96 overflow-auto border border-[#E3E9F0] rounded mt-1">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#FAFBFC] text-left"><tr><th className="p-1">Publicación</th><th className="p-1">Estado</th><th className="p-1">SKU</th><th className="p-1">Título</th><th className="p-1">Qué pasa</th></tr></thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id} className="border-t border-[#E3E9F0]">
                    <td className="p-1 whitespace-nowrap"><a href={`https://articulo.mercadolibre.com.ar/${x.id.replace(/^MLA/, "MLA-")}`} target="_blank" rel="noopener" className="underline">{x.id} ↗</a></td>
                    <td className="p-1">{x.estado}</td>
                    <td className="p-1">{x.skus || "sin SKU"}</td>
                    <td className="p-1">{x.titulo.slice(0, 60)}</td>
                    <td className={`p-1 ${DECISION[x.decision].color}`}>{DECISION[x.decision].texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
