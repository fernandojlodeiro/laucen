// Copiado tal cual de CadaMes (src/lib/texto-para-voz.ts, Fer 4/11: los audios de Estela «como en CadaMes»).
// Preparar un texto para que se ESCUCHE bien, no para que se LEA bien (doc 74,
// bitácora #205, prueba real de Fer con Garden Sur, 9/9).
//
// El bug: a `hablar()` le llegaba el mismo texto que sale por WhatsApp, con
// los símbolos y formatos escritos — "$13.500", "10/9", "17:30", "(2
// saldos)". El bench de voces sonó perfecto porque esas frases de prueba
// estaban escritas en palabras; un texto real de la app nunca lo está. El
// resultado: ElevenLabs leyó el monto como dólares, no como el número que es.
//
// **Esto se usa SÓLO para la síntesis.** El mensaje de WhatsApp y lo que
// queda guardado en `chat_mensaje` no se tocan — llega la transformación
// hasta la puerta de `hablar()` y no un paso más allá.

const UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const DIEZ_A_DIECINUEVE = [
  "diez", "once", "doce", "trece", "catorce", "quince",
  "dieciséis", "diecisiete", "dieciocho", "diecinueve",
];
const VEINTI_UNIDADES = [
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro",
  "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS: Record<number, string> = {
  3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa",
};
const CENTENAS: Record<number, string> = {
  2: "doscientos", 3: "trescientos", 4: "cuatrocientos", 5: "quinientos",
  6: "seiscientos", 7: "setecientos", 8: "ochocientos", 9: "novecientos",
};
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** 0-9, con el "un" apocopado cuando `apocope` (va justo antes de un
 *  sustantivo masculino: "un peso", nunca "uno peso"). */
function unidad(n: number, apocope: boolean): string {
  if (n === 1) return apocope ? "un" : "uno";
  return UNIDADES[n];
}

/** 0-99. */
function decenasYUnidades(n: number, apocope: boolean): string {
  if (n < 10) return unidad(n, apocope);
  if (n < 20) return DIEZ_A_DIECINUEVE[n - 10];
  if (n < 30) {
    const resto = n - 20;
    if (resto === 0) return "veinte";
    if (resto === 1) return apocope ? "veintiún" : "veintiuno";
    return VEINTI_UNIDADES[resto];
  }
  const decena = Math.floor(n / 10);
  const resto = n % 10;
  const base = DECENAS[decena];
  if (resto === 0) return base;
  return `${base} y ${unidad(resto, apocope)}`;
}

/** 0-999. "Cien" exacto, "ciento" con resto — la regla que más se olvida. */
function centenasYResto(n: number, apocope: boolean): string {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const cPalabra = c === 0 ? "" : c === 1 ? "ciento" : CENTENAS[c];
  const restoPalabra = resto > 0 ? decenasYUnidades(resto, apocope) : "";
  if (cPalabra && restoPalabra) return `${cPalabra} ${restoPalabra}`;
  return cPalabra || restoPalabra;
}

/** Un entero no negativo a palabras, hasta los miles de millones.
 *
 *  `apocope` va TRUE de punta a punta cuando el número termina hablándole a
 *  un sustantivo masculino singular ("pesos", pero también "mil" y "millón"
 *  se apocopan hacia adentro: 21.000 es "veintiún mil", no "veintiuno mil").
 *  Para un número suelto (una fecha, una cantidad sin sustantivo después) va
 *  FALSE — es la forma que se dice sola: "el treinta y uno", no "el treinta
 *  y un". */
export function numeroAPalabras(n: number, apocope = false): string {
  if (n === 0) return "cero";
  if (n < 0) return `menos ${numeroAPalabras(-n, apocope)}`;
  if (n < 1000) return centenasYResto(n, apocope);
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const milesPalabra = miles === 1 ? "mil" : `${numeroAPalabras(miles, apocope)} mil`;
    const restoPalabra = resto > 0 ? numeroAPalabras(resto, apocope) : "";
    return restoPalabra ? `${milesPalabra} ${restoPalabra}` : milesPalabra;
  }
  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const millonesPalabra = millones === 1 ? "un millón" : `${numeroAPalabras(millones, apocope)} millones`;
  const restoPalabra = resto > 0 ? numeroAPalabras(resto, apocope) : "";
  return restoPalabra ? `${millonesPalabra} ${restoPalabra}` : millonesPalabra;
}

