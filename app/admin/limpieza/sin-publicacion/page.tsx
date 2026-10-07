import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { productosSinPublicacion } from "@/lib/limpieza-listas";
import { formatearNumero } from "@/lib/numeros";
import { SUAVE } from "@/app/botones";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Los productos a los que no se les encontró ninguna publicación de Mercado
// Libre (en ninguna cuenta). Primero los activos, después los inactivos.

const POR_PAGINA = 50;
const n = (x: number) => formatearNumero(x, "entero");

export default async function SinPublicacion({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sp = await searchParams;
  const org = (await orgRequerida()).id;
  const pagina = Math.max(1, Number(sp.p) || 1);
  const { filas, total, activos } = await productosSinPublicacion(org, pagina, POR_PAGINA);
  const desde = total ? (pagina - 1) * POR_PAGINA + 1 : 0;
  const hasta = Math.min(total, pagina * POR_PAGINA);
  const link = (p: number) => `/admin/limpieza/sin-publicacion?p=${p}`;
  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-[#16577F]">Productos sin publicación</h1>
        <Link href="/admin/limpieza" className={SUAVE}>Volver a Limpieza de datos</Link>
      </div>
      <p className="text-sm text-[#5C6B76]">
        Productos que no tienen ninguna publicación de Mercado Libre vinculada, en ninguna cuenta. Hay {n(total)}: {n(activos)} activos
        (van primero) y {n(total - activos)} inactivos. Un producto puede estar sin publicación porque nunca se publicó o porque su
        publicación todavía no se trajo o no se pudo vincular por SKU.
      </p>
      <div className="overflow-x-auto bg-white border border-[#E3E9F0] rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-left text-[#5C6B76] text-xs">
            <tr><th className="p-2">SKU</th><th className="p-2">Producto</th><th className="p-2">Estado</th>
              <th className="p-2 text-right">Stock</th><th className="p-2">Familia (categoría de ML)</th></tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-[#E3E9F0]">
                <td className="p-2"><Link className="underline" href={`/catalogo/productos/${f.id}`}>{f.sku}</Link></td>
                <td className="p-2">{f.titulo}</td>
                <td className="p-2">{f.estado === "activo" ? "Activo" : "Inactivo"}</td>
                <td className="p-2 text-right">{n(f.stock)}</td>
                <td className="p-2 text-xs text-[#5C6B76]">{f.familia ?? "—"}{f.categoria ? ` (${f.categoria})` : ""}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td className="p-3 text-[#5C6B76]" colSpan={5}>Todos los productos tienen publicación.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-[#5C6B76]">
        <span>{n(desde)}–{n(hasta)} de {n(total)}</span>
        <span className="flex gap-2">
          {pagina > 1 && <Link href={link(pagina - 1)} className={SUAVE}>Anterior</Link>}
          {hasta < total && <Link href={link(pagina + 1)} className={SUAVE}>Siguiente</Link>}
        </span>
      </div>
    </main>
  );
}
