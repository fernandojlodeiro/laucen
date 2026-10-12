// Historial de ventas de Virtual Seller (lib/importar/ventas-vs-renglones.ts): el informe "Ventas por producto" de VS
// (un .xls que es una tabla HTML) → renglones de venta_historica. Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerHtml } from "@/lib/importar/leer";
import { mapeoSugerido, faltanObligatorios } from "@/lib/importar/campos";
import { renglonesVs, skuSinPrefijo } from "@/lib/importar/ventas-vs-renglones";

const COLUMNAS = ["Pedido: ID", "Fecha", "Venta ML#", "Nro Documento", "Identificación tributaria", "Cliente", "Producto: Código / SKU",
  "Precio Unitario", "Cantidad", "% Descuento", "Importe Descuento", "Subtotal", "Canal de venta", "Producto: Denominación"];
const fila = (c: string[]) => `<tr>${c.map((x) => `<td>${x}</td>`).join("")}</tr>`;
const html = `<head><META http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><table>
<tr>${COLUMNAS.map((c) => `<th filter=all>${c}</th>`).join("")}</tr>
${fila(["PED-1", "15/09/2026", "2000018467772542", "", "", "Pérez, Juan", "SKU03288", "5129,00", "1,00", "0,00", "", "5129,00", "Mercadolibre (Baires)", "Sensor Ina219"])}
${fila(["PED-2", "15/09/2026", "", "11111111", "20-17534131-6", "Gómez, Ana", "SKU01598", "1610,10", "4,00", "0,00", "0,00", "6440,40", "Compra directa (off line)", "Buzzer 5v"])}
${fila(["PED-3", "16/09/2026", "2000018482438024", "", "", "Otro", "DE-SKU01741", "2599,00", "1,00", "0,00", "", "2599,00", "DEIROLAB SA", "Perilla"])}
${fila(["PED-3", "16/09/2026", "2000018482438024", "", "", "Otro", "DE-SKU01741", "2599,00", "1,00", "0,00", "", "2599,00", "DEIROLAB SA", "Perilla"])}
${fila(["PED-4", "31/02/2026", "", "", "", "X", "SKU1", "10", "1", "", "", "10", "Tiendavirtual.com", "Y"])}
</table>`;

const hoja = leerHtml(new TextEncoder().encode(html).buffer as ArrayBuffer);
const mapeo = mapeoSugerido("ventas_vs", hoja.columnas);

test("las columnas del informe de VS se reconocen solas", () => {
  assert.deepEqual(faltanObligatorios("ventas_vs", mapeo), []);
  assert.equal(mapeo.id_externo, "Pedido: ID");
  assert.equal(mapeo.venta_ml, "Venta ML#");
  assert.equal(mapeo.sku, "Producto: Código / SKU");
  assert.equal(mapeo.titulo, "Producto: Denominación");
  assert.equal(mapeo.documento, "Nro Documento");
  assert.equal(mapeo.cuit, "Identificación tributaria");
  assert.equal(mapeo.descuento, "Importe Descuento");
});

test("renglones: números con coma, ML con todos sus dígitos, documento de relleno afuera, repetidos numerados", () => {
  const { ok, errores } = renglonesVs(hoja.filas, mapeo);
  assert.equal(ok.length, 4);
  const [a, b, c, d] = ok;
  assert.equal(a.mlOrder, "2000018467772542");
  assert.equal(a.fecha, "2026-09-15");
  assert.equal(a.total, 5129);
  assert.equal(b.precio, 1610.1);
  assert.equal(b.cantidad, 4);
  assert.equal(b.total, 6440.4);
  assert.equal(b.documento, null);
  assert.equal(b.cuit, "20175341316");
  assert.equal(b.mlOrder, null);
  assert.notEqual(c.clave, d.clave);
  assert.equal(c.clave, "PED-3|DE-SKU01741|2000018482438024|1");
  assert.equal(d.clave, "PED-3|DE-SKU01741|2000018482438024|2");
  assert.equal(errores.length, 1);
  assert.match(errores[0].motivo, /fecha/);
});

test("sin canal entra como «Sin canal en Virtual Seller»; cantidad 0 no es una venta", () => {
  const m = { id_externo: "P", fecha: "F", sku: "S", cantidad: "C", subtotal: "T", canal: "K" };
  const { ok, errores } = renglonesVs([{ n: 2, datos: { P: "PED-1", F: "16/06/2017", S: "HP-1", C: "1,00", T: "16100,00" } },
    { n: 3, datos: { P: "PED-2", F: "13/12/2016", S: "SKU1", C: "0,00", T: "0,00", K: "ML" } }], m);
  assert.equal(ok[0].canal, "Sin canal en Virtual Seller");
  assert.match(errores[0].motivo, /no es una venta/);
});

test("sin subtotal: precio × cantidad − descuento", () => {
  const { ok } = renglonesVs([{ n: 2, datos: { P: "PED-9", F: "01/01/2017", S: "SKU1", C: "3", U: "100,50", D: "1,50", K: "Local" } }],
    { id_externo: "P", fecha: "F", sku: "S", cantidad: "C", precio_unitario: "U", descuento: "D", canal: "K" });
  assert.equal(ok[0].total, 300);
});

test("el «DE-» de las cuentas de DEIROLAB no impide encontrar el producto", () => {
  assert.equal(skuSinPrefijo("DE-SKU01120-B"), "SKU01120-B");
  assert.equal(skuSinPrefijo("SKU03288"), "SKU03288");
});
