// Promociones de ML: qué cambió entre dos lecturas (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { diferenciasCampana, diferenciasItem, filaDeCampana, filaDePromoItem, type FilaPromoItem } from "@/lib/precios-ml/promos";
import { descuentoPct, textoValorPromo } from "@/app/informes/promociones/formato";

const fila = (o: Partial<FilaPromoItem> = {}): FilaPromoItem => ({
  promocion_id: "P1", tipo: "DEAL", estado: "candidate", nombre: "Día de la Madre", precio: null, min_precio: 100, max_precio: 900, hasta: null, desde: null, limite: null,
  precio_original: null, pct_meli: null, pct_vendedor: null, oferta_id: null, ...o,
});

test("filaDePromoItem: el precio sólo cuenta si está adentro (started / pending); fechas y % de ML y del vendedor", () => {
  const a = filaDePromoItem({ id: "P1", type: "DEAL", status: "started", name: "X", price: 950, original_price: 1000, finish_date: "2026-10-19T03:00:00+00:00", meli_percentage: 3, seller_percentage: 2 })!;
  assert.equal(a.precio, 950); assert.equal(a.precio_original, 1000); assert.equal(a.pct_meli, 3); assert.equal(a.pct_vendedor, 2); assert.ok(a.hasta);
  assert.equal(filaDePromoItem({ id: "P1", type: "DEAL", status: "candidate", price: 950 })!.precio, null);
  assert.equal(filaDePromoItem({ type: "DEAL" }), null);
  // de /promotions/{id}/items: el id es el de la publicación y la campaña viene aparte
  assert.equal(filaDePromoItem({ id: "MLA1", status: "started", price: 5 }, { id: "P9", tipo: "LIGHTNING", nombre: "Relámpago" })!.promocion_id, "P9");
});

test("diferenciasItem: la primera lectura no anota las candidatas, sí las que ya está adentro", () => {
  const ev = diferenciasItem("MLA1", [], [fila(), fila({ promocion_id: "P2", estado: "started", precio: 90 })], true);
  assert.deepEqual(ev.map((e) => [e.que, e.promocion_id]), [["item_alta", "P2"]]);
  // pasada la primera lectura, una campaña nueva a la que puede entrar sí se anota
  assert.deepEqual(diferenciasItem("MLA1", [], [fila()], false).map((e) => e.que), ["item_alta"]);
});

test("diferenciasItem: entra, cambia de precio, sale", () => {
  const antes = [fila({ estado: "started", precio: 90 }), fila({ promocion_id: "P3", estado: "started", precio: 50 })];
  const despues = [fila({ estado: "started", precio: 95 })];
  const ev = diferenciasItem("MLA1", antes, despues);
  assert.deepEqual(ev.map((e) => [e.que, e.promocion_id, e.precio_antes, e.precio_despues]), [["item_precio", "P1", 90, 95], ["item_baja", "P3", 50, null]]);
  const e2 = diferenciasItem("MLA1", [fila()], [fila({ estado: "started", precio: 90 })]);
  assert.deepEqual(e2.map((e) => [e.que, e.antes, e.despues, e.precio_despues]), [["item_estado", "candidate", "started", 90]]);
  assert.deepEqual(diferenciasItem("MLA1", [fila()], [fila()]), []);
});

test("diferenciasCampana: alta, cambio de estado y de fechas; igual no anota nada", () => {
  const c = filaDeCampana({ id: "P1", type: "DEAL", status: "pending", name: "Madre", start_date: "2026-10-01T03:00:00+00:00", finish_date: "2026-10-19T03:00:00+00:00" })!;
  assert.deepEqual(diferenciasCampana(null, c).map((e) => e.que), ["campana_alta"]);
  assert.deepEqual(diferenciasCampana(c, c), []);
  assert.deepEqual(diferenciasCampana(c, { ...c, estado: "started" }).map((e) => [e.que, e.antes, e.despues]), [["campana_estado", "pending", "started"]]);
  assert.deepEqual(diferenciasCampana(c, { ...c, hasta: "2026-10-25T03:00:00+00:00" }).map((e) => e.que), ["campana_fechas"]);
  // la misma hora escrita distinto no es un cambio
  assert.deepEqual(diferenciasCampana(c, { ...c, hasta: "2026-10-19T00:00:00-03:00" }), []);
});

test("formato: descuento y valores en criollo", () => {
  assert.equal(descuentoPct(1000, 950), 5);
  assert.equal(descuentoPct(null, 950), null);
  assert.equal(textoValorPromo("item_estado", "started"), "En curso");
  assert.equal(textoValorPromo("campana_fechas", "2026-10-01T03:00:00.000Z → 2026-10-19T03:00:00Z"), "2026-10-01 → 2026-10-19");
});
