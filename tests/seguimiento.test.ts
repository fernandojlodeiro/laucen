// Seguimiento de publicaciones (lib/seguimiento/): cómo se lee un resultado de Apify. Sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aPubEncontrada, esPack, parecido, diasHasta } from "@/lib/seguimiento";

test("aPubEncontrada: lo que trae el lector de Mercado Libre de Apify", () => {
  const p = aPubEncontrada({
    type: "product", id: "MLA2051561717", title: "Deposito Jardin Galpon", url: "https://articulo.mercadolibre.com.ar/MLA-2051561717",
    sponsored: true, price: 394999, originalPrice: 999999, currency: "ARS", image: "https://http2.mlstatic.com/x.webp",
    sellerName: "NICTOM", officialStore: true, freeShipping: true, installments: "6 cuotas de $88.868",
  });
  assert.equal(p?.itemId, "MLA2051561717");
  assert.equal(p?.precio, 394999);
  assert.equal(p?.precioOriginal, 999999);
  assert.equal(p?.vendedor, "NICTOM");
  assert.equal(p?.tiendaOficial, true);
  assert.equal(p?.publicidad, true);
  assert.equal(p?.catalogoId, null);
});

test("aPubEncontrada: una de catálogo toma la publicación del wid y el catálogo de la dirección", () => {
  const p = aPubEncontrada({ title: "Placa", url: "https://www.mercadolibre.com.ar/placa/p/MLA12345678", clickUrl: "https://click1.x/?a=1&wid=MLA1499999999&sid=s", price: 100 });
  assert.equal(p?.itemId, "MLA1499999999");
  assert.equal(p?.catalogoId, "MLA12345678");
  assert.equal(aPubEncontrada({ title: "sin número" }), null);
});

test("aPubEncontrada: un «producto de vendedor» (MLAU) también se puede seguir; el catálogo nunca es la misma publicación", () => {
  const p = aPubEncontrada({ title: "Servo", url: "https://www.mercadolibre.com.ar/servo/up/MLAU1234567890", price: 10 });
  assert.equal(p?.itemId, "MLAU1234567890");
  // Un resultado /p/MLA… es un producto de catálogo (se abre en sus vendedores por la API).
  const q = aPubEncontrada({ id: "MLA2118082764", url: "https://www.mercadolibre.com.ar/x/p/MLA2118082764", price: 10 });
  assert.equal(q?.esCatalogo, true);
  assert.equal(q?.catalogoId, "MLA2118082764");
});

test("esPack y parecido: los packs se esconden y se ordena por cuánto se parece al nuestro", () => {
  for (const t of ["Pack De 2 Motor Servo", "5 X Motor Servo Dm-s0090d", "Servo x10 unidades", "Kit Arduino", "10 unidades servo"]) assert.equal(esPack(t), true, t);
  for (const t of ["Servo Digital Ds04-nfc 360° Rotacion - Torsion 5.5 Kg/cm", "Placa 3.3v-5v", "Servo Sg90 9g"]) assert.equal(esPack(t), false, t);
  const nuestro = "Servo Digital Ds04-nfc 360° Rotacion";
  assert.ok(parecido(nuestro, "Servomotor Ds04-nfc 360° Arduino") > parecido(nuestro, "Servo Rc 40kg Metal Impermeable"));
});

test("diasHasta: la opción de envío más rápida, en días desde hoy", () => {
  const hoy = new Date("2026-10-10T12:00:00-03:00");
  assert.equal(diasHasta(["2026-11-04T00:00:00-03:00", "2026-11-06T00:00:00-03:00"], hoy), 25);
  assert.equal(diasHasta(["2026-10-11T00:00:00-03:00"], hoy), 1);
  assert.equal(diasHasta([], hoy), null);
});

test("regla de precio: el objetivo y la decisión (sólo baja, nunca abajo del piso)", async () => {
  const { objetivoDe, decidir } = await import("@/lib/seguimiento/regla");
  assert.equal(objetivoDe(19455, "igual", 0), 19455);
  assert.equal(objetivoDe(19455, "pesos", 100), 19355);
  assert.equal(objetivoDe(20000, "pct", 2.5), 19500);
  assert.equal(objetivoDe(19999.9, "igual", 0), 19999);
  assert.deepEqual(decidir(25000, 19355, 15000), { nuevo: 19355, motivo: "" });
  assert.deepEqual(decidir(19000, 19355, 15000).nuevo, null);           // ya está más barato
  assert.deepEqual(decidir(25000, 12000, 15000), { nuevo: 15000, motivo: "queda en el piso" });
  assert.equal(decidir(15000, 12000, 15000).nuevo, null);               // ya está en el piso
  assert.equal(decidir(14000, 12000, 15000).nuevo, null);               // por debajo del piso: no sube
});

