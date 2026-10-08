// El precio de una publicación como lo ve el comprador en Mercado Libre (Fer, 8/10):
// grande lo que paga; arriba, chico y tachado, el precio de lista; al lado el
// "% OFF" en verde; y el nombre de la campaña chiquito (entero al pasar el mouse).
// Lo usan la ficha del producto (pestaña Publicaciones) y Catálogo › Publicaciones.

export default function PrecioPublicacion({ paga, lista, campana, texto }: {
  /** Lo que paga el comprador (con la campaña en curso, si hay). */
  paga: number;
  /** El precio de lista (el tachado); se muestra sólo si es mayor que lo que paga. */
  lista?: number | null;
  campana?: string | null;
  /** Cómo se escribe un importe (pesos o dólares, según lo que eligió el usuario). */
  texto: (n: number) => string;
}) {
  const conDescuento = lista != null && lista > paga;
  const off = conDescuento ? Math.round((1 - paga / lista!) * 100) : 0;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      {conDescuento && <span className="text-[11px] text-[#7A8793] line-through">{texto(lista!)}</span>}
      <span className="text-[15px] font-bold text-[#1E2A32] whitespace-nowrap">
        {texto(paga)}
        {off > 0 && <span className="ml-1 align-middle text-[11px] font-bold text-[#00A650]">{off}% OFF</span>}
      </span>
      {campana && (
        <span className="max-w-[9rem] truncate text-[9px] text-[#7A8793] cursor-help" title={`Campaña: ${campana}`}>{campana}</span>
      )}
    </span>
  );
}
