// Tests del filtro "Cuenta" de Facturación de Mercado Libre, sin base: qué
// canal se toma de la dirección (sólo uno de la organización) y cuándo va la
// columna "Cuenta" (con todas las cuentas y más de una).

import { test } from "node:test";
import assert from "node:assert/strict";
import { canalElegido, mostrarCuenta } from "@/lib/mercadolibre/facturacion";

const cuentas = [{ id: 7 }, { id: 12 }];

test("toma el canal de la dirección sólo si es una cuenta de la organización", () => {
  assert.equal(canalElegido("12", cuentas), 12);
  assert.equal(canalElegido("", cuentas), null, "vacío = todas");
  assert.equal(canalElegido(undefined, cuentas), null);
  assert.equal(canalElegido("99", cuentas), null, "un canal de otra organización no filtra");
  assert.equal(canalElegido("7; drop table x", cuentas), null);
  assert.equal(canalElegido("7.5", cuentas), null);
});

test("la columna Cuenta va con todas las cuentas y más de una", () => {
  assert.equal(mostrarCuenta(null, cuentas), true);
  assert.equal(mostrarCuenta(7, cuentas), false, "con una cuenta elegida no hace falta");
  assert.equal(mostrarCuenta(null, [{ id: 7 }]), false, "con una sola cuenta tampoco");
});
