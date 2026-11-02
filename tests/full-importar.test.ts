// El PDF de un envío a Full de Mercado Libre («Inbound-…-preparation-instructions»): lib/full/importar.ts.
// Los textos son los del envío 81136314 (1/11), con su posición en la página. Sin base.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarInbound } from "@/lib/full/importar";

const t = (str: string, x: number, y: number) => ({ str, x, y, pagina: 1 });
const PDF = [
  t("Envío #81136314", 514, 784), t("Productos del envío: 2 | Total de unidades: 10", 489, 770),
  t("Listado de productos e instrucciones de preparación", 38, 740),
  t("PRODUCTO", 40, 632), t("UNIDADES", 237, 632), t("IDENTIFICACIÓN", 300, 632),
  t("Código ML: SAMK57535 Código universal:", 38, 603), t("5", 237, 605), t("Etiquetado", 300, 605),
  t("0192876546505 SKU: F412DA-NH77", 38, 594),
  t("Ultrabook Asus Vivobook F412da Gris Pizarra 14 1920 Px X", 38, 580), t("1080 Px Disco Ssd Pcie 512 Gb Amd 3700u 8gb De Ram", 38, 571),
  t("Código ML: NTBP62375 Código universal: 192876286241", 38, 542), t("5", 237, 545), t("Etiquetado", 300, 545),
  t("SKU: S532FA-SB77", 38, 533), t("Notebook Asus Vivobook I7-8565u 8gb 512gb Ssd 15.6", 38, 520), t("Fhd Plateado", 38, 511),
];

test("lee el número, cada producto con su código de Full, SKU, título y unidades", () => {
  const r = interpretarInbound(PDF);
  assert.equal(r.numero, "81136314");
  assert.equal(r.total, 10);
  assert.deepEqual(r.productos.map((p) => [p.codigo, p.sku, p.unidades]), [["SAMK57535", "F412DA-NH77", 5], ["NTBP62375", "S532FA-SB77", 5]]);
  assert.equal(r.productos[1].titulo, "Notebook Asus Vivobook I7-8565u 8gb 512gb Ssd 15.6 Fhd Plateado");
});

test("si el total no cierra o no es el PDF de un envío, no importa nada", () => {
  assert.throws(() => interpretarInbound(PDF.map((x) => (x.str.startsWith("Productos del envío") ? { ...x, str: "Productos del envío: 2 | Total de unidades: 11" } : x))), /suman 10/);
  assert.throws(() => interpretarInbound([t("Factura B", 40, 800)]), /Envío #/);
});
