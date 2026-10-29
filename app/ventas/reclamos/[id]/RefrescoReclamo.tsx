"use client";

// La ficha del reclamo se actualiza sola (Fer, 29/10): cada 5 segundos, con la pestaña a la vista, pregunta el sello del
// reclamo (/api/reclamos/[id]/sello) y, si cambió (un mensaje nuevo o un cambio de estado), la vuelve a dibujar. Mientras
// se escribe un mensaje no la toca, para no perder lo escrito.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const CADA = 5000;

export default function RefrescoReclamo({ id }: { id: number }) {
  const router = useRouter();
  const sello = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const preguntar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const d = (await fetch(`/api/reclamos/${id}/sello`, { cache: "no-store" }).then((r) => r.json())) as { sello: string | null };
        if (!vivo || !d.sello) return;
        if (sello.current && d.sello !== sello.current) {
          const escribiendo = document.activeElement instanceof HTMLTextAreaElement && document.activeElement.value.trim() !== "";
          if (escribiendo) return; // se vuelve a preguntar en 5 s; el sello viejo queda para que lo detecte
          router.refresh();
        }
        sello.current = d.sello;
      } catch { /* sin red: la próxima vuelta */ }
    };
    void preguntar();
    const reloj = setInterval(preguntar, CADA);
    document.addEventListener("visibilitychange", preguntar);
    return () => { vivo = false; clearInterval(reloj); document.removeEventListener("visibilitychange", preguntar); };
  }, [id, router]);

  return null;
}
