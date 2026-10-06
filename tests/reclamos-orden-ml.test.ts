// Reclamo sin pedido en Laucen: quién compró y qué, de la orden de ML (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirOrdenMl } from "@/lib/mercadolibre/reclamos";

const ORDEN = {
  date_created: "2026-10-03T18:00:00.000-04:00", status: "paid", total_amount: 15303, shipping: { id: 48165466758 },
  buyer: { id: 58663865, nickname: "COMPRADOR1", first_name: "Ana", last_name: "Pérez" },
  order_items: [
    { item: { id: "MLA2097716951", title: "Fuente Protoboard 5v", seller_sku: "SKU01" }, quantity: 1, unit_price: 3000 },
    { item: { id: "MLA1", title: "Placa de cobre", seller_custom_field: "SKU02" }, quantity: 2, unit_price: 4500 },
  ],
};

test("resumirOrdenMl: comprador, total y productos con SKU, cantidad y precio", () => {
  const r = resumirOrdenMl(ORDEN)!;
  assert.deepEqual(r.comprador, { id: 58663865, nickname: "COMPRADOR1", nombre: "Ana Pérez" });
  assert.equal(r.total, 15303);
  assert.equal(r.envio_id, "48165466758");
  assert.deepEqual(r.items.map((x) => [x.item_id, x.sku, x.cantidad, x.precio]), [["MLA2097716951", "SKU01", 1, 3000], ["MLA1", "SKU02", 2, 4500]]);
});

test("resumirOrdenMl: con devolución de una parte, marca sólo el producto reclamado; sin dato, todos", () => {
  assert.deepEqual(resumirOrdenMl(ORDEN, ["MLA1"])!.items.map((x) => x.reclamado), [false, true]);
  assert.deepEqual(resumirOrdenMl(ORDEN)!.items.map((x) => x.reclamado), [true, true]);
});

test("resumirOrdenMl: lo que no es una orden da null", () => {
  assert.equal(resumirOrdenMl(null), null);
  assert.equal(resumirOrdenMl({}), null);
});
