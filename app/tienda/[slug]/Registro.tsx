"use client";

// El registro propio de la tienda (lib/tienda/visitantes.ts, Fer 26/10): avisa la visita (una vez por sesión), cada
// producto que se mira y el checkout empezado. Va en todas las tiendas, midan o no con Google o Meta.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function Registro({ base }: { base: string }) {
  const ruta = usePathname();
  useEffect(() => {
    const url = ruta.startsWith(`${base}/`) || ruta === base ? `${base}/v` : "/v";
    const avisar = (tipo: string, extra: Record<string, unknown> = {}) =>
      fetch(url, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo, pagina: ruta, ...extra }) }).catch(() => {});
    try {
      if (!sessionStorage.getItem("lc_visita")) { sessionStorage.setItem("lc_visita", "1"); avisar("visita"); }
    } catch { /* sin almacenamiento: no se cuenta la visita */ }
    const producto = /\/producto\/(\d+)/.exec(ruta)?.[1];
    if (producto) avisar("producto", { producto: Number(producto) });
    if (/\/checkout$/.test(ruta)) avisar("checkout");
  }, [ruta, base]);
  return null;
}
