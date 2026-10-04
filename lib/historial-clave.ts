// Qué registro es una entrada de "Lo último que viste" (lo usan la pantalla
// y el servidor): la misma ficha abierta de dos maneras (tocando el nombre,
// ?c=7, o con el lápiz, ?editar=7) es UNA sola entrada (Fer, 4/10).

export function claveVisto(href: string): string {
  const [ruta, busqueda = ""] = href.split("?");
  const m = busqueda.match(/(?:^|&)(?:id|c|editar)=(\d+)/);
  return m ? `${ruta}#${m[1]}` : ruta;
}
