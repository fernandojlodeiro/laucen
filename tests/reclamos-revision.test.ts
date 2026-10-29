// Tests puros de la revisión de la devolución (lib/mercadolibre/reclamos.ts › armarAccion; Fer, 29/10).

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarAccion } from "@/lib/mercadolibre/reclamos";

const datos = { devolucion: "177919831", orden: "2000019118875332" };

test("llegó mal: una fila por orden, con el motivo y el texto", () => {
  const a = armarAccion("return_review_fail", "5600749687", { ...datos, motivo: "SRF5", mensaje: "Llegó vacío" });
  assert.deepEqual(a.pedidos, [{ metodo: "POST", ruta: "/post-purchase/v1/returns/177919831/return-review",
    cuerpo: [{ order_id: 2000019118875332, reason_id: "SRF5", message: "Llegó vacío" }] }]);
  assert.match(a.descripcion, /llegó mal.*no está en el paquete/);
});

test("llegó mal pide motivo y texto", () => {
  assert.throws(() => armarAccion("return_review_fail", "1", { ...datos, mensaje: "x" }), /Elegí qué pasó/);
  assert.throws(() => armarAccion("return_review_fail", "1", { ...datos, motivo: "SRF5", mensaje: " " }), /Contá qué pasó/);
  assert.throws(() => armarAccion("return_review_fail", "1", { motivo: "SRF5", mensaje: "x" }), /no tiene la devolución/);
});

test("llegó bien: sólo la orden", () => {
  const a = armarAccion("return_review_ok", "1", datos);
  assert.deepEqual(a.pedidos[0].cuerpo, [{ order_id: 2000019118875332 }]);
});
