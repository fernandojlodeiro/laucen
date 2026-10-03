// Los códigos del plan de cuentas, sin base: el formato ("5.2.06": números
// separados por puntos), la cuenta madre de un código (la jerarquía sale del
// código: 5.2.06 cuelga de 5.2, y si 5.2 no existe, de 5) y el próximo código
// libre de un tipo, para sugerirlo en un alta (Contabilidad y la vista previa
// de la importación de ARCA). Lo usa lib/administracion/contabilidad.ts.

export type TipoCuenta = "activo" | "pasivo" | "patrimonio" | "ingreso" | "egreso";
export const TIPOS_CUENTA: TipoCuenta[] = ["activo", "pasivo", "patrimonio", "ingreso", "egreso"];

/** El primer número de cada tipo en el plan por defecto (para un plan sin cuentas de ese tipo). */
const RAIZ: Record<TipoCuenta, string> = { activo: "1", pasivo: "2", patrimonio: "3", ingreso: "4", egreso: "5" };

export const codigoValido = (codigo: string) => /^\d+(\.\d+)*$/.test(codigo);

/** Compara dos códigos parte por parte como números (5.2.10 va después de 5.2.9). */
export function compararCodigos(a: string, b: string) {
  const x = a.split("."), y = b.split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const d = Number(x[i]) - Number(y[i]);
    if (d) return d;
  }
  return 0;
}

/** La cuenta madre de un código: el antecesor más cercano que existe en el plan (o null). */
export function madreDe<T extends { codigo: string }>(codigo: string, cuentas: T[]): T | null {
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
  const partes = codigo.split(".");
  for (let n = partes.length - 1; n > 0; n--) {
    const c = porCodigo.get(partes.slice(0, n).join("."));
    if (c) return c;
  }
  return null;
}

/** Suma 1 a la última parte del código respetando sus ceros (5.2.05 → 5.2.06; 5.2.99 → 5.2.100). */
function siguiente(codigo: string) {
  const partes = codigo.split(".");
  const ultima = partes[partes.length - 1];
  partes[partes.length - 1] = String(Number(ultima) + 1).padStart(ultima.length, "0");
  return partes.join(".");
}

/** El próximo código libre para una cuenta imputable del tipo: el que sigue a
 *  la imputable de ese tipo con el código más alto (en el plan por defecto,
 *  egreso: la última es 5.2.05 "Gastos varios" → 5.2.06). Si ese ya está
 *  usado (por una cuenta de otro tipo o un título), sigue sumando. Si no hay
 *  ninguna imputable del tipo, la primera bajo su título (5 → 5.01). */
export function proximoCodigo(cuentas: { codigo: string; tipo: string; imputable: boolean }[], tipo: TipoCuenta): string {
  const usados = new Set(cuentas.map((c) => c.codigo));
  const delTipo = cuentas.filter((c) => c.tipo === tipo && codigoValido(c.codigo));
  const imputables = delTipo.filter((c) => c.imputable).sort((a, b) => compararCodigos(a.codigo, b.codigo));
  let codigo: string;
  if (imputables.length) codigo = siguiente(imputables[imputables.length - 1].codigo);
  else {
    const titulo = delTipo.sort((a, b) => a.codigo.split(".").length - b.codigo.split(".").length || compararCodigos(a.codigo, b.codigo))[0];
    codigo = `${titulo?.codigo ?? RAIZ[tipo]}.01`;
  }
  while (usados.has(codigo)) codigo = siguiente(codigo);
  return codigo;
}

/** El próximo código libre BAJO UNA MADRE concreta: el hijo directo más alto
 *  + 1, con el mismo ancho que los hijos que ya hay (1.1.01…1.1.04 → 1.1.05;
 *  4.1.01, 4.1.02 → 4.1.03). Sin hijos, madre.01. No rellena huecos (un código
 *  borrado no se reusa) y no cuentan los nietos ni otras ramas. La madre no
 *  tiene que existir como título (el plan por defecto no tiene 4.1). Lo usan
 *  las cuentas que se crean solas ("Ventas — canal", "Mercado Pago — cuenta"). */
export function proximoCodigoBajo(cuentas: { codigo: string }[], madre: string): string {
  const prefijo = `${madre}.`;
  let mayor = 0, ancho = 2;
  for (const { codigo } of cuentas) {
    if (!codigo.startsWith(prefijo)) continue;
    const resto = codigo.slice(prefijo.length);
    if (!/^\d+$/.test(resto)) continue;
    mayor = Math.max(mayor, Number(resto));
    ancho = Math.max(ancho, resto.length);
  }
  return prefijo + String(mayor + 1).padStart(ancho, "0");
}
