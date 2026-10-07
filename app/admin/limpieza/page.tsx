import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { notebooksSinStock, resumenCategorias, resumenPruebas } from "@/lib/limpieza";
import { formatearNumero } from "@/lib/numeros";
import { basuraDeVs } from "@/lib/limpieza-listas";
import { accionBorrarBasura, accionBorrarFamiliasVs, accionBorrarNotebooks, accionBorrarPruebas } from "./actions";
import { SUAVE } from "@/app/botones";
import { BotonBorrar, DetectarCategorias } from "./Botones";
import { Fantasmas } from "./Fantasmas";
import { NotebooksMl } from "./NotebooksMl";
import { Recuperar } from "./Recuperar";
import { consulta } from "@/lib/erp/base";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { robots: { index: false, follow: false } };

// Tareas de una sola vez para dejar la base lista tras la carga de Virtual
// Seller (pedido de Fer, 3/10). Sólo Fer. Cada botón pregunta antes de borrar.

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-4 space-y-2";
const n = (x: number) => formatearNumero(x, "entero");

export default async function Limpieza({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sp = await searchParams;
  const org = (await orgRequerida()).id;
  const [pruebas, notebooks, cats, basura] = await Promise.all([resumenPruebas(org), notebooksSinStock(org), resumenCategorias(org), basuraDeVs(org)]);
  const cuentasMl = (await consulta<{ id: number; nombre: string; en_laucen: number }>(`
    select c.id::int, c.nombre, (select count(distinct i.item_id)::int from meli_item i where i.canal_id = c.id) en_laucen
      from meli_cuenta mc join canal c on c.id = mc.canal_id
     where mc.organizacion_id = $1 and mc.estado = 'activa' order by c.id`, [org])).map((c) => ({ id: c.id, nombre: c.nombre, enLaucen: c.en_laucen }));

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold text-[#16577F]">Limpieza de datos</h1>
      <p className="text-sm text-[#5C6B76]">Tareas de una sola vez. Hacelas en este orden.</p>

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
        <h2 className="font-bold text-[#16577F]">Recuperar en Laucen las publicaciones pausadas de Mercado Libre</h2>
        <p className="text-sm text-[#5C6B76]">
          Trae a Laucen las publicaciones que en Mercado Libre están <b>pausadas</b> y Laucen no guarda, y las vincula por SKU con su producto
          (aunque el producto esté Inactivo). <b>No se recuperan</b>: las cerradas, en revisión o inactivas, las que no tienen producto en Laucen,
          las notebooks, ni las que descartaste vos. No cambia nada en Mercado Libre ni borra nada. Tarda unos minutos por cuenta.
        </p>
        <Recuperar cuentas={cuentasMl} />
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">Notebooks que no están activas en Mercado Libre</h2>
        <p className="text-sm text-[#5C6B76]">
          Lee cada cuenta en Mercado Libre (también lo que Laucen no guarda) y deja <b>preparado un lote</b> que finaliza y elimina todas las
          notebooks que no estén activas (pausadas, finalizadas, inactivas, en revisión). Las activas no se tocan. No sale nada hasta que
          revises el lote y aprietes &quot;Mandar a Mercado Libre&quot;. Eliminar no tiene vuelta atrás: se pierde su historial de ventas y preguntas.
          Es una notebook la de categoría Notebooks o con título que empieza con &quot;Notebook&quot;. Tarda unos minutos por cuenta.
        </p>
        <NotebooksMl cuentas={cuentasMl} />
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">Publicaciones de Laucen que ya no existen en Mercado Libre</h2>
        <p className="text-sm text-[#5C6B76]">
          Compara, cuenta por cuenta, lo que Laucen tiene guardado con lo que Mercado Libre devuelve ahora. Lo que ya no existe en ML
          se puede borrar de Laucen (sólo la publicación; el producto y su stock no se tocan, y en ML no se cambia nada). Cada revisión
          lee toda la cuenta y tarda unos segundos.
        </p>
        <Fantasmas cuentas={cuentasMl} />
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">Productos sin publicación de Mercado Libre</h2>
        <p className="text-sm text-[#5C6B76]">Los productos a los que no se les encontró ninguna publicación. Primero los activos, después los inactivos.</p>
        <Link href="/admin/limpieza/sin-publicacion" className={SUAVE}>Ver productos sin publicación</Link>
      </section>

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
        <h2 className="font-bold text-[#16577F]">5. Basura que vino del Excel de Virtual Seller</h2>
        <p className="text-sm text-[#5C6B76]">
          Filas de relleno que se colaron como productos: el pie del Excel, el envío por OCA, el recargo financiero y los &quot;NO USAR&quot;.
          Se borran sólo los archivados, sin stock y sin publicaciones. Hoy hay {n(basura.filas.length)}.
        </p>
        {basura.filas.length > 0 && (
          <ul className="text-xs text-[#5C6B76] list-disc pl-5">
            {basura.filas.map((e) => <li key={e.sku}>{e.sku} — {e.titulo}</li>)}
          </ul>
        )}
        {basura.conStock.length > 0 && (
          <p className="text-xs text-[#8a6100]">
            Dicen &quot;no usar&quot; pero tienen stock o están activos (no se borran solos): {basura.conStock.map((e) => `${e.sku} (${e.stock} u.)`).join(", ")}.
          </p>
        )}
        <form action={accionBorrarBasura}><BotonBorrar texto="Borrar basura de Virtual Seller" trabajando="Borrando…" /></form>
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
