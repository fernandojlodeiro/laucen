// ¿Lo que se mandó es EXACTAMENTE lo que propuso la IA? (Fer, 5/10): si el usuario manda la
// sugerencia sin tocarla, en el historial queda "Respondió <usuario> con la IA"; si la cambió,
// queda sólo el usuario. Sólo se ignoran los espacios de los extremos y el tipo de salto de línea.

const norm = (t: string) => t.replace(/\r\n?/g, "\n").trim();

export function igualALaSugerencia(texto: string | null | undefined, sugerencia: string | null | undefined): boolean {
  if (!texto || !sugerencia) return false;
  const a = norm(texto), b = norm(sugerencia);
  return a !== "" && a === b;
}
