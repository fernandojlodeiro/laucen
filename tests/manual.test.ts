// El manual del sistema (manual/*.md), sin base: toda página del sistema
// (app/**/page.tsx) tiene que estar en las rutas de algún archivo del manual
// (AGENTS.md: toda pantalla nueva o cambiada actualiza el manual en el mismo
// commit), cada archivo tiene su encabezado completo y un permiso que existe,
// y el asistente encuentra la página de una dirección y busca en el manual.

import { test } from "node:test";
import assert from "node:assert/strict";
import { paginasDelManual, paginasDelSistema, buscarEnManual, leerPagina } from "@/lib/asistente/manual";
import { paginaDeRuta } from "@/lib/asistente/motor";
import { PERMISOS } from "@/lib/permisos";

test("toda página del sistema está en el manual", async () => {
  const [paginas, sistema] = await Promise.all([paginasDelManual(), paginasDelSistema()]);
  const cubiertas = new Set(paginas.flatMap((p) => p.rutas));
  const faltan = sistema.filter((r) => !cubiertas.has(r));
  assert.deepEqual(faltan, [], `Estas páginas no están en las «rutas» de ningún archivo de manual/: ${faltan.join(", ")}`);
  const sobran = [...cubiertas].filter((r) => !sistema.includes(r));
  assert.deepEqual(sobran, [], `Estas rutas del manual no son páginas del sistema: ${sobran.join(", ")}`);
});

test("cada archivo del manual tiene su encabezado y un permiso válido", async () => {
  const paginas = await paginasDelManual();
  assert.ok(paginas.length >= 40);
  const claves = new Set<string>([...PERMISOS.map((p) => p.key), "fer", "todos"]);
  for (const p of paginas) {
    assert.ok(p.titulo && p.menu && p.resumen, `${p.archivo}: falta titulo, menu o resumen`);
    assert.ok(p.rutas.includes(p.ruta), `${p.archivo}: la ruta principal tiene que estar en rutas`);
    assert.ok(claves.has(p.permiso), `${p.archivo}: permiso desconocido «${p.permiso}»`);
    assert.ok(p.cuerpo.length > 300, `${p.archivo}: el texto es muy corto`);
  }
});

test("lee el encabezado de un archivo", () => {
  const p = leerPagina("x", "---\ntitulo: Hola\nmenu: A › B\nruta: /a\nrutas: /a, /a/[id]\npermiso: todos\nresumen: Algo.\n---\n## Para qué sirve\nTexto.");
  assert.equal(p?.titulo, "Hola");
  assert.deepEqual(p?.rutas, ["/a", "/a/[id]"]);
  assert.equal(p?.cuerpo, "## Para qué sirve\nTexto.");
  assert.equal(leerPagina("x", "sin encabezado"), null);
});

test("la página de una dirección (con [id] y parámetros)", async () => {
  const paginas = await paginasDelManual();
  assert.equal(paginaDeRuta(paginas, "/compras/facturas")?.archivo, "compras-facturas");
  assert.equal(paginaDeRuta(paginas, "/compras/facturas/123?editar=ficha")?.archivo, "compras-facturas");
  assert.equal(paginaDeRuta(paginas, "/compras/facturas/arca/7")?.archivo, "compras-facturas");
  assert.equal(paginaDeRuta(paginas, "/no/existe"), null);
});

test("buscar en el manual: importar el libro de IVA de ARCA", async () => {
  const r = buscarEnManual(await paginasDelManual(), "importar mis comprobantes ARCA facturas de compra");
  assert.ok(r.length > 0);
  assert.ok(r.slice(0, 3).some((x) => x.pagina.archivo === "compras-facturas"), r.map((x) => x.pagina.archivo).join(", "));
});

test("los enlaces del manual van a páginas que existen", async () => {
  const [paginas, sistema] = await Promise.all([paginasDelManual(), paginasDelSistema()]);
  const patrones = sistema.map((r) => new RegExp(`^${r.replace(/\[[^\]]+\]/g, "[^/]+")}$`));
  const rotos: string[] = [];
  for (const p of paginas) {
    for (const m of p.cuerpo.matchAll(/\]\((\/[^)\s]*)\)/g)) {
      const ruta = m[1].split(/[?#]/)[0].replace(/\/$/, "") || "/";
      if (!patrones.some((r) => r.test(ruta))) rotos.push(`${p.archivo}: ${m[1]}`);
    }
  }
  assert.deepEqual(rotos, [], `Enlaces a direcciones que no existen:\n${rotos.join("\n")}`);
});
