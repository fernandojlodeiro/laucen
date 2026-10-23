// La ruta del Drive donde van los archivos de cada mes (lib/google/ruta.ts): se pega la de un mes cualquiera y se
// reconocen la carpeta del año y la del mes. Pura.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearRuta, coincide, nombreNuevo, rutaDeMes, type Segmento } from "@/lib/google/ruta";

const FER = "\\Mi unidad\\Administracion\\Impuestos\\Impuestos Iva Aportes Iibb Com e Ind Ganancias\\2026\\09 Septiembre\\IVA DIGITAL";

test("la ruta de Fer: fijo hasta el año, año, mes y la carpeta de IVA digital", () => {
  const p = parsearRuta(FER);
  assert.ok(!("error" in p));
  if ("error" in p) return;
  assert.deepEqual(p.segmentos.map((s) => s.tipo), ["fijo", "fijo", "fijo", "año", "mes", "fijo"]);
  assert.equal(rutaDeMes(p.segmentos, 2026, 10), "Administracion › Impuestos › Impuestos Iva Aportes Iibb Com e Ind Ganancias › 2026 › 10 Octubre › IVA DIGITAL");
  assert.equal(rutaDeMes(p.segmentos, 2027, 1), "Administracion › Impuestos › Impuestos Iva Aportes Iibb Com e Ind Ganancias › 2027 › 01 Enero › IVA DIGITAL");
});

test("reconoce la carpeta del mes por su número y las fijas sin mayúsculas ni acentos", () => {
  const mes = { tipo: "mes", separador: " ", estilo: "titulo" } as Segmento;
  assert.ok(coincide("09 Septiembre", mes, 2026, 9));
  assert.ok(coincide("9 - Sept", mes, 2026, 9));
  assert.ok(!coincide("10 Octubre", mes, 2026, 1));
  assert.ok(coincide("01 Enero", mes, 2026, 1));
  assert.ok(coincide("iva digital", { tipo: "fijo", nombre: "IVA DIGITAL" }, 2026, 9));
  assert.ok(coincide("Administración", { tipo: "fijo", nombre: "Administracion" }, 2026, 9));
  assert.ok(coincide("2026", { tipo: "año" }, 2026, 9));
});

test("el formato del mes nuevo copia el del ejemplo", () => {
  const p = parsearRuta("Mi unidad/Adm/2026/09-SEPTIEMBRE/IVA");
  if ("error" in p) throw new Error(p.error);
  assert.equal(nombreNuevo(p.segmentos[2], 2026, 11), "11-NOVIEMBRE");
  const q = parsearRuta("Adm/2026/09/IVA");
  if ("error" in q) throw new Error(q.error);
  assert.equal(nombreNuevo(q.segmentos[2], 2026, 3), "03");
});

test("errores: sin año, sin nada antes del año, sin mes", () => {
  assert.ok("error" in parsearRuta("\\Mi unidad\\Administracion\\IVA"));
  assert.ok("error" in parsearRuta("2026\\09 Septiembre"));
  assert.ok("error" in parsearRuta("Adm\\2026\\Septiembre"));
});
