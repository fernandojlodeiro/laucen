// La pestaña «Cambios de precio» de la ficha del producto (pedido de Fer,
// 12/10): los cambios de precio de lista de sus variaciones, con quién los
// hizo. La misma tabla que Catálogo › Historial de precios de lista.

import Link from "next/link";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import { Paginado } from "@/app/componentes/Lista";
import { SUAVE } from "@/app/botones";
import { filtrosHistorial, CAMPOS_HISTORIAL, ORDEN_HISTORIAL, type FilaHistorial } from "@/app/catalogo/precios/historial/lista";
import TablaHistorial from "@/app/catalogo/precios/historial/Tabla";

export default async function CambiosPrecio({ org, productoId, skuBase, sp }: { org: string; productoId: number; skuBase: string; sp: Record<string, string | undefined> }) {
  // Todos (también el primer precio cargado), de lo más nuevo a lo más viejo.
  const f = filtrosHistorial(org, { producto: String(productoId), sentido: "todos", orden: sp.orden, dir: sp.dir });
  const { filas, total } = await consultaPaginada<FilaHistorial>({ campos: CAMPOS_HISTORIAL, desde: f.desde, donde: f.donde, orden: leerOrden(sp, ORDEN_HISTORIAL, f.orden) },
    f.valores, sp);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[#5C6B76]">Cada precio de lista de este producto, con el anterior, cuánto cambió y quién lo cambió (una persona o la regla de precio del seguimiento).</p>
        <Link href={`/catalogo/precios/historial?q=${encodeURIComponent(skuBase)}&sentido=todos`} className={SUAVE}>Ver con filtros en el Historial</Link>
      </div>
      <TablaHistorial filas={filas} />
      <Paginado total={total} />
    </div>
  );
}
