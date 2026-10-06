// Normalización de datos de clientes, compartida por la importación (Virtual
// Seller) y por los pedidos que entran por la API (Mercado Libre, tienda):
// CUIT con guiones, documentos de relleno, condición de IVA en cualquiera de
// sus formas y "Apellido, Nombre".

const digitos = (s: string | null | undefined) => (s ? s.replace(/\D/g, "") : "");

/** CUIT/CUIL como 11 números (venga con guiones, puntos o espacios).
 *  null si no tiene 11 dígitos. */
export function normalizarCuit(v: string | null | undefined): string | null {
  // Se guarda sólo con números (Fer, 6/10); se muestra con guiones con cuitLegible (lib/cuit.ts).
  const d = digitos(v);
  return d.length === 11 ? d : null;
}

/** Un número de documento de verdad: sin puntos; null si está vacío o es de
 *  relleno (1111111, 00000000, menos de 6 dígitos). */
export function documentoValido(v: string | null | undefined): string | null {
  const d = digitos(v);
  if (d.length < 6 || /^(\d)\1+$/.test(d)) return null;
  return d;
}

/** Condición de IVA en cualquier forma: CF, RI, M, E, NR, MT, o el texto
 *  ("IVA Responsable Inscripto", "Responsable Monotributo", "IVA Exento"…). */
export function condicionIva(v: string | null | undefined): string | null {
  const t = v?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[._]/g, " ").trim();
  if (!t) return null;
  if (t.includes("inscripto") || t === "ri" || t === "r i") return "responsable_inscripto";
  if (t.includes("monotrib") || t === "m" || t === "mt" || t === "rs") return "monotributo";
  if (t.includes("exento") || t === "e" || t === "ex") return "exento";
  if (t.includes("no responsable") || t.includes("no alcanzado") || t === "nr") return "no_responsable";
  if (t.includes("consumidor") || t === "cf") return "consumidor_final";
  return null;
}

/** "Rapetti, Gabriela" → { apellido: "Rapetti", nombre: "Gabriela" }. Sin
 *  coma no se adivina (puede ser una empresa). */
export function separarNombre(v: string | null | undefined): { apellido: string | null; nombre: string | null } {
  const m = v?.match(/^\s*([^,]+?)\s*,\s*(.+?)\s*$/);
  return m ? { apellido: m[1], nombre: m[2] } : { apellido: null, nombre: null };
}

/** Tipo de documento por el texto o, si falta, por la cantidad de dígitos. */
export function tipoDocumento(tipo: string | null | undefined, numero: string | null | undefined): string | null {
  const t = tipo?.toUpperCase().trim();
  if (t && !/^\d+$/.test(t)) return ["DNI", "CUIT", "CUIL", "PASAPORTE", "OTRO"].includes(t) ? t : t.startsWith("PAS") ? "PASAPORTE" : "OTRO";
  const d = digitos(numero);
  if (!d) return null;
  return d.length === 11 ? "CUIT" : d.length >= 7 && d.length <= 8 ? "DNI" : "OTRO";
}
