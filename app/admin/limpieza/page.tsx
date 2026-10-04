import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { notebooksSinStock, resumenCategorias, resumenPruebas } from "@/lib/limpieza";
import { formatearNumero } from "@/lib/numeros";
import { accionBorrarFamiliasVs, accionBorrarNotebooks, accionBorrarPruebas } from "./actions";
import { BotonBorrar, DetectarCategorias } from "./Botones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Limpieza de datos", robots: { index: false, follow: false } };

// Tareas de una sola vez para dejar la base lista tras la carga de Virtual
// Seller (pedido de Fer, 3/10). Sólo Fer. Cada botón pregunta antes de borrar.

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-4 space-y-2";
const n = (x: number) => formatearNumero(x, "entero");

export default async function Limpieza({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sp = await searchParams;
  const org = (await orgRequerida()).id;
  const [pruebas, notebooks, cats] = await Promise.all([resumenPruebas(org), notebooksSinStock(org), resumenCategorias(org)]);

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold text-[#16577F]">Limpieza de datos</h1>
      <p className="text-sm text-[#5C6B76]">Tareas de una sola vez. Hacelas en este orden.</p>

      {sp.ok && <p className="text-sm bg-[#E8F5EE] border border-[#BFE3CF] rounded-lg p-3 text-[#167655]">{sp.ok}</p>}
      {sp.error && <p className="text-sm bg-[#FDF0EE] border border-[#EFD3CE] rounded-lg p-3 text-[#C03420]">{sp.error}</p>}

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">1. Pedidos, reservas y picking de prueba</h2>
        <p className="text-sm text-[#5C6B76]">
          Borra todos los pedidos con lo que cuelga de ellos (renglones, historial, envíos, pagos, reclamos, cargos y mensajes de
          Mercado Libre), los lotes de picking y los movimientos de stock de prueba. La carga de stock inicial no se toca.
          Hoy hay {n(pruebas.pedidos)} pedidos, {n(pruebas.lotes)} lotes de picking y {n(pruebas.movimientos)} movimientos.
        </p>
        <form action={accionBorrarPruebas}><BotonBorrar texto="Borrar pruebas" trabajando="Borrando…" /></form>
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">2. Notebooks sin stock</h2>
        <p className="text-sm text-[#5C6B76]">
          Borra las notebooks (y sus kits) que quedaron sin stock tras la carga. Hoy hay {n(notebooks.cantidad)}.
        </p>
        {notebooks.ejemplos.length > 0 && (
          <ul className="text-xs text-[#5C6B76] list-disc pl-5">
            {notebooks.ejemplos.map((e) => <li key={e.sku}>{e.sku} — {e.titulo}</li>)}
            {notebooks.cantidad > notebooks.ejemplos.length && <li>…y {n(notebooks.cantidad - notebooks.ejemplos.length)} más</li>}
          </ul>
        )}
        <form action={accionBorrarNotebooks}><BotonBorrar texto="Borrar notebooks sin stock" trabajando="Borrando…" /></form>
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">3. Categorías de Mercado Libre</h2>
        <p className="text-sm text-[#5C6B76]">
          A cada producto sin categoría le pone la de su publicación en Mercado Libre (aunque esté pausada, buscando por su código, el
          código base o el de su componente). Al que no tiene publicación, la que sugiere el predictor de Mercado Libre por su título.
          Después ubica cada producto en la familia de esa categoría. Hoy hay {n(cats.sinCategoria)} productos sin categoría.
          Tarda unos minutos: no cierres la pantalla.
        </p>
        <DetectarCategorias pendientes={cats.sinCategoria} />
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">4. Familias de Virtual Seller</h2>
        <p className="text-sm text-[#5C6B76]">
          Borra las {n(cats.familiasVs)} familias que no son de Mercado Libre (con {n(cats.productosEnFamiliasVs)} productos adentro).
          Hacelo recién después del paso 3: los productos que sigan en una quedan sin familia.
        </p>
        <form action={accionBorrarFamiliasVs}><BotonBorrar texto="Borrar familias de Virtual Seller" trabajando="Borrando…" /></form>
      </section>
    </main>
  );
}
