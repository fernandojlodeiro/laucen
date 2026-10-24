// El camino en el Drive donde van los archivos de cada mes (Fer, 23/10): se pega la ruta de un mes cualquiera, tal
// como se ve en Drive ("\Mi unidad\Administracion\Impuestos\…\2026\09 Septiembre\IVA DIGITAL"), y de ahí sale el
// modelo: la carpeta del año (cuatro dígitos) y la del mes (empieza con su número de dos dígitos) cambian con cada
// mes; el resto queda fijo. Pura.

export type Segmento = { tipo: "fijo"; nombre: string } | { tipo: "año" } | { tipo: "mes"; separador: string; estilo: "titulo" | "mayus" | "minus" | "sin_nombre" };

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** La ruta pegada → los segmentos (sin "Mi unidad"). Error si no tiene la carpeta del año y la del mes. */
export function parsearRuta(texto: string): { segmentos: Segmento[] } | { error: string } {
  const partes = texto.split(/[\\/]+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length && /^(mi unidad|my drive)$/i.test(partes[0])) partes.shift();
  if (!partes.length) return { error: "Pegá la ruta de la carpeta de un mes, como se ve en el Drive." };
  const iAño = partes.findIndex((p) => /^\d{4}$/.test(p));
  if (iAño < 1) return { error: "En la ruta no está la carpeta del año (por ejemplo «2026»), o no tiene ninguna carpeta antes." };
  const mes = partes[iAño + 1]?.match(/^(0[1-9]|1[0-2])([^\p{L}\d]*)(.*)$/u);
  if (!mes) return { error: "Después de la carpeta del año tiene que venir la del mes, empezando con su número (por ejemplo «09 Septiembre»)." };
  const nombre = mes[3];
  const estilo = !nombre ? "sin_nombre" : nombre === nombre.toUpperCase() ? "mayus" : nombre === nombre.toLowerCase() ? "minus" : "titulo";
  const segmentos: Segmento[] = partes.map((p, i): Segmento =>
    i === iAño ? { tipo: "año" } : i === iAño + 1 ? { tipo: "mes", separador: mes[2], estilo } : { tipo: "fijo", nombre: p });
  return { segmentos };
}

/** El nombre de la carpeta de un mes con el formato del modelo: "09 Septiembre". */
export function nombreCarpetaMes(s: Extract<Segmento, { tipo: "mes" }>, mes: number) {
  const n = MESES[mes - 1];
  const nombre = s.estilo === "mayus" ? n.toUpperCase() : s.estilo === "minus" ? n.toLowerCase() : s.estilo === "sin_nombre" ? "" : n;
  return `${String(mes).padStart(2, "0")}${nombre ? s.separador : ""}${nombre}`;
}

/** ¿La carpeta `nombre` es la del segmento, para ese año y mes? (sin mayúsculas ni acentos; la del mes, por su número). */
export function coincide(nombre: string, s: Segmento, año: number, mes: number) {
  if (s.tipo === "año") return nombre.trim() === String(año);
  // La del mes, por su número donde esté ("09 Septiembre", "Abril 04") o, si no tiene número, por el nombre.
  if (s.tipo === "mes") {
    const t = nombre.trim();
    if (/\d/.test(t)) return new RegExp(`(^|\\D)0?${mes}(\\D|$)`).test(t);
    return normal(t).startsWith(normal(MESES[mes - 1]).slice(0, 4));
  }
  return normal(nombre) === normal(s.nombre);
}

/** El nombre con que se crea la carpeta del segmento si no existe. */
export function nombreNuevo(s: Segmento, año: number, mes: number) {
  return s.tipo === "año" ? String(año) : s.tipo === "mes" ? nombreCarpetaMes(s, mes) : s.nombre;
}

/** La ruta para mostrar, de un mes dado: "Administracion › … › 2026 › 10 Octubre › IVA DIGITAL". */
export function rutaDeMes(segmentos: Segmento[], año: number, mes: number) {
  return segmentos.map((s) => nombreNuevo(s, año, mes)).join(" › ");
}

/** La carpeta base de algo que se ordena por año y mes debajo («Administracion › … › Servicios y Gastos», que adentro
 *  tiene 2026 › 10 Octubre). Si la ruta ya trae el año y el mes, se toma igual que parsearRuta. Pura. */
export function parsearRutaBase(texto: string): { segmentos: Segmento[] } | { error: string } {
  const p = parsearRuta(texto);
  if (!("error" in p)) return p;
  const partes = texto.split(/[\\/]+/).map((x) => x.trim()).filter(Boolean);
  if (partes.length && /^(mi unidad|my drive)$/i.test(partes[0])) partes.shift();
  if (!partes.length) return { error: "Pegá la ruta de la carpeta, como se ve en el Drive." };
  if (partes.some((x) => /^\d{4}$/.test(x))) return p;
  return { segmentos: [...partes.map((nombre): Segmento => ({ tipo: "fijo", nombre })), { tipo: "año" }, { tipo: "mes", separador: " ", estilo: "titulo" }] };
}
