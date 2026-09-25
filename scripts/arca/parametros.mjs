// Parámetros de la carga de ARCA, en un solo lugar.

// Códigos de concepto del .lst (columna 14). Confirmados por Fer el 25/09/2026:
// 010 = derechos de importación (arancel), 061 = tasa de estadística. 415 = IVA
// (visto en Softrade). Con los tres se deduce, por NCM, la tasa de IVA y la de
// estadística que se paga hoy (agg_tasas_mes / ncm_tasas). Si cambian: poner
// el código acá y correr `node scripts/arca/cargar.mjs tasas C:\Laucen\arca\out`.
export const CONCEPTO_DERECHOS = "010";
export const CONCEPTO_ESTADISTICA = "061";
export const CONCEPTO_IVA = "415";
