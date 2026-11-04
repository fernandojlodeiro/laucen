// Reparto del stock entre cuentas de ML cuando queda poco (lib/mercadolibre/reparto.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { repartir, ordenCuentas, prioridadPub, type CuentaReparto } from "@/lib/mercadolibre/reparto";
import { cambioDeStock } from "@/lib/mercadolibre/stock";

// Una cuenta con un solo grupo de stock (una publicación).
const cuenta = (canal: number, vendidos: number, pubs = [canal * 10]): CuentaReparto =>
  ({ canal, vendidos, grupos: [{ clave: `${canal}:a`, vendidos, pubs }] });
const suma = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

test("la suma publicada nunca pasa lo que hay", () => {
  const cuentas = [cuenta(1, 98), cuenta(7, 5), cuenta(8, 40), cuenta(9, 16), cuenta(10, 6)];
  for (let total = 0; total <= 10; total++) assert.equal(suma(repartir(total, cuentas, 279, 1)), total);
});

test("de a una por cuenta, primero la que más vendió", () => {
  const r = repartir(3, [cuenta(7, 5), cuenta(1, 98), cuenta(8, 40), cuenta(9, 16)], 279, null);
  assert.deepEqual([r.get(10), r.get(80), r.get(90), r.get(70)], [1, 1, 1, 0]);
});

test("con más unidades que cuentas, las que sobran también por ventas", () => {
  const r = repartir(6, [cuenta(1, 98), cuenta(8, 40), cuenta(9, 16)], 279, null);
  assert.deepEqual([r.get(10), r.get(80), r.get(90)], [2, 2, 2]);
  const r2 = repartir(5, [cuenta(1, 98), cuenta(8, 40), cuenta(9, 16)], 279, null);
  assert.deepEqual([r2.get(10), r2.get(80), r2.get(90)], [2, 2, 1]);
});

test("en el empate de ventas, primero la cuenta preferida; después un sorteo fijo", () => {
  const empatadas = [cuenta(8, 0), cuenta(9, 0), cuenta(1, 0), cuenta(10, 0)];
  assert.equal(ordenCuentas(empatadas, 279, 1)[0].canal, 1);
  // El sorteo no cambia de una pasada a otra (si no, las cuentas se pausarían y reactivarían solas).
  assert.deepEqual(ordenCuentas(empatadas, 279, 1).map((c) => c.canal), ordenCuentas([...empatadas].reverse(), 279, 1).map((c) => c.canal));
});

test("dentro de una cuenta, cada grupo de stock de ML recibe lo suyo (el que más vendió primero)", () => {
  const c: CuentaReparto = { canal: 1, vendidos: 130, grupos: [
    { clave: "1:UP1", vendidos: 30, pubs: [1, 2] }, // la común y su gemela de catálogo comparten stock
    { clave: "1:UP2", vendidos: 100, pubs: [3] },
  ] };
  const r = repartir(1, [c], 5, null);
  assert.deepEqual([r.get(1), r.get(2), r.get(3)], [0, 0, 1]);
});

test("una cuenta no recibe más que su propio disponible", () => {
  const r = repartir(4, [cuenta(1, 98), cuenta(8, 40)], 279, null, (canal) => (canal === 1 ? 1 : 10));
  assert.deepEqual([r.get(10), r.get(80)], [1, 3]);
});

const pub = { id: 1, canal_id: 1, variacion_id: 1, id_externo: "MLA1", variacion_externa: null, estado: "activa", pausada_por_stock: false, pausada_manual: false, cantidad_publicada: 6, disponible: 6, umbral: 0 };

test("en el reparto, la publicación informa lo que le toca", () => {
  const c = cambioDeStock({ ...pub, asignado: 2 });
  assert.equal(c?.que, "cantidad");
  assert.deepEqual(c?.payload, { cantidad: 2 });
});

test("si en el reparto no le toca nada, se pausa por stock; y se reactiva cuando le toca", () => {
  const c = cambioDeStock({ ...pub, asignado: 0 });
  assert.equal(c?.que, "pausa");
  assert.deepEqual(c?.payload, { estado: "paused", cantidad: 0 });
  const r = cambioDeStock({ ...pub, estado: "pausada", pausada_por_stock: true, cantidad_publicada: 0, asignado: 1 });
  assert.equal(r?.que, "reactivar");
  assert.deepEqual(r?.payload, { cantidad: 1, estado: "active" });
});

test("sin reparto, como siempre: el disponible entero", () => {
  assert.equal(cambioDeStock({ ...pub, asignado: null }), null);
  assert.deepEqual(cambioDeStock({ ...pub, disponible: 4 })?.payload, { cantidad: 4 });
});

