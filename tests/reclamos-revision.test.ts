// Tests puros de la revisión de la devolución (lib/mercadolibre/reclamos.ts; Fer, 29/10; formato de ML: bitácora #1003).

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarAccion, cuerpoRevisionMal, validarRevisionMal } from "@/lib/mercadolibre/reclamos";

const foto = { nombre: "foto-1.jpg", tipo: "image/jpeg", datos: new Uint8Array([1, 2, 3]) };

test("llegó bien: POST por el reclamo, sin cuerpo", () => {
  const a = armarAccion("return_review_ok", "5600749687");
  assert.deepEqual(a.pedidos, [{ metodo: "POST", ruta: "/post-purchase/v1/claims/5600749687/actions/return-review-ok" }]);
});

test("llegó mal: una sola revisión con reason, message y los archivos subidos (sin order_id)", () => {
  assert.deepEqual(cuerpoRevisionMal("SRF5", "Llegó vacío", ["123_abc.jpg"]), [{ reason: "SRF5", message: "Llegó vacío", attachments: ["123_abc.jpg"] }]);
});

test("llegó mal: valida motivo, texto y fotos", () => {
  assert.deepEqual(validarRevisionMal({ motivo: "SRF5", mensaje: " Llegó vacío " }), { motivo: "SRF5", texto: "Llegó vacío", nombreMotivo: "El producto no está en el paquete" });
  assert.throws(() => validarRevisionMal({ mensaje: "x" }), /Elegí qué pasó/);
  assert.throws(() => validarRevisionMal({ motivo: "SRF5", mensaje: " " }), /Contá qué pasó/);
  // Dañado y otro producto: ML pide fotos.
  assert.throws(() => validarRevisionMal({ motivo: "SRF2", mensaje: "roto" }), /pide fotos/);
  assert.ok(validarRevisionMal({ motivo: "SRF2", mensaje: "roto", fotos: [foto] }));
  assert.throws(() => validarRevisionMal({ motivo: "SRF5", mensaje: "x", fotos: Array(7).fill(foto) }), /Hasta 6/);
  assert.throws(() => validarRevisionMal({ motivo: "SRF5", mensaje: "x", fotos: [{ ...foto, tipo: "application/zip" }] }), /imágenes/);
});
