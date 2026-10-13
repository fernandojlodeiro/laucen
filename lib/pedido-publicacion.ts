// Qué está buscando quien escribe (puro, sin base ni pantalla).

/** Lo escrito desde el último "#" (al principio o después de un espacio) hasta el cursor, si no hay salto de línea. */
export function pedidoDePublicacion(texto: string, cursor: number): { desde: number; busqueda: string } | null {
  const antes = texto.slice(0, cursor);
  const m = /(^|\s)#([^\n#]*)$/.exec(antes);
  return m ? { desde: antes.length - m[2].length - 1, busqueda: m[2] } : null;
}

