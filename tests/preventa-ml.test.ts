// Preventa en Mercado Libre (lib/mercadolibre/stock.ts, cola.ts) y piezas puras de lib/preventa: qué se manda a ML en
// cada caso. Sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cambioDeStock } from "@/lib/mercadolibre/stock";
import { pedidosDe } from "@/lib/mercadolibre/cola";
import { margenSeguridad, diasHasta, precioPreventa } from "@/lib/preventa";
import { leerPacking, numerosDeCaja, porUnidad } from "@/lib/compras/packing-leer";
import { codigoOrden, codigoCaja, leerCodigoCaja } from "@/lib/compras/ordenes";

type Pub = Parameters<typeof cambioDeStock>[0];
const pub = (x: Partial<Pub> = {}): Pub => ({
  id: 1, canal_id: 10, variacion_id: 5, id_externo: "MLA1", variacion_externa: null, estado: "activa", pausada_por_stock: false, pausada_manual: false,
  cantidad_publicada: 3, disponible: 0, umbral: 0, asignado: null, preventa_orden_id: null, preventa_dias: null, preventa: null, preventaManual: false, ...x,
});

test("margen de seguridad: el menor entre unidades y %, el % redondeado para arriba", () => {
  const m = { unidades: 5, pct: 10, modo: "menor" as const };
  assert.equal(margenSeguridad(10, m), 1);
  assert.equal(margenSeguridad(15, m), 2);
  assert.equal(margenSeguridad(100, m), 5);
  assert.equal(margenSeguridad(100, { ...m, modo: "mayor" }), 10);
  assert.equal(margenSeguridad(100, { unidades: null, pct: null, modo: "menor" }), 0);
  assert.equal(margenSeguridad(30, { unidades: null, pct: 10, modo: "menor" }), 3);
});

test("días de demora para ML y precio de preventa", () => {
  assert.equal(diasHasta("2026-11-20", "2026-11-05"), 15);
  assert.equal(diasHasta("2026-11-01", "2026-11-05"), 1, "atrasada: al menos 1");
  assert.equal(precioPreventa(10000, 15), 8500);
});

test("ML: sin stock y con preventa, activa con el cupo y la demora; si ya está igual, nada", () => {
  const c = cambioDeStock(pub({ estado: "pausada", pausada_por_stock: true, cantidad_publicada: 0, preventa: { ordenId: 7, dias: 20, cupo: 12 } }))!;
  assert.equal(c.que, "reactivar");
  assert.deepEqual(c.payload, { cantidad: 12, estado: "active", preventa: { dias: 20 } });
  assert.deepEqual(c.efecto?.publicacion?.preventa, { ordenId: 7, dias: 20 });
  assert.equal(cambioDeStock(pub({ cantidad_publicada: 12, preventa_orden_id: 7, preventa_dias: 20, preventa: { ordenId: 7, dias: 20, cupo: 12 } })), null);
  // Pasa un día: se actualizan los días.
  const d = cambioDeStock(pub({ cantidad_publicada: 12, preventa_orden_id: 7, preventa_dias: 20, preventa: { ordenId: 7, dias: 19, cupo: 12 } }))!;
  assert.deepEqual(d.payload, { cantidad: 12, estado: "active", preventa: { dias: 19 } });
});

test("ML: se agota el cupo de la preventa → pausa", () => {
  const c = cambioDeStock(pub({ cantidad_publicada: 2, preventa_orden_id: 7, preventa_dias: 20, preventa: { ordenId: 7, dias: 20, cupo: 0 } }))!;
  assert.equal(c.que, "pausa");
  assert.deepEqual(c.payload, { cantidad: 0, estado: "paused" });
});

test("ML: llega la mercadería (hay stock) → se saca la demora y sigue como siempre", () => {
  const c = cambioDeStock(pub({ disponible: 8, cantidad_publicada: 5, preventa_orden_id: 7, preventa_dias: 3, preventa: null }))!;
  assert.deepEqual(c.payload, { cantidad: 8, preventa: { dias: null } });
  assert.deepEqual(c.efecto?.publicacion?.preventa, { ordenId: null, dias: null });
  // Ya con la cantidad bien: sólo sacar la demora.
  const d = cambioDeStock(pub({ disponible: 5, cantidad_publicada: 5, preventa_orden_id: 7, preventa_dias: 3 }))!;
  assert.deepEqual(d.payload, { preventa: { dias: null } });
  // Sin preventa y sin stock: la pausa de siempre (no cambia nada de lo que había).
  const e = cambioDeStock(pub({ disponible: 0, cantidad_publicada: 3 }))!;
  assert.equal(e.que, "pausa");
  assert.equal("preventa" in e.payload, false);
});

