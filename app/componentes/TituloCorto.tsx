// El título de un producto o publicación en una tabla (convención de AGENTS.md, pedido de Fer
// 22/10): como mucho dos renglones, chico y gris, y el texto entero al pasar el mouse. Así una fila
// no se hace alta y la tabla no necesita desplazarse de costado para ver lo importante.

export default function TituloCorto({ titulo, className = "" }: { titulo: string | null | undefined; className?: string }) {
  if (!titulo) return null;
  return <span className={`line-clamp-2 text-[11px] leading-tight text-[#5C6B76] ${className}`} title={titulo}>{titulo}</span>;
}
