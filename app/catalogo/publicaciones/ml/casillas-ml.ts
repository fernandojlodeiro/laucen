// Las casillas de Vincular con Mercado Libre (también las usa la pantalla, sin base).

/** Las casillas para filtrar (Fer, 4/10: en vez de pestañas, para
 *  combinarlas, ej. "Sin vincular" + "Activas"). Dentro de cada grupo suman
 *  (Activas o Pausadas); entre grupos se cruzan (sin vincular y activas). Un
 *  grupo sin nada tildado no filtra. */
export const CASILLAS_ML = [
  { clave: "sin", texto: "Sin vincular", grupo: "vinculo" }, { clave: "vinc", texto: "Vinculadas", grupo: "vinculo" },
  { clave: "activas", texto: "Activas", grupo: "estado" }, { clave: "pausadas", texto: "Pausadas", grupo: "estado" },
  { clave: "revision", texto: "Con cuestiones", grupo: "estado" },
] as const;
export type CasillaMl = (typeof CASILLAS_ML)[number]["clave"];
export type VerMl = CasillaMl[];

/** Lo tildado como valor de ?f ("-" = nada tildado). */
export const valorVerMl = (ver: VerMl) => (ver.length ? ver.join(",") : "-");
