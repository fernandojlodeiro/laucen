// Precio de mercado (lib/compras/precio-mercado.ts): texto de búsqueda y qué publicaciones cuentan.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { estadistica, textoBusqueda } from "@/lib/compras/precio-mercado";

test("texto de búsqueda: sin paréntesis ni SKU, hasta 60 letras", () => {
  assert.equal(textoBusqueda("Lupa De Cabeza Vincha (SKU00857) Led 5 Lentes"), "Lupa De Cabeza Vincha Led 5 Lentes");
  assert.ok(textoBusqueda("x".repeat(100)).length <= 60);
});

test("cuentan las parecidas, sin packs ni las nuestras; mínimo, p25 y mediana", () => {
  const it = (title: string, price: number, sellerName = "OTRO") => ({ id: `MLA${String(Math.round(price)).padStart(10, "1")}`, title, price, sellerName, currency: "ARS" });
  const e = estadistica("Lupa Vincha Led 5 Lentes", [
    it("Lupa Vincha Led 5 Lentes Aumento", 20000), it("Lupa Vincha Con Led 5 Lentes", 24000), it("Lupa vincha led 5 lentes nueva", 30000),
    it("Pack 2 Lupa Vincha Led 5 Lentes", 15000), it("Lupa Vincha Led 5 Lentes", 10000, "NUESTRA"), it("Destornillador", 5000),
  ], new Set(["NUESTRA"]));
  assert.equal(e.encontradas, 3);
  assert.equal(e.minimo, 20000);
  assert.equal(e.mediana, 24000);
  assert.equal(e.p25, 22000);
});
