// Un importe en letras, como va en un documento formal (Fer, 7/10: el
// presupuesto dice el total en números y en letras):
//   enLetras(120530.5, "ARS") → "Son pesos ciento veinte mil quinientos treinta con 50/100."

const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce",
  "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro",
  "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

/** 0 a 999. `apocope`: "un" en vez de "uno" (antes de mil, millón o del nombre de la moneda). */
function hastaMil(n: number, apocope: boolean): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100), r = n % 100;
  let resto: string;
  if (r < 30) resto = UNIDADES[r];
  else {
    const d = Math.floor(r / 10), u = r % 10;
    resto = u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d];
  }
  if (apocope) resto = resto.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");
  return [CENTENAS[c], resto].filter(Boolean).join(" ");
}

/** Un entero en palabras (hasta 999.999.999.999). */
export function numeroEnLetras(n: number, apocope = false): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000), miles = Math.floor((n % 1_000_000) / 1000), resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? "un millón" : `${numeroEnLetras(millones, true)} millones`);
  if (miles) partes.push(miles === 1 ? "mil" : `${hastaMil(miles, true)} mil`);
  if (resto) partes.push(hastaMil(resto, apocope));
  return partes.join(" ");
}

/** "Son pesos … con 50/100." / "Son dólares estadounidenses … con 00/100." */
export function enLetras(importe: number, moneda: "ARS" | "USD"): string {
  const centavos = Math.round(Math.abs(importe) * 100);
  const entero = Math.floor(centavos / 100), cent = centavos % 100;
  const nombre = moneda === "USD" ? "dólares estadounidenses" : "pesos";
  // Con millones redondos: "Son un millón de pesos"; si no, "Son pesos ciento veinte mil…".
  const palabras = numeroEnLetras(entero, true);
  const cola = `con ${String(cent).padStart(2, "0")}/100.`;
  return entero >= 1_000_000 && entero % 1_000_000 === 0 ? `Son ${palabras} de ${nombre} ${cola}` : `Son ${nombre} ${palabras} ${cola}`;
}
