// Las reglas puras de la carpeta de mensajes (copiadas de CadaMes: ecos.ts,
// mando.ts y la ventana de 24 horas), sin base ni red, para poder probarlas.

// ── Ecos de coexistencia: lo que contestan desde el teléfono ─────────
/** Un eco, tal como lo manda Meta (webhook `smb_message_echoes`). */
export type Eco = {
  /** El número del NEGOCIO. Distinto de `messages`, donde `from` es la persona. */
  from?: string;
  /** A quién le contestaron: **éste es el de la persona**. */
  to?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  document?: { caption?: string };
  video?: { caption?: string };
};

/** Lo que se dijo. Un mensaje borrado (revoke) o corregido (edit) no crea
 *  renglón: queda sólo en el crudo. */
export function loQueDijo(eco: Eco): string | null {
  if (eco.type === "revoke" || eco.type === "edit") return null;
  const t = (eco.text?.body ?? eco.image?.caption ?? eco.document?.caption ?? eco.video?.caption ?? "").trim();
  if (t) return t;
  return eco.type && eco.type !== "text" ? "(contestó desde el teléfono)" : null;
}

/** Con quién hablaban: en un eco es `to`, nunca `from` (que somos nosotros). */
export const conQuienHablaban = (eco: Eco) => String(eco.to ?? "").replace(/\D/g, "");

export function ecosDelCambio(value: unknown): Eco[] {
  const v = value as { message_echoes?: Eco[] } | null | undefined;
  return Array.isArray(v?.message_echoes) ? v.message_echoes : [];
}

// ── La marca del teléfono: prende o apaga la IA del chat ───────────
export const MARCA_POR_DEFECTO = "*";
export const LARGO_MAXIMO_MARCA = 4;

/** ¿El mensaje empieza con la marca? Sólo el principio (un * en el medio es un *). */
export function esOrdenDeMando(texto: string | null | undefined, marca: string): boolean {
  const m = (marca ?? "").trim();
  return !!m && (texto ?? "").trimStart().startsWith(m);
}

export function sinLaMarca(texto: string, marca: string): string {
  const m = (marca ?? "").trim();
  const t = texto.trimStart();
  return m && t.startsWith(m) ? t.slice(m.length).trimStart() : texto;
}

/** Una marca con letras o números convertiría "Hola" en una orden. */
export function revisarMarca(crudo: unknown): { ok: true; marca: string } | { ok: false; motivo: string } {
  const m = String(crudo ?? "").trim();
  if (!m) return { ok: false, motivo: "La marca no puede quedar vacía." };
  if (m.length > LARGO_MAXIMO_MARCA) return { ok: false, motivo: `La marca puede tener hasta ${LARGO_MAXIMO_MARCA} signos.` };
  if (/[\p{L}\p{N}]/u.test(m)) return { ok: false, motivo: "La marca no puede tener letras ni números (si no, un «Hola» prendería o apagaría la IA)." };
  return { ok: true, marca: m };
}

// ── La ventana de 24 horas de WhatsApp ───────────────────────────────
export const HORAS_VENTANA = 24;

/** ¿Se le puede escribir libre? Sólo dentro de las 24 h desde su último mensaje. */
export function ventanaAbierta(ultimoEntrante: Date | string | null | undefined, ahora = new Date()): boolean {
  if (!ultimoEntrante) return false;
  const t = new Date(ultimoEntrante).getTime();
  return Number.isFinite(t) && ahora.getTime() - t < HORAS_VENTANA * 3600_000;
}

// ── Teléfonos ────────────────────────────────────────────────────────
/** Los últimos 10 dígitos: así se comparan el 549… de WhatsApp con un
 *  teléfono cargado como 0351 15…, 351…, +54 9 351… */
export function ultimos10(t: string | null | undefined): string {
  let d = String(t ?? "").replace(/\D/g, "");
  // Un celular argentino cargado "a la antigua" (0351 15 1234567): sin el 0
  // de larga distancia ni el 15.
  d = d.replace(/^0/, "");
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m && (m[1] + m[2]).length === 10) d = m[1] + m[2];
  return d.slice(-10);
}

export const mismoTelefono = (a: string | null | undefined, b: string | null | undefined) => {
  const x = ultimos10(a), y = ultimos10(b);
  return x.length === 10 && x === y;
};

/** Para mostrar: +54 9 351 555-1234 (si no se reconoce, tal cual con +).
 *  La característica no se puede saber sin una tabla: 11 es Buenos Aires y el
 *  resto se muestra de a 3 (la mayoría: 351, 341, 221…). */
export function telefonoLindo(waId: string): string {
  const d = waId.replace(/\D/g, "");
  const m = d.match(/^549(\d{10})$/);
  if (m) {
    const n = m[1], car = n.startsWith("11") ? 2 : 3;
    const resto = n.slice(car);
    return `+54 9 ${n.slice(0, car)} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
  }
  return d ? `+${d}` : waId;
}
