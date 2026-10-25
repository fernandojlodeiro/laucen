// La página "no encontrada" de la tienda: dentro del marco de la tienda (su marca, sus colores, el
// nombre del dominio por donde se entró), en criollo y con el camino de vuelta. Nunca la del panel.

import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { esDelPanel } from "@/lib/tienda/dominios";
import { BOTON, BOTON_SUAVE } from "./piezas";

export const metadata: Metadata = { title: "Página no encontrada", robots: { index: false } };

export default async function NoEncontrada() {
  // La raíz de la tienda: en su dominio "/", en el panel /tienda/<slug>.
  const h = await headers();
  const host = h.get("host")?.split(":")[0].toLowerCase() ?? "";
  const inicio = esDelPanel(host) ? ((h.get("x-ruta") ?? "").match(/^\/tienda\/[^/]+/)?.[0] ?? "/") : "/";
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-[var(--texto)]">No encontramos esta página</h1>
      <p className="text-[var(--texto-2)]">Puede que el producto ya no esté publicado o que la dirección tenga un error.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href={inicio} className={BOTON}>Ir a la tienda</Link>
        <Link href={`${inicio === "/" ? "" : inicio}/buscar`} className={BOTON_SUAVE}>Ver todos los productos</Link>
      </div>
    </div>
  );
}
