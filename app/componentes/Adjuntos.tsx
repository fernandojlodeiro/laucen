// Las fotos (miniaturas) y archivos que mandó un comprador en un mensaje o un reclamo de Mercado Libre (Fer, 29/10).
// Se traen de ML al verlas (/api/meli/adjunto); cada uno abre grande en otra pestaña.

import { SUAVE } from "@/app/botones";
import type { Adjunto } from "@/lib/mensajes/bandeja-tipos";

export default function Adjuntos({ lista, tamano = 96 }: { lista: Adjunto[]; tamano?: number }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {lista.map((a) => a.imagen
        ? <a key={a.url} href={a.url} target="_blank" rel="noopener" title={`${a.nombre} ↗`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.nombre} loading="lazy" style={{ width: tamano, height: tamano }} className="rounded-md border border-[#E3E9F0] object-cover bg-[#F7F9FB]" />
          </a>
        : <a key={a.url} href={a.url} target="_blank" rel="noopener" className={SUAVE}>📎 {a.nombre} ↗</a>)}
    </div>
  );
}
