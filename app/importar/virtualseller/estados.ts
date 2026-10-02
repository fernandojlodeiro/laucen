export const ESTADOS_VS: Record<string, [string, "azul" | "amarillo" | "verde" | "rojo" | "gris"]> = {
  cargando: ["Analizando", "amarillo"], analizado: ["Listo para importar", "azul"], importando: ["Importando", "amarillo"],
  terminado: ["Terminada", "verde"], error: ["Con error", "rojo"],
};
