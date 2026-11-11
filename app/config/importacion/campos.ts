// Los campos numéricos de Configuración › Costos de importación (lib/marketpro/costeo-config.ts), en el orden de la pantalla.

import type { ConfigCosteo } from "@/lib/marketpro/costeo-config";
import type { TipoNumero } from "@/lib/numeros";

export type Campo = { clave: keyof ConfigCosteo; etiqueta: string; tipo: TipoNumero; ayuda?: string; grupo: string };

export const CAMPOS: Campo[] = [
  { grupo: "Flete y CIF", clave: "flete_kg", etiqueta: "Flete aéreo (US$ por kg)", tipo: "decimal", ayuda: "Por kg cobrable: el mayor entre el peso real y el volumétrico." },
  { grupo: "Flete y CIF", clave: "seguro_pct", etiqueta: "Seguro (% del FOB)", tipo: "pct", ayuda: "Sólo se declara: suma al CIF (y paga aranceles) pero no es un costo." },
  { grupo: "Flete y CIF", clave: "divisor_vol", etiqueta: "Divisor del peso volumétrico", tipo: "entero", ayuda: "Peso volumétrico = largo × ancho × alto (cm) ÷ este número." },
  { grupo: "Caja", clave: "caja_largo", etiqueta: "Largo (cm)", tipo: "decimal" },
  { grupo: "Caja", clave: "caja_ancho", etiqueta: "Ancho (cm)", tipo: "decimal" },
  { grupo: "Caja", clave: "caja_alto", etiqueta: "Alto (cm)", tipo: "decimal" },
  { grupo: "Caja", clave: "unidades_caja", etiqueta: "Notebooks por caja", tipo: "entero" },
  { grupo: "Caja", clave: "peso_unidad", etiqueta: "Peso por notebook (kg)", tipo: "decimal", ayuda: "Peso real con su caja." },
  { grupo: "Caja", clave: "packing", etiqueta: "Packing (US$ por caja)", tipo: "decimal" },
  { grupo: "Impuestos", clave: "arancel_pct", etiqueta: "Aranceles (% del CIF)", tipo: "pct" },
  { grupo: "Impuestos", clave: "estadistica_pct", etiqueta: "Tasa de estadística (% del CIF)", tipo: "pct", ayuda: "0 si no se paga." },
  { grupo: "Impuestos", clave: "iva_pct", etiqueta: "IVA de importación (%)", tipo: "pct", ayuda: "Sobre CIF + aranceles + estadística. Es crédito fiscal: no suma al costo." },
  { grupo: "Gastos por envío", clave: "awb", etiqueta: "AWB fee (US$)", tipo: "decimal" },
  { grupo: "Gastos por envío", clave: "thc", etiqueta: "THC (US$)", tipo: "decimal" },
  { grupo: "Gastos por envío", clave: "gastos_destino", etiqueta: "Gastos en destino (US$ + IVA)", tipo: "decimal" },
  { grupo: "Gastos por envío", clave: "despachante_pct", etiqueta: "Honorarios del despachante (% del CIF)", tipo: "pct" },
  { grupo: "Gastos por envío", clave: "despachante_min", etiqueta: "Mínimo de honorarios (US$ + IVA)", tipo: "decimal" },
  { grupo: "Gastos por envío", clave: "gastos_despachante", etiqueta: "Gastos del despachante (US$ + IVA)", tipo: "decimal" },
  { grupo: "Venta", clave: "iva_venta_pct", etiqueta: "IVA del precio de venta (%)", tipo: "pct", ayuda: "Notebooks: 10,5 %." },
  { grupo: "Venta", clave: "gasto_venta", etiqueta: "Otros gastos por unidad vendida ($ sin IVA)", tipo: "pesos", ayuda: "Además del envío (que sale de tus ventas). Se resta de la ganancia. 0 = no se cuenta." },
  { grupo: "Venta", clave: "meses_tope", etiqueta: "Tope de la propuesta (meses)", tipo: "decimal", ayuda: "Se proponen como máximo estos meses de lo que vende el que más vende ese producto." },
];
