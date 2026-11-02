// La marca de la tarjeta sale del número (Fer, 2/11): en el pago con Payway el comprador ya no la elige de una lista.
// Con elegirla a mano, una tarjeta de crédito cargada como «Visa débito» (la primera de la lista) Payway la rechazaba
// por «bin» (pedido 150561). La red (Visa, Mastercard…) y si es de crédito o de débito los dice la consulta de BIN de
// Mercado Pago (tipoDeTarjeta, del lado del servidor); mientras contesta, o si no contesta, la red sale de los
// primeros números. Si no se sabe la red, se elige de la lista como siempre (nunca se frena una tarjeta por no
// reconocerla). Sin navegador ni servidor: puro.

export type Red = "visa" | "master" | "amex" | "cabal" | "naranja";
export type TipoTarjeta = "credito" | "debito";

/** Los payment_method_id de Payway de cada red: [crédito, débito]. Amex y Naranja no tienen débito. */
const IDS: Record<Red, [number, number | null]> = {
  visa: [1, 31], master: [104, 105], amex: [65, null], cabal: [63, 108], naranja: [24, null],
};

const CABAL = ["589657", "600691", "603522", "6042", "6043", "627170", "636908"];

/** La red por los primeros números de la tarjeta (null si todavía no alcanza o no es una que se acepte). */
export function redDeNumero(numero: string): Red | null {
  const n = numero.replace(/\D/g, "");
  if (n.length < 6) return null;
  if (n.startsWith("589562")) return "naranja";
  if (CABAL.some((p) => n.startsWith(p))) return "cabal";
  if (/^3[47]/.test(n)) return "amex";
  const dos = Number(n.slice(0, 2)), cuatro = Number(n.slice(0, 4));
  if ((dos >= 51 && dos <= 55) || (cuatro >= 2221 && cuatro <= 2720)) return "master";
  if (n.startsWith("4")) return "visa";
  return null;
}

/** Las marcas de Payway posibles para esa red (y, si se sabe, ese tipo), dentro de las que se permiten. */
export function marcasPosibles(red: Red, tipo: TipoTarjeta | null, permitidas: number[]): number[] {
  const [credito, debito] = IDS[red];
  const ids = tipo === "credito" ? [credito] : tipo === "debito" ? (debito ? [debito] : []) : [credito, debito].filter((x): x is number => x != null);
  return ids.filter((id) => permitidas.includes(id));
}

/** La red según el payment_method de Mercado Pago (visa, debvisa, master, debmaster, …). */
export function redDeMetodoMp(id: string | null | undefined): Red | null {
  const x = (id ?? "").replace(/^deb/, "");
  return x === "visa" || x === "master" || x === "amex" || x === "cabal" || x === "naranja" ? x : null;
}

/** El tipo de tarjeta según el payment_method de Mercado Pago (debvisa, master, …). */
export function tipoDeMetodoMp(m: { id?: string | null; payment_type_id?: string | null }): TipoTarjeta | null {
  if (m.payment_type_id === "debit_card" || m.payment_type_id === "prepaid_card" || /^deb/.test(m.id ?? "")) return "debito";
  if (m.payment_type_id === "credit_card") return "credito";
  return null;
}
