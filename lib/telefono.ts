// Teléfonos (Fer, 6/10): la base los guarda sólo con números (disparador erp_telefono,
// db/administracion.sql) y el interno o la aclaración en otro campo; acá se muestran
// legibles. Las características argentinas tienen de 2 a 4 números: 11 (AMBA) se
// separa sola; las demás, en grupos de 3 (no siempre coincide con la característica
// real, pero se lee bien).

/** "01146130698" → "011 4613-0698"; "5491146130698" → "+54 9 11 4613-0698"; lo que no
 *  se reconoce, tal cual. */
export function telefonoLegible(v: string | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return v ?? "";
  const local = (n: string): string => {
    if (n.length === 10) return n.startsWith("11") ? `11 ${n.slice(2, 6)}-${n.slice(6)}` : `${n.slice(0, 3)} ${n.slice(3, 6)}-${n.slice(6)}`;
    if (n.length === 8) return `${n.slice(0, 4)}-${n.slice(4)}`;
    if (n.length === 7) return `${n.slice(0, 3)}-${n.slice(3)}`;
    return n;
  };
  if (d.startsWith("549") && d.length === 13) return `+54 9 ${local(d.slice(3))}`;
  if (d.startsWith("54") && d.length === 12) return `+54 ${local(d.slice(2))}`;
  if (d.startsWith("0") && d.length === 11) return `0${local(d.slice(1))}`;
  return local(d);
}

/** El teléfono legible con su interno o aclaración: "011 4613-0698 (INT 32)". */
export function telefonoConAclaracion(numero: string | null | undefined, aclaracion: string | null | undefined): string {
  const t = telefonoLegible(numero), a = (aclaracion ?? "").trim();
  return t && a ? `${t} (${a})` : t || a;
}
