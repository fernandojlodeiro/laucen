// El código del sistema, para cuando el manual no alcanza: el asistente lo
// busca y lo lee para entender un criterio (y lo explica en palabras, nunca
// lo muestra). Viaja con el deploy de /api/asistente (next.config.ts,
// outputFileTracingIncludes): sólo app/, lib/ y db/; nada de afuera.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizar } from "./manual";

const CARPETAS = ["app", "lib", "db"];
const EXTENSIONES = /\.(ts|tsx|sql)$/;

type Archivo = { ruta: string; lineas: string[] };
let cache: Promise<Archivo[]> | null = null;

async function archivos(): Promise<Archivo[]> {
  cache ??= (async () => {
    const raiz = process.cwd();
    const salida: Archivo[] = [];
    const recorrer = async (dir: string) => {
      const entradas = await readdir(path.join(raiz, dir), { withFileTypes: true }).catch(() => []);
      for (const e of entradas) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) await recorrer(rel);
        else if (EXTENSIONES.test(e.name)) salida.push({ ruta: rel, lineas: (await readFile(path.join(raiz, rel), "utf8")).split("\n") });
      }
    };
    for (const c of CARPETAS) await recorrer(c);
    return salida;
  })().catch((e) => { cache = null; throw e; });
  return cache;
}

/** Busca un texto (o varias palabras: todas en el mismo renglón) en el código.
 *  Devuelve archivo, renglón y el renglón; primero los archivos con más aciertos. */
export async function buscarCodigo(consulta: string, max = 40): Promise<string> {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return "Escribí qué buscar.";
  const porArchivo = new Map<string, string[]>();
  for (const a of await archivos()) {
    a.lineas.forEach((l, i) => {
      const n = normalizar(l);
      if (palabras.every((w) => n.includes(w))) {
        const lista = porArchivo.get(a.ruta) ?? [];
        lista.push(`${a.ruta}:${i + 1}: ${l.trim().slice(0, 200)}`);
        porArchivo.set(a.ruta, lista);
      }
    });
  }
  const ordenados = [...porArchivo.entries()].sort((x, y) => y[1].length - x[1].length);
  const salida: string[] = [];
  for (const [, lineas] of ordenados) {
    for (const l of lineas.slice(0, 6)) { if (salida.length < max) salida.push(l); }
  }
  if (!salida.length) return "No aparece en el código.";
  const total = [...porArchivo.values()].reduce((s, l) => s + l.length, 0);
  return `${total} renglones en ${porArchivo.size} archivos${total > salida.length ? ` (se muestran ${salida.length})` : ""}:\n${salida.join("\n")}`;
}

/** Lee un pedazo de un archivo del código (hasta 400 renglones). */
export async function leerCodigo(ruta: string, desde = 1, hasta?: number): Promise<string> {
  const limpia = ruta.replace(/^\.?\//, "");
  const a = (await archivos()).find((x) => x.ruta === limpia);
  if (!a) {
    const parecidos = (await archivos()).filter((x) => x.ruta.endsWith(limpia.split("/").pop() ?? "")).slice(0, 5).map((x) => x.ruta);
    return `No existe ${limpia}.${parecidos.length ? ` ¿Será ${parecidos.join(", ")}?` : ""}`;
  }
  const ini = Math.max(1, Math.trunc(desde));
  const fin = Math.min(a.lineas.length, Math.trunc(hasta ?? ini + 399), ini + 399);
  const cuerpo = a.lineas.slice(ini - 1, fin).map((l, i) => `${ini + i}\t${l}`).join("\n");
  return `${a.ruta} (renglones ${ini}–${fin} de ${a.lineas.length})\n${cuerpo}`;
}