test("ML: un canal sin preventa automática no la pone solo; si ya está puesta, no la toca; pausada a mano, nunca", () => {
  const sinPoner = cambioDeStock(pub({ cantidad_publicada: 3, preventaManual: true, preventa: { ordenId: 7, dias: 20, cupo: 12 } }))!;
  assert.equal(sinPoner.que, "pausa", "sigue la regla de siempre: sin stock, pausa");
  assert.equal(cambioDeStock(pub({ preventaManual: true, preventa_orden_id: 7, preventa_dias: 25, preventa: { ordenId: 7, dias: 20, cupo: 12 } })), null);
  assert.equal(cambioDeStock(pub({ pausada_manual: true, preventa: { ordenId: 7, dias: 20, cupo: 12 } })), null);
});

test("cola: la demora va como término de venta MANUFACTURING_TIME, antes que la cantidad y el estado", () => {
  const p = pedidosDe({ item_id: "MLA1", variation_id: "", tipo: "stock", payload: { cantidad: 12, estado: "active", preventa: { dias: 20 } } });
  assert.deepEqual(p[0], { metodo: "PUT", ruta: "/items/MLA1", cuerpo: { sale_terms: [{ id: "MANUFACTURING_TIME", value_name: "20 días" }] } });
  assert.deepEqual(p[1].cuerpo, { available_quantity: 12 });
  assert.deepEqual(p[2].cuerpo, { status: "active" });
  const q = pedidosDe({ item_id: "MLA1", variation_id: "", tipo: "stock", payload: { preventa: { dias: null } } });
  assert.deepEqual(q, [{ metodo: "PUT", ruta: "/items/MLA1", cuerpo: { sale_terms: [{ id: "MANUFACTURING_TIME", value_id: null, value_name: null }] } }]);
});

test("códigos de orden y de caja", () => {
  assert.equal(codigoOrden("maritimo", 2, 2026), "M0226");
  assert.equal(codigoOrden("aereo", 1, 2026), "A0126");
  assert.equal(codigoOrden("courier", 3, 2027), "C0327");
  assert.equal(codigoOrden("aereo", 104, 2026), "A10426");
  assert.equal(codigoCaja("M0226", 34), "M0226-34");
  assert.equal(codigoCaja("A0126", 5), "A0126-05");
  assert.deepEqual(leerCodigoCaja(" m0226-34 "), { orden: "M0226", caja: 34 });
  assert.equal(leerCodigoCaja("hola"), null);
});

test("packing list: cajas con varios SKU (número en el primer renglón), rangos de cajas y el pie", () => {
  assert.deepEqual(numerosDeCaja("1-3"), [1, 2, 3]);
  assert.deepEqual(numerosDeCaja("45,46"), [45, 46]);
  assert.deepEqual(numerosDeCaja(7), [7]);
  const filas = [
    ["Packing list"],
    ["SKU", "PRODUCT", "QTY", "Carton", "L", "W", "H", "CBM", "WEIGHT"],
    ["SKU00001", "Uno", 100, 1, 45, 35, 30, 0.04725, 11],
    ["SKU00002", "Dos", 10, null, 45, 35, 30, 0.04725, 11],
    ["SKU00003", "Tres", 60, "2-4", 50, 40, 30, 0.06, 9],
    [null, null, 170, 4, null, null, null, 0.22725, 38],
  ];
  const r = leerPacking(filas);
  assert.deepEqual(r.cajas.map((k) => [k.numero, k.items.map((i) => `${i.sku}:${i.cantidad}`).join(" "), k.peso_kg]),
    [[1, "SKU00001:100 SKU00002:10", 11], [2, "SKU00003:20", 9], [3, "SKU00003:20", 9], [4, "SKU00003:20", 9]]);
  assert.deepEqual(r.total, { unidades: 170, peso_kg: 38, cbm: 0.22725 });
  assert.deepEqual(r.avisos, []);
  const u = porUnidad(r.cajas);
  const tres = u.find((x) => x.sku === "SKU00003")!;
  assert.equal(tres.exacto, true);
  assert.equal(tres.peso_kg, 27);
  const uno = u.find((x) => x.sku === "SKU00001")!;
  assert.equal(uno.exacto, false);
  assert.equal(uno.peso_kg, 10);
});
