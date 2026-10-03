// La marca de un carrito de Mercado Libre en espera (10 minutos desde su
// último evento: ver carritoEnEspera en lib/pedidos). Se dibuja en el
// servidor; pasada la espera no aparece y todo vuelve a andar.

import { carritoEnEspera, mensajeEsperaCarrito } from "@/lib/pedidos";

/** "Carrito en espera · faltan N min" (ámbar), o nada si no está en espera. */
export function MarcaCarritoEspera({ ts, texto = "Carrito en espera" }: { ts: Date | string | null | undefined; texto?: string }) {
  const e = carritoEnEspera({ carrito_ultimo_evento_ts: ts ?? null });
  if (!e) return null;
  return (
    <span title={mensajeEsperaCarrito(e)}
      className="inline-block text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap bg-[#FFF1D6] text-[#8a5a00] border border-[#F2D08A]">
      {texto} · faltan {e.faltanMin} min
    </span>
  );
}

/** El texto de un botón deshabilitado por la espera (null si no espera). */
export function textoEsperaCarrito(ts: Date | string | null | undefined): string | null {
  const e = carritoEnEspera({ carrito_ultimo_evento_ts: ts ?? null });
  return e ? `Carrito en espera · faltan ${e.faltanMin} min` : null;
}