/** Un monto en pesos a palabras — "un peso" en singular, nunca "un pesos". */
function montoAPalabras(entero: number, centavos: number | null): string {
  const pesos = entero === 1 ? "un peso" : `${numeroAPalabras(entero, true)} pesos`;
  if (!centavos) return pesos;
  const centavosPalabra = centavos === 1 ? "un centavo" : `${numeroAPalabras(centavos, true)} centavos`;
  return `${pesos} con ${centavosPalabra}`;
}

const DIA_MES = /\b([0-3]?\d)\/(0?\d|1[0-2])(?:\/\d{2,4})?\b/g;
const HORA = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const PORCENTAJE = /(\d+)(?:[.,](\d+))?\s?%/g;
// $ + miles con punto, decimales opcionales con coma: $13.500 · $1.234,50 · $500
const MONTO = /\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/g;
const DIGITOS_LARGOS = /\b\d{6,}\b/g;
const NUMERO_SUELTO = /\b\d+\b/g;
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu;
const URL = /https?:\/\/\S+/gi;
const MARCAS_WHATSAPP = /[*_~]/g;

/** Prepara un texto para que ElevenLabs u OpenAI lo LEAN bien — nunca para
 *  mostrarlo: esto se llama sólo adentro de `hablar()`. */
export function textoParaVoz(texto: string): string {
  let t = texto;

  t = t.replace(EMOJI, "");
  t = t.replace(MARCAS_WHATSAPP, "");
  t = t.replace(URL, "te lo paso por acá");
  // Un paréntesis no se lee — se convierte en una pausa entre comas, y lo
  // que tenía adentro (un número, casi siempre) sigue su propio camino.
  t = t.replace(/\(([^()]*)\)/g, ", $1,");

  t = t.replace(PORCENTAJE, (_m, entero: string, decimales?: string) => {
    const base = numeroAPalabras(Number(entero), false);
    const conDecimales = decimales ? `${base} coma ${numeroAPalabras(Number(decimales), false)}` : base;
    return `${conDecimales} por ciento`;
  });

  t = t.replace(DIA_MES, (_m, dia: string, mes: string) => {
    const d = Number(dia), mm = Number(mes);
    if (d < 1 || d > 31 || mm < 1 || mm > 12) return _m;
    return `el ${numeroAPalabras(d, false)} de ${MESES[mm - 1]}`;
  });

  t = t.replace(HORA, (_m, hora: string, min: string) => {
    const h = numeroAPalabras(Number(hora), false);
    const m = Number(min);
    return m === 0 ? `${h} en punto` : `${h} y ${numeroAPalabras(m, false)}`;
  });

  t = t.replace(MONTO, (_m, entero: string, decimales?: string) => {
    const limpio = Number(entero.replace(/\./g, ""));
    return montoAPalabras(limpio, decimales ? Number(decimales) : null);
  });

  // Un alias o CBU: una tira de 6 dígitos o más no se lee como cantidad, se
  // deletrea con pausas — nadie entiende "cuatrocientos ochenta y tres
  // millones..." de un número de cuenta.
  t = t.replace(DIGITOS_LARGOS, (m) => m.split("").map((d) => UNIDADES[Number(d)]).join(", "));

  t = t.replace(NUMERO_SUELTO, (m) => numeroAPalabras(Number(m), false));

  // Los espacios y comas que quedan sueltos después de sacar paréntesis,
  // links y símbolos.
  t = t.replace(/[ \t]+/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/,\s*,/g, ",").trim();
  // Un paréntesis pegado al final de la frase deja una coma colgando: nada
  // que la siga, sólo el punto final que ya venía.
  t = t.replace(/,+\s*$/, "").replace(/,+([.!?])/g, "$1");

  return t;
}
