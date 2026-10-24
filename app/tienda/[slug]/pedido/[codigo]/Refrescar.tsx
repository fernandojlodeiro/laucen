"use client";

// La página del pedido se vuelve a leer cada 8 segundos, hasta 2 minutos: el comprador volvió de
// Mercado Pago y el aviso del pago llega un rato después (así ve "pagado" y se cuenta la venta).

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Refrescar() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => { if (++n > 15) clearInterval(id); else router.refresh(); }, 8000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