// ── Catálogos (Fer, 4/11): primero lo que gana en un catálogo de verdad ──

test("prioridad de una publicación: gana en catálogo de verdad 0, pierde en catálogo de verdad 2, el resto 1", () => {
  assert.equal(prioridadPub({ catalogo: true, estadoGanar: "winning", tipoCatalogo: "catalog_product" }), 0);
  assert.equal(prioridadPub({ catalogo: true, estadoGanar: "sharing_first_place", tipoCatalogo: "catalog_product" }), 0);
  assert.equal(prioridadPub({ catalogo: false, estadoGanar: null, tipoCatalogo: null }), 1);
  assert.equal(prioridadPub({ catalogo: true, estadoGanar: "competing", tipoCatalogo: "catalog_product" }), 2);
  assert.equal(prioridadPub({ catalogo: true, estadoGanar: "not_listed", tipoCatalogo: "catalog_product" }), 1, "pausada, sin dato: neutra (si no, nunca recibe para mostrarse)");
  assert.equal(prioridadPub({ catalogo: true, estadoGanar: "winning", tipoCatalogo: "flex" }), 1, "página armada por ML: el dato no es confiable, neutra");
  assert.equal(prioridadPub({ catalogo: true, estadoGanar: "competing", tipoCatalogo: "flex" }), 1);
  assert.equal(prioridadPub({ catalogo: true, estadoGanar: "winning", tipoCatalogo: null }), 1, "tipo sin leer: neutra");
});

test("dentro de la cuenta, primero el grupo que gana el catálogo aunque venda menos; último el catálogo que no gana", () => {
  const c: CuentaReparto = { canal: 1, vendidos: 300, grupos: [
    { clave: "1:comun", vendidos: 200, pubs: [1], prioridad: 1 },
    { clave: "1:gana", vendidos: 5, pubs: [2], prioridad: 0 },
    { clave: "1:pierde", vendidos: 95, pubs: [3], prioridad: 2 },
  ] };
  const r1 = repartir(1, [c], 5, null);
  assert.deepEqual([r1.get(1), r1.get(2), r1.get(3)], [0, 1, 0]);
  const r2 = repartir(2, [c], 5, null);
  assert.deepEqual([r2.get(1), r2.get(2), r2.get(3)], [1, 1, 0]);
  const r3 = repartir(3, [c], 5, null);
  assert.deepEqual([r3.get(1), r3.get(2), r3.get(3)], [1, 1, 1]);
});

test("entre cuentas, primero la que gana un catálogo de verdad aunque venda menos", () => {
  const gana: CuentaReparto = { canal: 7, vendidos: 3, grupos: [{ clave: "7:cat", vendidos: 3, pubs: [70], prioridad: 0 }] };
  const r = repartir(1, [cuenta(1, 98), cuenta(8, 40), gana], 279, 1);
  assert.deepEqual([r.get(70), r.get(10), r.get(80)], [1, 0, 0]);
  assert.equal(ordenCuentas([cuenta(1, 98), gana], 279, 1)[0].canal, 7);
});

test("con prioridades de catálogo, la suma publicada sigue sin pasar nunca lo que hay", () => {
  const mezcla = (canal: number, vendidos: number): CuentaReparto => ({ canal, vendidos, grupos: [
    { clave: `${canal}:a`, vendidos, pubs: [canal * 10], prioridad: canal % 3 },
    { clave: `${canal}:b`, vendidos: vendidos / 2, pubs: [canal * 10 + 1, canal * 10 + 2], prioridad: (canal + 1) % 3 },
  ] });
  const cuentas = [mezcla(1, 98), mezcla(7, 5), mezcla(8, 40), mezcla(9, 16), mezcla(10, 6)];
  // Las dos publicaciones de un mismo grupo comparten stock en ML: se cuenta una vez por grupo.
  const porGrupo = (m: Map<number, number>) => cuentas.flatMap((c) => c.grupos.map((g) => m.get(g.pubs[0]) ?? 0)).reduce((a, b) => a + b, 0);
  for (let total = 0; total <= 12; total++) assert.equal(porGrupo(repartir(total, cuentas, 279, 1)), total);
});

test("una baja de cantidad sale con la prioridad de una pausa (antes que cualquier suba)", () => {
  const baja = cambioDeStock({ ...pub, cantidad_publicada: 3, asignado: 1 });
  assert.equal(baja?.que, "cantidad");
  assert.equal(baja?.prioridad, 100);
  const sube = cambioDeStock({ ...pub, cantidad_publicada: 1, asignado: 3 });
  assert.equal(sube?.prioridad, 10);
});
