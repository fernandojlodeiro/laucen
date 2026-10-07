import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { esNotebook } from "@/lib/mercadolibre/es-notebook";
import { SKUS_CONSERVAR, seConserva, notebooksLaucenFuera } from "@/lib/limpieza-notebooks";
import { SUAVE } from "@/app/botones";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { accionNotebooksLaucen, accionNotebooksMl } from "./actions";
import { BotonBorrar } from "./Botones";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { title: "Limpieza de datos", robots: { index: false, follow: false } };

// Tareas de una sola vez para dejar la base y Mercado Libre limpios. Sólo Fer.
// Las tarjetas que ya se usaron se sacaron (pedido de Fer, 7/10); queda la de
// los ajustes de la carga de stock y la limpieza de notebooks (bitácora #425).

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-4 space-y-2";
const n = (x: number) => formatearNumero(x, "entero");

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
  const enLaucen = await notebooksLaucenFuera(org);

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
        <h2 className="font-bold text-[#16577F]">Notebooks: eliminar todas salvo las de la lista</h2>
        <p className="text-sm text-[#5C6B76]">
          Se conservan sólo estos SKU (en Mercado Libre y en Laucen): <b>{SKUS_CONSERVAR.join(", ")}</b>. Es notebook la de la categoría
          Notebooks o con título que empieza con &quot;Notebook&quot;.
        </p>

        <h3 className="text-sm font-semibold pt-2">1. En Mercado Libre</h3>
        <p className="text-sm text-[#5C6B76]">
          El botón de cada cuenta lee la cuenta entera en Mercado Libre (también lo que Laucen no guarda; tarda unos minutos y corre de
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
                <BotonTarea accion={accionNotebooksMl} tipo={`limpieza-notebooks:${c.id}`} campos={{ canal: String(c.id) }} clase={SUAVE}
                  texto="Preparar eliminación en ML" />
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
