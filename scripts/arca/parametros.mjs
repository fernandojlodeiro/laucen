// Parámetros de la carga de ARCA, en un solo lugar.

// Qué código de concepto del .lst (columna 14) son los derechos de
// importación. NO está confirmado: 010 y 061 figuran "no disponible" en
// Softrade. Mientras sea null, arca_impo_items.derechos_pct_efectivo queda
// null. No adivinar. Cuando Fer lo confirme: poner el código acá (ej. "010"),
// subirlo, y correr `node scripts/arca/cargar.mjs derechos C:\Laucen\arca\out`
// (recalcula todos los meses cargados desde los impo_impuestos_AAAAMM.csv.gz).
export const CONCEPTO_DERECHOS = null;
