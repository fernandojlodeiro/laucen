// El "https://host" con que se está mirando la app (para armar links de la
// tienda: la dirección pública, el feed de Meta, el seguimiento del pedido).

import { headers } from "next/headers";

export async function origen(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "laucen.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
