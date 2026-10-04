import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { ajustesEnUbicacionesReales } from "@/lib/limpieza-ajustes";
import { formatearNumero } from "@/lib/numeros";
import { SUAVE } from "@/app/botones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes de la carga de stock", robots: { index: false, follow: false } };

// Para revisar contra el depósito: unidades que la carga de stock del 3/10 sacó
// de ubicaciones reales (el archivo de Virtual Seller no trae ubicaciones).

const n = (x: number) => formatearNumero(x, "entero");

export default async function Ajustes() {
  if (!(await sosVos())) redirect("/panel");
  const org = (await orgRequerida()).id;
  const filas = await ajustesEnUbicacionesReales(org);
  const productos = new Set(filas.map((f) => f.productoId)).size;
  const unidades = filas.reduce((a, f) => a + f.sacadas, 0);
  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-[#16577F]">Ajustes de la carga de stock</h1>
        <Link href="/admin/limpieza" className={SUAVE}>Volver a Limpieza de datos</Link>
      </div>
      <p className="text-sm text-[#5C6B76]">
        El archivo de Virtual Seller no trae ubicaciones. Para llevar cada producto a su neto se sacaron unidades de GENERAL y de A UBICAR
        primero; cuando no alcanzaba, de estas ubicaciones. Son {n(filas.length)} renglones, {n(productos)} productos y {n(unidades)} unidades.
        Revisalas contra el depósito y, si una unidad estaba en otra ubicación, se corrige en <Link className="underline" href="/stock/movimientos">Movimientos de stock</Link>.
      </p>
      <div className="overflow-x-auto bg-white border border-[#E3E9F0] rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-left text-[#5C6B76] text-xs">
            <tr><th className="p-2">SKU</th><th className="p-2">Producto</th><th className="p-2">Ubicación</th>
              <th className="p-2 text-right">Había</th><th className="p-2 text-right">Se sacó</th><th className="p-2 text-right">Queda</th></tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-[#E3E9F0]">
                <td className="p-2"><Link className="underline" href={`/catalogo/productos/${f.productoId}`}>{f.sku}</Link></td>
                <td className="p-2">{f.titulo.slice(0, 60)}</td>
                <td className="p-2">{f.ubicacion}</td>
                <td className="p-2 text-right">{n(f.anterior)}</td>
                <td className="p-2 text-right font-semibold">{n(f.sacadas)}</td>
                <td className="p-2 text-right">{n(f.quedan)}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td className="p-3 text-[#5C6B76]" colSpan={6}>No hay ajustes para revisar.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
