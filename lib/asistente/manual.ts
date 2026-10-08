// El manual del sistema (manual/*.md): una "pantalla" o grupo de pantallas
// por archivo, con un encabezado (titulo, menu, ruta, rutas, permiso,
// resumen) y el texto en markdown. Lo lee el asistente para contestar, y
// tests/manual.test.ts controla que toda página del sistema esté en alguno.
// El formato está explicado en manual/LEEME.md.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type PaginaManual = {
  archivo: string;           // nombre sin .md
  titulo: string;
  menu: string;              // "Compras › Facturas de compra"
  ruta: string;              // la dirección principal
  rutas: string[];           // todas las páginas que cubre (con [id])
  permiso: string;           // clave de lib/permisos.ts, "fer" o "todos"
  resumen: string;
  cuerpo: string;            // el markdown sin el encabezado
};

export const CARPETA_MANUAL = "manual";

/** Lee un archivo del manual: el encabezado entre "---" y el cuerpo. */
export function leerPagina(archivo: string, texto: string): PaginaManual | null {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const enc: Record<string, string> = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const i = linea.indexOf(":");
    if (i > 0) enc[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  if (!enc.titulo || !enc.ruta) return null;
  return {
    archivo,
    titulo: enc.titulo,
    menu: enc.menu ?? enc.titulo,
    ruta: enc.ruta,
    rutas: (enc.rutas ?? enc.ruta).split(",").map((r) => r.trim()).filter(Boolean),
    permiso: enc.permiso || "todos",
    resumen: enc.resumen ?? "",
    cuerpo: m[2].trim(),
  };
}

let cache: Promise<PaginaManual[]> | null = null;

/** Todas las páginas del manual (se leen una vez por arranque). */
export function paginasDelManual(raiz = process.cwd()): Promise<PaginaManual[]> {
  const leer = async () => {
    const dir = path.join(raiz, CARPETA_MANUAL);
    const archivos = (await readdir(dir).catch(() => [] as string[])).filter((a) => a.endsWith(".md") && a !== "LEEME.md").sort();
    const paginas = await Promise.all(archivos.map(async (a) => leerPagina(a.replace(/\.md$/, ""), await readFile(path.join(dir, a), "utf8"))));
    return paginas.filter((p): p is PaginaManual => !!p);
  };
  if (raiz !== process.cwd()) return leer();
  cache ??= leer().catch((e) => { cache = null; throw e; });
  return cache;
}

/** Las guías (manual/guia-*.md): las que lista «Manuales de ayuda» de la barra de estado. */
export async function guiasDelManual(): Promise<PaginaManual[]> {
  return (await paginasDelManual()).filter((p) => p.archivo.startsWith("guia-"));
}

/** Sin tildes y en minúsculas, para buscar. */
export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Las secciones de una página (cada "## " o "### " con su texto). */
function secciones(p: PaginaManual): { titulo: string; texto: string }[] {
  const salida: { titulo: string; texto: string }[] = [];
  let actual = { titulo: p.titulo, texto: "" };
  for (const linea of p.cuerpo.split("\n")) {
    const h = linea.match(/^#{2,3}\s+(.*)/);
    if (h) {
      if (actual.texto.trim()) salida.push(actual);
      actual = { titulo: h[1].trim(), texto: "" };
    } else actual.texto += linea + "\n";
  }
  if (actual.texto.trim()) salida.push(actual);
  return salida;
}

/** Busca en el manual: puntúa cada sección por las palabras de la consulta
 *  que contiene (en el título valen más) y devuelve las mejores. */
export function buscarEnManual(paginas: PaginaManual[], consulta: string, max = 8) {
  const palabras = [...new Set(normalizar(consulta).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2))];
  if (!palabras.length) return [];
  const resultados: { pagina: PaginaManual; seccion: string; texto: string; puntos: number }[] = [];
  for (const p of paginas) {
    const encabezado = normalizar(`${p.titulo} ${p.menu} ${p.resumen}`);
    for (const s of secciones(p)) {
      const titulo = normalizar(s.titulo), texto = normalizar(s.texto);
      let puntos = 0;
      for (const w of palabras) {
        if (titulo.includes(w)) puntos += 3;
        if (encabezado.includes(w)) puntos += 1;
        const veces = texto.split(w).length - 1;
        if (veces) puntos += 1 + Math.min(veces, 5) * 0.3;
      }
      if (puntos > 0) resultados.push({ pagina: p, seccion: s.titulo, texto: s.texto.trim(), puntos });
    }
  }
  return resultados.sort((a, b) => b.puntos - a.puntos).slice(0, max);
}

/** Todas las páginas del sistema (app/**\/page.tsx) como direcciones, con
 *  [id] tal cual la carpeta. Para el control de que el manual las cubra. */
export async function paginasDelSistema(raiz = process.cwd()): Promise<string[]> {
  const salida: string[] = [];
  const recorrer = async (dir: string, ruta: string) => {
    const entradas = await readdir(dir, { withFileTypes: true });
    for (const e of entradas) {
      if (e.isDirectory()) {
        if (e.name === "api" || e.name.startsWith("_")) continue;
        // Los grupos "(algo)" no suman a la dirección.
        await recorrer(path.join(dir, e.name), /^\(.*\)$/.test(e.name) ? ruta : `${ruta}/${e.name}`);
      } else if (e.name === "page.tsx") salida.push(ruta || "/");
    }
  };
  await recorrer(path.join(raiz, "app"), "");
  return salida.sort();
}
