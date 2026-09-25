// Parámetros de la carga de ARCA, en un solo lugar.

// Qué código de concepto del .lst (columna 14) son los derechos de
// importación (aranceles). Confirmado por Fer el 25/09/2026: 010 = derechos,
// 061 = tasa de estadística. Con esto se calcula
// arca_impo_items.derechos_pct_efectivo (derechos / FOB × 100). Si alguna vez
// cambia: poner el código acá y correr
// `node scripts/arca/cargar.mjs derechos C:\Laucen\arca\out` (recalcula todos
// los meses cargados desde los impo_impuestos_AAAAMM.csv.gz).
export const CONCEPTO_DERECHOS = "010";
