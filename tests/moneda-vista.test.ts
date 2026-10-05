// El interruptor de moneda: importes en pesos se ven en dólares (al día si la base lo guarda, si no al tipo de cambio de hoy).
import test from "node:test";
import assert from "node:assert/strict";
import { enMoneda } from "@/lib/moneda";
import { textoCampo } from "@/app/listas/piezas";

test("enMoneda: en pesos no convierte; en dólares divide por el tipo de cambio; sin tipo de cambio queda en pesos", () => {
  assert.equal(enMoneda(1540, "ARS", 1540), "$ 1.540");
  assert.equal(enMoneda(3080, "USD", 1540), "US$ 2");
  assert.equal(enMoneda(3080, "USD", null), "$ 3.080");
  assert.equal(enMoneda(null, "USD", 1540), "—");
});

test("columna en pesos de una lista: dólares del día si la base los guarda, si no tipo de cambio de hoy, y lo fiscal queda en pesos", () => {
  const campo = { clave: "total", titulo: "Total", formato: "pesos" as const };
  assert.equal(textoCampo(campo, { total: 3080 }, "USD", 1540), "US$ 2");               // convierte al TC de hoy
  assert.equal(textoCampo(campo, { total: 3080, total__usd: 3 }, "USD", 1540), "US$ 3"); // el dólar de su día
  assert.equal(textoCampo({ ...campo, fiscal: true }, { total: 3080 }, "USD", 1540), "$ 3.080");
  assert.equal(textoCampo(campo, { total: 3080 }, "ARS", null), "$ 3.080");
});
