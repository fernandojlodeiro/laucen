// Lector de invoices de compra (lib/compras/invoice-leer.ts): fecha en sus formas, número, tabla con SKU, cantidad y
// precio en cualquier columna. Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaInvoice, leerInvoice, numeroInvoice } from "@/lib/compras/invoice-leer";

test("fechas en sus formas", () => {
  assert.deepEqual(fechaInvoice("2025-10-05", true), { fecha: "2025-10-05", dudosa: false });
  assert.deepEqual(fechaInvoice("Oct. 5, 2025", false), { fecha: "2025-10-05", dudosa: false });
  assert.deepEqual(fechaInvoice("5-Oct-2025", false), { fecha: "2025-10-05", dudosa: false });
  assert.deepEqual(fechaInvoice("October 5th, 2025", false), { fecha: "2025-10-05", dudosa: false });
  assert.deepEqual(fechaInvoice("2025年10月5日", false), { fecha: "2025-10-05", dudosa: false });
  assert.deepEqual(fechaInvoice("25/10/2025", true), { fecha: "2025-10-25", dudosa: false });
  assert.deepEqual(fechaInvoice("10/25/2025", false), { fecha: "2025-10-25", dudosa: false });
  assert.deepEqual(fechaInvoice("10/05/2025", true), { fecha: "2025-10-05", dudosa: true });
  assert.deepEqual(fechaInvoice("10/05/2025", false), { fecha: "2025-05-10", dudosa: true });
  assert.deepEqual(fechaInvoice(45935, false), { fecha: "2025-10-05", dudosa: false });
  assert.equal(fechaInvoice("hola", false), null);
});

test("números escritos de varias formas", () => {
  assert.equal(numeroInvoice("US$ 1,234.50"), 1234.5);
  assert.equal(numeroInvoice("1.234,50"), 1234.5);
  assert.equal(numeroInvoice("1,25"), 1.25);
  assert.equal(numeroInvoice("0,125"), 0.125);
  assert.equal(numeroInvoice("1,200"), 1200);
  assert.equal(numeroInvoice(3), 3);
  assert.equal(numeroInvoice("—"), null);
});

test("invoice en inglés: fecha con rótulo, número y SKU propio en otra columna", () => {
  const r = leerInvoice([
    ["SHENZHEN OPENSMART TECHNOLOGY LTD", null, null, null, null],
    ["COMMERCIAL INVOICE", null, null, null, null],
    ["Invoice No.:", "OS20251005", null, "Date:", "10/05/2025"],
    [null, null, null, null, null],
    ["Item No.", "Description", "SKU", "Qty (pcs)", "Unit Price (USD)", "Amount"],
    ["OS-1001", "Arduino Uno R3", "SKU00377", 100, 2.35, 235],
    ["OS-1002", "GPS module", "SKU00536", "50", "", "175.00"],
    ["OS-1003", "Sin SKU", null, 10, 1, 10],
    ["Total", null, null, 160, null, 420],
    ["SKU99999", "después del total", "SKU99999", 1, 1, 1],
  ]);
  assert.equal(r.fecha, "2025-10-05");
  assert.equal(r.fechaDudosa, true);
  assert.equal(r.numero, "OS20251005");
  assert.deepEqual(r.renglones.map((x) => [x.sku, x.cantidad, x.precio, x.descripcion]), [
    ["SKU00377", 100, 2.35, "Arduino Uno R3"],
    ["SKU00536", 50, 3.5, "GPS module"],
    ["", 10, 1, "Sin SKU"],
  ]);
  assert.equal(r.renglones[0].fila, 6);
});

test("invoice con la fecha en la misma celda y sin columna de precio unitario", () => {
  const r = leerInvoice([
    ["PROFORMA INVOICE"],
    ["Date: Mar. 3, 2026"],
    ["Model", "Quantity", "Amount"],
    ["SKU01485", 20, 30],
  ]);
  assert.equal(r.fecha, "2026-03-03");
  assert.equal(r.fechaDudosa, false);
  assert.deepEqual(r.renglones.map((x) => [x.sku, x.cantidad, x.precio]), [["SKU01485", 20, 1.5]]);
});

test("sin tabla: avisa", () => {
  const r = leerInvoice([["hola"], ["chau"]]);
  assert.equal(r.renglones.length, 0);
  assert.ok(r.avisos.some((a) => a.includes("tabla")));
});

test("cuánto duró cada compra: las ventas se comen las compras en orden de llegada", async () => {
  const { duracionCompras } = await import("@/lib/compras/invoices");
  const r = duracionCompras(
    [{ llegada: "2026-01-01", cantidad: 10 }, { llegada: "2026-02-01", cantidad: 5 }, { llegada: "2026-03-01", cantidad: 100 }],
    [["2026-01-05", 4], ["2026-01-20", 6], ["2026-02-10", 3], ["2026-02-20", 4], ["2026-03-05", 2]],
  );
  // Vuelve de la más nueva a la más vieja.
  assert.deepEqual(r.map((x) => [x.llegada, x.agotada, x.dias, x.quedan]), [
    ["2026-03-01", null, null, 96],
    ["2026-02-01", "2026-02-20", 19, 0],
    ["2026-01-01", "2026-01-20", 19, 0],
  ]);
});

test("títulos raros: «Q» y «NEW» (el precio sale de las cuentas) y un renglón sin SKU", () => {
  const r = leerInvoice([
    ["PICTURE", "SKU", "PRODUCT", "Q", "NEW", null],
    [null, "SKU03394", "Starter Kit", 300, 14.5, 4350],
    [null, "SKU01980", "Kit sensores", 200, 6.7, 1340],
    [null, null, "Scanner Elm327", 150, 1.78, 267],
    [null, null, null, null, null, 5957],
  ]);
  assert.deepEqual(r.renglones.map((x) => [x.sku, x.cantidad, x.precio]), [["SKU03394", 300, 14.5], ["SKU01980", 200, 6.7], ["", 150, 1.78]]);
});

test("cantidad titulada «A comprar»", () => {
  const r = leerInvoice([
    ["Date:", "2024-3-21"],
    ["Codigo", "Producto", "Picture", "A comprar", "Price", "Total Amount"],
    ["SKU00125-U", "Llavero", null, 500, 0.06, 30],
  ]);
  assert.equal(r.fecha, "2024-03-21");
  assert.deepEqual(r.renglones.map((x) => [x.sku, x.cantidad, x.precio]), [["SKU00125-U", 500, 0.06]]);
});
