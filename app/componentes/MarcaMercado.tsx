// La marca del precio de mercado al lado de un producto o de su precio (Fer, 13/10; lib/seguimiento/estado-mercado.ts):
// ✓ verde = confirmado, ? ámbar = monitoreado sin confirmar, ○ gris = sin seguimiento. Al pasar el mouse, qué es.

import { ESTADOS_MERCADO, type EstadoMercado } from "@/lib/seguimiento/estado-mercado";

const ESTILO: Record<EstadoMercado, [string, string]> = {
  confirmado: ["✓", "bg-[#1F7A3A] text-white border-[#1F7A3A]"],
  sin_confirmar: ["?", "bg-[#F2B233] text-[#4A3300] border-[#F2B233]"],
  sin_seguimiento: ["", "bg-white border-[#B8C2CC]"],
};

export default function MarcaMercado({ estado, href }: { estado: EstadoMercado | null | undefined; href?: string }) {
  if (!estado) return null;
  const [signo, clase] = ESTILO[estado];
  const e = ESTADOS_MERCADO[estado];
  const marca = (
    <span title={`${e.texto}: ${e.ayuda}`} aria-label={e.texto}
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold leading-none align-middle ${clase}`}>{signo}</span>
  );
  return href ? <a href={href} className="inline-flex">{marca}</a> : marca;
}
