// La marca de la tarjeta por su número (lib/tienda/tarjetas.ts): sin navegador ni servidor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { redDeNumero, marcasPosibles, tipoDeMetodoMp, redDeMetodoMp } from "@/lib/tienda/tarjetas";

test("la red sale de los primeros números", () => {
  assert.equal(redDeNumero("4509 9535"), "visa");
  assert.equal(redDeNumero("5517000000000000"), "master");
  assert.equal(redDeNumero("2223000048400011"), "master");
  assert.equal(redDeNumero("371180303257522"), "amex");
  assert.equal(redDeNumero("5895627823453005"), "naranja");
  assert.equal(redDeNumero("6042011234567890"), "cabal");
  assert.equal(redDeNumero("4509"), null, "con menos de 6 números todavía no");
  assert.equal(redDeNumero("6011000990139424"), null, "una que no se acepta");
});

test("las marcas posibles: con el tipo, una sola; sin el tipo, crédito y débito; siempre dentro de las permitidas", () => {
  const todas = [1, 31, 104, 105, 65, 63, 108, 24];
  const debito = [31, 105, 108];
  assert.deepEqual(marcasPosibles("visa", "debito", todas), [31]);
  assert.deepEqual(marcasPosibles("visa", "credito", todas), [1]);
  assert.deepEqual(marcasPosibles("visa", null, todas), [1, 31]);
  assert.deepEqual(marcasPosibles("visa", null, debito), [31], "pago con débito: sólo la de débito");
  assert.deepEqual(marcasPosibles("visa", "credito", debito), [], "una de crédito no sirve para débito");
  assert.deepEqual(marcasPosibles("amex", "debito", todas), []);
  assert.deepEqual(marcasPosibles("master", null, [1, 104]), [104]);
});

test("crédito o débito según Mercado Pago", () => {
  assert.equal(tipoDeMetodoMp({ id: "debvisa", payment_type_id: "debit_card" }), "debito");
  assert.equal(tipoDeMetodoMp({ id: "visa", payment_type_id: "credit_card" }), "credito");
  assert.equal(tipoDeMetodoMp({ id: "debmaster" }), "debito");
  assert.equal(tipoDeMetodoMp({ id: "visa", payment_type_id: "prepaid_card" }), "debito");
  assert.equal(tipoDeMetodoMp({ id: "rapipago", payment_type_id: "ticket" }), null);
});

test("la red según Mercado Pago", () => {
  assert.equal(redDeMetodoMp("debvisa"), "visa");
  assert.equal(redDeMetodoMp("master"), "master");
  assert.equal(redDeMetodoMp("debcabal"), "cabal");
  assert.equal(redDeMetodoMp("maestro"), null);
});
