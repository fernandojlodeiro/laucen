// Lo que usan tanto el servidor como los componentes de cliente de la tienda
// (sin nada de la base: se puede importar desde el navegador).

import { formatearNumero } from "@/lib/numeros";

/** "$ 1.234" / "US$ 1.234,50": lo mismo que formatear() de lib/moneda.ts, sin la base. */
export const precio = (n: number, moneda: "ARS" | "USD") => `${moneda === "USD" ? "US$" : "$"} ${formatearNumero(n, moneda === "USD" ? "usd" : "pesos")}`;

/** Los métodos de envío que no piden dirección (comprar tampoco la exige). */
export const sinDireccion = (tipo: string | undefined) => tipo === "retiro" || tipo === "a_convenir";

/** Las 24 provincias (los nombres tienen que coincidir con las tarifas "por_provincia" de metodo_envio). */
export const PROVINCIAS = [
  "Buenos Aires", "Ciudad de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos",
  "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

export const CONDICIONES_IVA: [string, string][] = [
  ["responsable_inscripto", "Responsable inscripto"], ["monotributo", "Monotributo"], ["exento", "Exento"], ["consumidor_final", "Consumidor final"],
];