test("catalogoDeApify: el catálogo en el que compite una publicación leída con Apify", async () => {
  const { catalogoDeApify } = await import("@/lib/seguimiento");
  assert.equal(catalogoDeApify({ sku: "MLA2082997403" }, "MLA725348734"), "MLA2082997403");
  assert.equal(catalogoDeApify({ sku: "MLA725348734" }, "MLA725348734"), null);
  assert.equal(catalogoDeApify({ sku: "ABC-123" }, "MLA725348734"), null);
  assert.equal(catalogoDeApify({}, "MLA725348734"), null);
});

test("leerRenglon: links de catálogo, de catálogo con vendedor y números sueltos", async () => {
  const { leerRenglon } = await import("@/lib/seguimiento");
  assert.deepEqual(leerRenglon("https://www.mercadolibre.com.ar/servo-ds04/p/MLA2090682290?pdp_filters=item_id:MLA3756369652"),
    { catalogo: "MLA2090682290", items: ["MLA3756369652"] });
  assert.deepEqual(leerRenglon("https://www.mercadolibre.com.ar/servo-ds04/p/MLA2090682290?pdp_filters=item_id%3AMLA3756369652#x"),
    { catalogo: "MLA2090682290", items: ["MLA3756369652"] });
  assert.deepEqual(leerRenglon("https://www.mercadolibre.com.ar/lupa/p/MLA2081953349"), { catalogo: "MLA2081953349", items: [] });
  assert.deepEqual(leerRenglon("https://articulo.mercadolibre.com.ar/MLA-725348734-lupa"), { catalogo: null, items: ["MLA725348734"] });
  assert.deepEqual(leerRenglon("MLAU132461203"), { catalogo: null, items: ["MLAU132461203"] });
});

test("regla de precio: también subir, hasta el techo", async () => {
  const { decidir } = await import("@/lib/seguimiento/regla");
  assert.deepEqual(decidir(18000, 20000, 15000, 25000), { nuevo: 20000, motivo: "" });           // el competidor subió
  assert.deepEqual(decidir(18000, 30000, 15000, 25000), { nuevo: 25000, motivo: "queda en el techo" });
  assert.equal(decidir(25000, 30000, 15000, 25000).nuevo, null);                                  // ya en el techo
  assert.equal(decidir(18000, 20000, 15000, null).nuevo, null);                                   // sin «También subir», no sube
  assert.equal(decidir(20000, 20000, 15000, 25000).nuevo, null);
});

test("esInternacional: entrega internacional o vendedor de afuera", async () => {
  const { esInternacional } = await import("@/lib/seguimiento");
  assert.equal(esInternacional("none", "AR"), false);
  assert.equal(esInternacional(null, null), false);
  assert.equal(esInternacional("CBT", null), true);
  assert.equal(esInternacional(null, "CN"), true);
});

test("simular: la referencia sin excluidas ni internacionales, y qué haría con cada Clásica", async () => {
  const { simular } = await import("@/lib/seguimiento/regla-calculo");
  const c = [
    { id: 1, nombre: "BARATO", precio: 15000, estado: "activa", moneda: "ARS", excluido: true, internacional: false },
    { id: 2, nombre: "CHINO", precio: 14000, estado: "activa", moneda: "ARS", excluido: false, internacional: true },
    { id: 3, nombre: "BUENO", precio: 20000, estado: "activa", moneda: "ARS", excluido: false, internacional: false },
    { id: 4, nombre: "PAUSADO", precio: 10000, estado: "pausada", moneda: "ARS", excluido: false, internacional: false },
  ];
  const p = { contra: "mas_barato" as const, seguimientoId: null, como: "pesos" as const, diferencia: 100, piso: 16000, subir: true, techo: 30000 };
  const s = simular([{ sku: "A", ars: 25000 }, { sku: "B", ars: 18000 }], c, p);
  assert.equal(s.referencia?.nombre, "BUENO");
  assert.equal(s.objetivo, 19900);
  assert.equal(s.filas[0].nuevo, 19900);   // baja
  assert.equal(s.filas[1].nuevo, 19900);   // sube (también subir)
  assert.equal(simular([{ sku: "A", ars: 25000 }], c, { ...p, piso: null }).filas[0].motivo, "falta el piso");
  assert.equal(simular([{ sku: "A", ars: 25000 }], [], p).referencia, null);
});
