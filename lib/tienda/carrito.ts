// El carrito de la tienda vive en una cookie del comprador (sin cuenta ni
// base): [[variacion_id, cantidad], …]. Los precios NO se guardan: se
// cotizan cada vez (lib/tienda/cotizar.ts).

import { cookies } from "next/headers";
import type { LineaCarrito } from "@/lib/tienda/cotizar";

const nombre = (slug: string) => `carrito_${slug}`;

export async function leerCarrito(slug: string): Promise<LineaCarrito[]> {
  try {
    const crudo = JSON.parse((await cookies()).get(nombre(slug))?.value ?? "[]") as [number, number][];
    return crudo.filter((x) => Array.isArray(x) && Number.isInteger(x[0]) && Number.isInteger(x[1]) && x[1] > 0 && x[1] <= 999)
      .slice(0, 60).map(([variacionId, cantidad]) => ({ variacionId, cantidad }));
  } catch {
    return [];
  }
}

export async function guardarCarrito(slug: string, lineas: LineaCarrito[]) {
  const limpio = lineas.filter((l) => l.cantidad > 0).slice(0, 60).map((l) => [l.variacionId, Math.min(999, l.cantidad)]);
  (await cookies()).set(nombre(slug), JSON.stringify(limpio), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: true });
}

/** Suma (o resta, con negativo) unidades de una variación. */
export async function sumarAlCarrito(slug: string, variacionId: number, cantidad: number) {
  const c = await leerCarrito(slug);
  const l = c.find((x) => x.variacionId === variacionId);
  if (l) l.cantidad += cantidad; else c.push({ variacionId, cantidad });
  await guardarCarrito(slug, c);
}

export async function fijarCantidad(slug: string, variacionId: number, cantidad: number) {
  const c = (await leerCarrito(slug)).filter((x) => x.variacionId !== variacionId);
  if (cantidad > 0) c.push({ variacionId, cantidad });
  await guardarCarrito(slug, c);
}

export async function vaciarCarrito(slug: string) {
  (await cookies()).delete(nombre(slug));
}
