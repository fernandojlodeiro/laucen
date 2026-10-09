// Tests de los precios en Mercado Libre (lib/precios-ml/): el motor en
// funciones puras (tachado heredado, precio de cada plan con sus comisiones,
// precio mínimo por plan, plan destacado, escalones de volumen con la regla
// de stock) y, contra la base, el producto con precio en dólares y la
// preparación de lotes (nunca se llama a ML: todo queda "preparado").
//
//   TEST_DATABASE_URL=postgresql://… npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  heredar, cadenaFamilias, precioPlan, tachado, elegirDestacado, escalonesPara, normalizarEscalones, planDePublicacion,
  comisionesDe, cuotasRepetidas, proponer, pedidosPrecio, pedidoCrear, campanasPara, holguraPlan,
  type FilaVolumen, type ReglaTachado, type ReglasPlan, type EntradaVariacion, type PubMl, type ReglasCanal,
  tablaVolumen, precioVendedorCampana, campanasBajoPiso, descuentoComprador, tachadoDeDescuento, type PropuestaPub,
} from "@/lib/precios-ml/motor";
import { reglasDeGrupos, ganadorDe, ajustesDeGrupos, type GrupoPlanes } from "@/lib/precios-ml/grupos";

// ── El motor (sin base) ─────────────────────────────────────

test("planes por grupo: Notebooks (familia) gana a Resto (general); desde la barrera; «¿gana?» sigue por cuenta", () => {
  const plan = (usar: boolean, cuotas: number | null, margen: number | null) => ({ usar, cuotasVisibles: cuotas, margenPct: margen });
  const grupos: GrupoPlanes[] = [
    { id: 1, nombre: "Notebooks", familias: [3], nombresFamilias: ["Notebooks"], orden: 1,
      planes: { premium: plan(true, 9, 3), "3x_campaign": plan(true, 6, 2), "9x_campaign": plan(false, null, null), "12x_campaign": plan(true, 18, 4) },
      gana: { clasica: 1, premium: "rota", "3x_campaign": "rota", "9x_campaign": "rota", "12x_campaign": 1 }, ajusteNoGana: 3 },
    { id: 2, nombre: "Resto", familias: [], nombresFamilias: [], orden: 2,
      planes: { premium: plan(true, 6, 8), "3x_campaign": plan(false, 3, null), "9x_campaign": plan(true, 12, 12), "12x_campaign": plan(false, 12, null) },
      gana: { clasica: 1, premium: "rota", "3x_campaign": "rota", "9x_campaign": 1, "12x_campaign": 1 }, ajusteNoGana: 3 },
  ];
  const reglas: ReglasCanal = {
    tachado: [],
    planes: [{ nivel: "producto", producto_id: 7, plan: "premium", activo: null, precio_minimo: null, margen_pct: null, cuotas_visibles: null, ajuste_pct: 3 },
      ...reglasDeGrupos(grupos, 33_000)],
    volumen: [], reglaStock: true,
  };
  const com = { clasica: 16.34, premium: 29.7, "3x_campaign": 25.2, "9x_campaign": 34.1, "12x_campaign": 37.9 };
  const entrada = (productoId: number, familias: number[], clasica: number): EntradaVariacion =>
    ({ variacionId: productoId, productoId, lugar: { productoId, familias }, clasica, stock: 1, comisiones: com, comisionEstimada: false, pubs: [] });
  const habil = (e: EntradaVariacion) => proponer(e, reglas).planes.filter((p) => p.habilitado).map((p) => `${p.plan}:${p.cuotasVisibles}:${p.margenPct}`);
  // Notebook (familia 3, debajo de 2): Premium 9 cuotas, 3x 6, 12x 18.
  assert.deepEqual(habil(entrada(7, [3, 2], 1_000_000)), ["premium:9:3", "3x_campaign:6:2", "12x_campaign:18:4"]);
  // Otro producto: Premium 6 y 9x 12; abajo de la barrera, ninguno.
  assert.deepEqual(habil(entrada(8, [50], 40_000)), ["premium:6:8", "9x_campaign:12:12"]);
  assert.deepEqual(habil(entrada(8, [50], 32_999)), []);
  // El «¿gana?» del producto 7 en esta cuenta sigue valiendo: su Premium va 3 % más cara.
  const p7 = proponer(entrada(7, [3, 2], 1_000_000), reglas).planes.find((p) => p.plan === "premium")!;
  assert.equal(p7.precio, Math.round(precioPlan(1_000_000, 16.34, 29.7, 3) * 1.03));

  // Quién gana por grupo: .BAIRES (1) fijo en la Clásica; la Premium «rota» entre 7, 8, 9 y 10 según el producto.
  const canales = [1, 7, 8, 9, 10];
  assert.equal(ganadorDe(grupos[1], "clasica", 8, canales), 1);
  assert.deepEqual([100, 101, 102, 103, 104].map((p) => ganadorDe(grupos[1], "premium", p, canales)), [7, 8, 9, 10, 7]);
  const enOcho = ajustesDeGrupos(grupos, 8, canales);
  assert.deepEqual(enOcho({ productoId: 101, familias: [50] }), { clasica: 3, premium: 0, "3x_campaign": 0, "9x_campaign": 3, "12x_campaign": 3 });
  // En el motor: sin nada propio, la Clásica de esta cuenta (que no gana) va 3 % más cara.
  const r8: ReglasCanal = { ...reglas, planes: reglasDeGrupos(grupos, 33_000), ajusteGrupo: enOcho };
  assert.equal(proponer(entrada(101, [50], 40_000), r8).clasica, Math.round(40_000 * 1.03));
});

const padres = new Map<number, number | null>([[10, null], [11, 10], [12, 11]]);
const lugar = { productoId: 7, familias: cadenaFamilias(12, padres) };

test("herencia: producto → familia (subiendo por el árbol) → general; gana lo más específico", () => {
  assert.deepEqual(lugar.familias, [12, 11, 10]);
  const filas: ReglaTachado[] = [
    { nivel: "general", tachado_pct: 20 },
    { nivel: "familia", familia_id: 10, tachado_pct: 25 },
  ];
  let r = heredar(filas, lugar, (f) => f.tachado_pct);
  assert.equal(r.valor, 25);
  assert.deepEqual(r.origen, { nivel: "familia", familiaId: 10 });
  filas.push({ nivel: "familia", familia_id: 11, tachado_pct: null }); // vacío: hereda
  r = heredar(filas, lugar, (f) => f.tachado_pct);
  assert.equal(r.valor, 25);
  filas.push({ nivel: "producto", producto_id: 7, tachado_pct: 30 });
  assert.equal(heredar(filas, lugar, (f) => f.tachado_pct).valor, 30);
  // Otro producto de otra familia: el general.
  assert.equal(heredar(filas, { productoId: 8, familias: [] }, (f) => f.tachado_pct).valor, 20);
  assert.equal(tachado(10_000, 25), 12_500);
});

test("precio de un plan: Clásica × (1 − com. Clásica) ÷ (1 − com. plan) × (1 + margen)", () => {
  // 10.000 × 0,86 / 0,73 = 11.780,82 → 11.781; con 2 % de margen: 12.016,44 → 12.016
  assert.equal(precioPlan(10_000, 14, 27), 11_781);
  assert.equal(precioPlan(10_000, 14, 27, 2), 12_016);
  // Comisiones de una categoría: la Premium es el total; los planes suman a la Clásica.
  const c = comisionesDe({ clasica_pct: 13, premium_pct: 18, premium_3x_pct: 3, premium_9x_pct: 9.5, premium_12x_pct: 12 });
  assert.equal(c.estimada, false);
  assert.deepEqual(c.valores, { clasica: 13, premium: 18, "3x_campaign": 16, "9x_campaign": 22.5, "12x_campaign": 25 });
  // Sin categoría relevada: la general, marcada como estimada.
  assert.equal(comisionesDe(null).estimada, true);
});

test("plan destacado: el que mejor cierra con su precio para ganar; ninguno si no cierra", () => {
  const base = { margenPct: 0, cuotasVisibles: 6 };
  // Clásica 10.000 al 14 %: deja 8.600. 12x al 27 % con ptw 12.500 deja 9.125 (+6,1 %); 6 cuotas al 19 % con ptw 10.700 deja 8.667 (+0,8 %).
  const d = elegirDestacado(10_000, 14, [
    { plan: "premium", priceToWin: 10_700, comisionPct: 19, ...base },
    { plan: "12x_campaign", priceToWin: 12_500, comisionPct: 27, ...base, cuotasVisibles: 12 },
  ]);
  assert.equal(d?.plan, "12x_campaign");
  assert.equal(d?.precio, 12_500);
  assert.ok(Math.abs(d!.holgura - holguraPlan(12_500, 10_000, 14, 27)) < 1e-9);
  // Con un margen exigido de 7 % el 12x no cierra: gana el de 6 cuotas.
  assert.equal(elegirDestacado(10_000, 14, [
    { plan: "premium", priceToWin: 10_700, comisionPct: 19, ...base },
    { plan: "12x_campaign", priceToWin: 12_500, comisionPct: 27, margenPct: 7, cuotasVisibles: 12 },
  ])?.plan, "premium");
  // Ninguno cierra (o no hay precio para ganar leído).
  assert.equal(elegirDestacado(10_000, 14, [{ plan: "premium", priceToWin: 9_000, comisionPct: 19, ...base }]), null);
  assert.equal(elegirDestacado(10_000, 14, [{ plan: "premium", priceToWin: null, comisionPct: 19, ...base }]), null);
});

test("volumen: rango por Clásica, hasta 5 escalones, regla de stock y excepción sin descuento", () => {
  assert.deepEqual(normalizarEscalones([{ cantidad: 3, pct: 5 }, { cantidad: 1, pct: 2 }, { cantidad: 2, pct: 3 }, { cantidad: 3, pct: 6 }]),
    [{ cantidad: 2, pct: 3 }, { cantidad: 3, pct: 6 }]);
  const filas: FilaVolumen[] = [
    { nivel: "general", desde_precio: 0, hasta_precio: 20_000, escalones: [{ cantidad: 2, pct: 3 }, { cantidad: 5, pct: 6 }], sin_descuento: false },
    { nivel: "general", desde_precio: 20_000, hasta_precio: null, escalones: [{ cantidad: 2, pct: 5 }, { cantidad: 10, pct: 10 }], sin_descuento: false },
  ];
  let r = escalonesPara(15_000, filas, lugar, 3);
  assert.deepEqual(r.escalones, [{ cantidad: 2, pct: 3 }]); // con 3 en stock, el de 5 no
  assert.deepEqual(r.sinStock, [{ cantidad: 5, pct: 6 }]);
  r = escalonesPara(25_000, filas, lugar, 100);
  assert.deepEqual(r.escalones, [{ cantidad: 2, pct: 5 }, { cantidad: 10, pct: 10 }]);
  assert.equal(escalonesPara(15_000, filas, lugar, 3, false).escalones.length, 2); // sin la regla de stock
  // La categoría dice "sin descuento": manda entera aunque el general tenga.
  filas.push({ nivel: "familia", familia_id: 11, desde_precio: 0, hasta_precio: null, escalones: [], sin_descuento: true });
  r = escalonesPara(15_000, filas, lugar, 100);
  assert.deepEqual(r.escalones, []);
  assert.deepEqual(r.origen, { nivel: "familia", familiaId: 11 });
});

test("plan de una publicación por tipo y marcas; cuotas que ve el comprador repetidas", () => {
  assert.equal(planDePublicacion("gold_special", []), "clasica");
  assert.equal(planDePublicacion("gold_pro", ["good_quality_picture"]), "premium");
  assert.equal(planDePublicacion("gold_pro", ["9x_campaign"]), "9x_campaign");
  assert.equal(planDePublicacion("free", []), null);
  assert.deepEqual(cuotasRepetidas([{ plan: "9x_campaign", cuotasVisibles: 12 }, { plan: "12x_campaign", cuotasVisibles: 12 }, { plan: "premium", cuotasVisibles: 6 }]),
    [{ cuotas: 12, planes: ["9x_campaign", "12x_campaign"] }]);
});

const pub = (x: Partial<PubMl>): PubMl => ({
  publicacionId: 1, itemId: "MLA1", variationId: null, plan: "clasica", estado: "activa", precioListaMl: null, precioVentaMl: null,
  priceToWin: null, estadoPtw: null, campanas: [], volumenMl: null, userProductId: "MLAU1", catalogProductId: "MLA999", catalogo: true, ...x,
});
const comisiones = { clasica: 14, premium: 19, "3x_campaign": 17, "9x_campaign": 24, "12x_campaign": 27 };
const planGeneral = (plan: ReglasPlan["plan"], x: Partial<ReglasPlan> = {}): ReglasPlan =>
  ({ nivel: "general", plan, activo: true, precio_minimo: null, margen_pct: null, cuotas_visibles: null, ...x });

test("propuesta: precio mínimo por plan, destacado al precio para ganar en las campañas de la Clásica, plan faltante", () => {
  const reglas: ReglasCanal = {
    tachado: [{ nivel: "general", tachado_pct: 25 }],
    planes: [planGeneral("premium"), planGeneral("12x_campaign", { precio_minimo: 50_000 }), planGeneral("3x_campaign"),
      // En esta categoría el 3 cuotas está apagado.
      { nivel: "familia", familia_id: 10, plan: "3x_campaign", activo: false, precio_minimo: null, margen_pct: null, cuotas_visibles: null }],
    volumen: [], reglaStock: true,
  };
  const campana = { id: "P1", tipo: "SELLER_CAMPAIGN", estado: "candidate", precio: null, min: 5_000, max: 11_000 };
  const e: EntradaVariacion = {
    // La lista tiene la Clásica (Fer, 8/10): 10.000 con tachado 25 % → tachado 12.500.
    variacionId: 1, productoId: 7, lugar, clasica: 10_000, stock: 5, comisiones, comisionEstimada: false,
    pubs: [
      pub({ publicacionId: 1, itemId: "MLA1", plan: "clasica", precioListaMl: 11_000, campanas: [campana] }),
      pub({ publicacionId: 2, itemId: "MLA2", plan: "premium", precioListaMl: 10_000, priceToWin: 10_900,
        campanas: [{ ...campana, min: 5_000, max: 12_000 }, { id: "P2", tipo: "DEAL", estado: "candidate", precio: null, min: 1, max: 99_999 }] }),
    ],
  };
  const p = proponer(e, reglas);
  assert.equal(p.tachado, 12_500);
  const pl = Object.fromEntries(p.planes.map((x) => [x.plan, x]));
  assert.equal(pl["12x_campaign"].habilitado, false); // Clásica 10.000 < mínimo 50.000
  assert.equal(pl["3x_campaign"].habilitado, false); // apagado en la categoría
  assert.equal(pl.premium.habilitado, true);
  assert.equal(p.destacado?.plan, "premium");
  assert.equal(p.destacado?.precio, 10_900);
  const [clas, prem] = p.pubs;
  assert.equal(clas.rol, "clasica");
  assert.equal(clas.lista, 12_500);
  assert.equal(clas.venta, 10_000);
  assert.deepEqual(clas.entrar.map((c) => c.id), ["P1"]);
  assert.equal(prem.rol, "destacado");
  assert.equal(prem.venta, 10_900);
  // Un solo tachado por modelo (Fer, 7/10): el de la Clásica.
  assert.equal(prem.lista, 12_500);
  // Sólo en las campañas de la Clásica (P1), no en la otra (P2).
  assert.deepEqual(prem.entrar.map((c) => c.id), ["P1"]);
  const pedidos = pedidosPrecio(prem);
  assert.deepEqual(pedidos.map((x) => x.metodo), ["PUT", "POST"]);
  assert.deepEqual(pedidos[0].cuerpo, { price: 12_500 });
  assert.deepEqual(pedidos[1].cuerpo, { promotion_id: "P1", promotion_type: "SELLER_CAMPAIGN", deal_price: 10_900 });
  // Ningún plan habilitado sin publicación: el 12x está debajo del mínimo y el 3x apagado.
  assert.deepEqual(p.faltan, []);

  // Con la Clásica arriba del mínimo, el 12x falta. Ya no se crea desde acá (user-products daba 500):
  // se crea desde Creaciones en ML.
  const p2 = proponer({ ...e, clasica: 75_000 }, reglas);
  assert.deepEqual(p2.faltan.map((f) => f.plan), ["12x_campaign"]);
  assert.equal(pedidoCrear(p2.faltan[0]), null);
});

test("esquema de notebooks (7/10): un tachado por modelo, la cuenta que no gana va más cara, los planes van por campaña", () => {
  const camp = (id: string) => ({ id, tipo: "SELLER_CAMPAIGN", estado: "candidate", precio: null, min: 1, max: 99_999_999 });
  const reglas: ReglasCanal = {
    // Tachado = Clásica × 1,8181818 (−45 %); esta cuenta no gana la Clásica (3 % más).
    tachado: [{ nivel: "producto", producto_id: 7, tachado_pct: 81.81818, ajuste_pct: 3 }],
    planes: [
      { nivel: "producto", producto_id: 7, plan: "3x_campaign", activo: true, precio_minimo: null, margen_pct: 2, cuotas_visibles: null, ajuste_pct: 0 },
      { nivel: "producto", producto_id: 7, plan: "12x_campaign", activo: true, precio_minimo: null, margen_pct: 4, cuotas_visibles: null, ajuste_pct: 3 },
    ],
    volumen: [], reglaStock: true,
  };
  const com = { clasica: 12.8, premium: 26.2, "3x_campaign": 21.7, "9x_campaign": 30.6, "12x_campaign": 34.4 };
  const e: EntradaVariacion = {
    variacionId: 1, productoId: 7, lugar, clasica: 1_256_226, stock: 5, comisiones: com, comisionEstimada: false,
    pubs: [
      pub({ publicacionId: 1, itemId: "MLA1", plan: "clasica", precioListaMl: 2_284_047, precioVentaMl: 2_284_047, campanas: [camp("C1")], priceToWin: null, catalogo: false }),
      pub({ publicacionId: 2, itemId: "MLA2", plan: "3x_campaign", precioListaMl: 2_284_047, precioVentaMl: 2_284_047, campanas: [camp("C1")], priceToWin: null, catalogo: false }),
      pub({ publicacionId: 3, itemId: "MLA3", plan: "12x_campaign", precioListaMl: 2_284_047, precioVentaMl: 2_284_047, campanas: [camp("C1")], priceToWin: null, catalogo: false }),
    ],
  };
  const p = proponer(e, reglas);
  assert.equal(p.tachado, 2_284_047);
  assert.equal(p.clasica, Math.round(1_256_226 * 1.03));
  const [cl, x3, x12] = p.pubs;
  // Todos al mismo tachado (no cambia) y cada uno entra a la campaña a su precio.
  for (const pa of p.pubs) { assert.equal(pa.lista, 2_284_047); assert.equal(pa.cambiaPrecio, false); assert.deepEqual(pa.entrar.map((c) => c.id), ["C1"]); }
  assert.equal(cl.venta, Math.round(1_256_226 * 1.03));
  // El 3x gana: el piso (Clásica × coeficiente × 1,02); el 12x no: 3 % más.
  assert.equal(x3.venta, precioPlan(1_256_226, 12.8, 21.7, 2));
  assert.equal(x12.venta, Math.round(precioPlan(1_256_226, 12.8, 34.4, 4) * 1.03));

  // Ya en campaña: el tachado y el precio van al esquema saliendo y volviendo a entrar (9/10).
  const enCampana = (precio: number) => ({ id: "D1", tipo: "DEAL", estado: "started", precio, min: 1, max: 99_999_999 });
  const e2: EntradaVariacion = { ...e, pubs: [
    pub({ publicacionId: 1, itemId: "MLA1", plan: "clasica", precioListaMl: 1_712_879, precioVentaMl: 1_317_599, campanas: [enCampana(1_317_599)], priceToWin: null, catalogo: false }),
    pub({ publicacionId: 2, itemId: "MLA2", plan: "3x_campaign", precioListaMl: 1_712_879, precioVentaMl: 1_300_000, campanas: [enCampana(1_300_000)], priceToWin: null, catalogo: false }),
  ] };
  const [c2, x2] = proponer(e2, reglas).pubs;
  assert.equal(c2.lista, 2_284_047);
  assert.equal(c2.cambiaPrecio, true);
  assert.equal(c2.venta, Math.round(1_256_226 * 1.03)); // baja
  assert.deepEqual(c2.salir.map((c) => c.id), ["D1"]);
  assert.deepEqual(c2.entrar.map((c) => c.id), ["D1"]);
  assert.equal(x2.venta, precioPlan(1_256_226, 12.8, 21.7, 2)); // el esquema da más: sube
  assert.deepEqual(x2.salir.map((c) => c.id), ["D1"]);
  assert.deepEqual(x2.entrar.map((c) => c.id), ["D1"]);
});

test("campañas: queda la que ya está al precio; la que está a otro precio sale y vuelve a entrar; fuera de rango no", () => {
  const c = campanasPara([
    { id: "A", tipo: "DEAL", estado: "started", precio: 10_000, min: 1, max: 20_000 },
    { id: "B", tipo: "DEAL", estado: "started", precio: 9_000, min: 1, max: 20_000 },
    { id: "C", tipo: "SELLER_CAMPAIGN", estado: "candidate", precio: null, min: 11_000, max: 20_000 },
    { id: "D", tipo: "MARKETPLACE_CAMPAIGN", estado: "candidate", precio: null, min: null, max: null },
  ], 10_000);
  assert.deepEqual(c.quedan.map((x) => x.id), ["A"]);
  assert.deepEqual(c.salir.map((x) => x.id), ["B"]);
  assert.deepEqual(c.entrar.map((x) => x.id), ["B"]);
  assert.deepEqual(c.fuera.map((x) => x.id), ["C"]);
});

test("en campaña sin esquema (tachado 0): no la saca de la campaña (7/10)", async () => {
  const { ventaHoy } = await import("@/lib/precios-ml/datos");
  const dia = { id: "P-1", tipo: "DEAL", estado: "started", precio: 1_789_999, min: 1, max: 99_999_999 };
  assert.equal(ventaHoy(2_789_999, [dia]), 1_789_999);
  assert.equal(ventaHoy(2_789_999, []), 2_789_999);
  assert.equal(ventaHoy(null, []), null);
  // «Potencia tus ventas» (SMART) la pone ML: no cuenta como oferta propia.
  assert.equal(ventaHoy(2_789_999, [dia, { id: "P-2", tipo: "SMART", estado: "started", precio: 1_500_000, min: null, max: null }]), 1_789_999);
  const e: EntradaVariacion = {
    variacionId: 1, productoId: 7, lugar, clasica: 2_789_999, stock: 5, comisiones, comisionEstimada: false,
    pubs: [pub({ publicacionId: 1, itemId: "MLA1", plan: "clasica", precioListaMl: 2_789_999, precioVentaMl: ventaHoy(2_789_999, [dia]), campanas: [dia], priceToWin: null, catalogo: false })],
  };
  const [pa] = proponer(e, { tachado: [], planes: [], volumen: [], reglaStock: true }).pubs;
  assert.equal(pa.venta, 1_789_999);
  assert.equal(pa.cambiaPrecio, false);
  assert.deepEqual(pa.salir, []);
  assert.deepEqual(pedidosPrecio(pa), []);
});

test("campaña propia: entra si ninguna de ML acepta el precio; si aparece una de ML, sale de la propia y pasa a la de ML", () => {
  const reglas: ReglasCanal = { tachado: [{ nivel: "producto", producto_id: 7, tachado_pct: 100 }], planes: [], volumen: [], reglaStock: true,
    campanaPropia: { id: "C-PROPIA", nombre: "Promociones Daitom" } };
  const comisiones = { clasica: 16, premium: 30, "3x_campaign": 25, "9x_campaign": 34, "12x_campaign": 38 };
  const base = { variacionId: 1, productoId: 7, lugar: { productoId: 7, familias: [] }, clasica: 50_000, stock: 3, comisiones, comisionEstimada: false };
  // Publicada al tachado (100.000) y sin campañas: entra a la propia a 50.000.
  const [a] = proponer({ ...base, pubs: [pub({ publicacionId: 1, itemId: "MLA1", plan: "clasica", precioListaMl: 100_000, precioVentaMl: 100_000, campanas: [], priceToWin: null, catalogo: false })] }, reglas).pubs;
  assert.deepEqual(a.entrar.map((c) => c.id), ["C-PROPIA"]);
  assert.equal(a.venta, 50_000);
  // Ya en la propia a ese precio: nada.
  const propia = { id: "C-PROPIA", tipo: "SELLER_CAMPAIGN", estado: "started", nombre: "Promociones Daitom", precio: 50_000, min: null, max: null };
  const [b] = proponer({ ...base, pubs: [pub({ publicacionId: 1, itemId: "MLA1", plan: "clasica", precioListaMl: 100_000, precioVentaMl: 50_000, campanas: [propia], priceToWin: null, catalogo: false })] }, reglas).pubs;
  assert.deepEqual([b.entrar.length, b.salir.length], [0, 0]);
  // ML le ofrece una que acepta el precio: sale de la propia y entra a la de ML.
  const deMl = { id: "P-ML", tipo: "DEAL", estado: "candidate", nombre: "Semana", precio: null, min: 40_000, max: 60_000 };
  const [c] = proponer({ ...base, pubs: [pub({ publicacionId: 1, itemId: "MLA1", plan: "clasica", precioListaMl: 100_000, precioVentaMl: 50_000, campanas: [propia, deMl], priceToWin: null, catalogo: false })] }, reglas).pubs;
  assert.deepEqual(c.salir.map((x) => x.id), ["C-PROPIA"]);
  assert.deepEqual(c.entrar.map((x) => x.id), ["P-ML"]);
});

// ── Contra la base ──────────────────────────────────────────

const url = process.env.TEST_DATABASE_URL;
if (url) {
  process.env.DATABASE_URL = url;
  type Mods = {
    db: typeof import("@/db");
    esquema: typeof import("@/lib/erp/esquema");
    precios: typeof import("@/lib/precios");
    datos: typeof import("@/lib/precios-ml/datos");
    preparar: typeof import("@/lib/precios-ml/preparar");
    lectura: typeof import("@/lib/precios-ml/lectura");
  };
  let m: Mods;
  before(async () => {
    m = {
      db: await import("@/db"),
      esquema: await import("@/lib/erp/esquema"),
      precios: await import("@/lib/precios"),
      datos: await import("@/lib/precios-ml/datos"),
      preparar: await import("@/lib/precios-ml/preparar"),
      lectura: await import("@/lib/precios-ml/lectura"),
    };
    await m.esquema.asegurarEsquemaErp();
  });
  after(async () => {
    await m.db.pool.end();
  });
  const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await m.db.pool.query(sql, v)).rows as T[];
  const id = async (sql: string, v: unknown[] = []) => Number((await q<{ id: string }>(sql, v))[0].id);

  async function escenario() {
    const org = `test-${randomUUID()}`;
    await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
    await q("insert into tipo_cambio (organizacion_id, fecha, venta, origen) values ($1, current_date - 1, 1000, 'test'), ($1, current_date, 1200, 'test')", [org]);
    const lista = await id("insert into lista_precios (organizacion_id, nombre) values ($1, 'Clásicas') returning id", [org]);
    const canal = await id(`insert into canal (organizacion_id, nombre, tipo) values ($1, 'ML 1', 'mercadolibre') returning id`, [org]);
    const familia = await id("insert into familia (organizacion_id, nombre) values ($1, 'Cocina') returning id", [org]);
    const producto = async (sku: string, opts: { dolares?: boolean } = {}) => {
      const p = await id("insert into producto (organizacion_id, sku_base, titulo, familia_id, precio_en_dolares) values ($1, $2, $3, $4, $5) returning id",
        [org, sku, `Producto ${sku}`, familia, !!opts.dolares]);
      const v = await id("select id from variacion where producto_id = $1 and es_default", [p]);
      return { p, v };
    };
    const publicar = async (v: number, item: string, tipo: string, tags: string[], precio: number, extra: Record<string, unknown> = {}) => {
      const pub = await id(`insert into publicacion (organizacion_id, variacion_id, canal_id, id_externo, estado, tipo_publicacion, precio_canal, datos_externos)
        values ($1, $2, $3, $4, 'activa', $5, $6, $7::jsonb) returning id`, [org, v, canal, item, tipo, precio, JSON.stringify({ catalogo: true, user_product_id: "MLAU77" })]);
      await q(`insert into meli_item (organizacion_id, canal_id, item_id, variation_id, precio, tipo, publicacion_id, datos_externos)
        values ($1, $2, $3, '', $4, $5, $6, $7::jsonb)`, [org, canal, item, precio, tipo, pub, JSON.stringify({ ml: { tags, catalog_product_id: "MLA555", ...extra } })]);
      return pub;
    };
    return { org, lista, canal, familia, producto, publicar };
  }

  test("precio en dólares: los pesos salen del tipo de cambio de cada día, sin filas nuevas", async () => {
    const e = await escenario();
    const a = await e.producto("USD1", { dolares: true });
    const b = await e.producto("ARS1");
    const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    // Cargado ayer en dólares (100 US$ a 1.000 = $ 100.000 congelados).
    await m.precios.guardarPrecio(e.org, { listaId: e.lista, variacionId: a.v, importe: 100, moneda: "USD", vigenteDesde: ayer });
    await m.precios.guardarPrecio(e.org, { listaId: e.lista, variacionId: b.v, importe: 100, moneda: "USD", vigenteDesde: ayer });
    const hoyA = await m.precios.precioDe(e.org, a.v, e.lista);
    assert.equal(hoyA?.lista.ars, 120_000); // hoy el dólar está a 1.200
    assert.equal(hoyA?.lista.usd, 100);
    assert.equal(hoyA?.monedaOrigen, "USD");
    assert.equal((await m.precios.precioDe(e.org, a.v, e.lista, ayer))?.lista.ars, 100_000);
    // Sin la marca, los pesos quedan congelados al cargar.
    assert.equal((await m.precios.precioDe(e.org, b.v, e.lista))?.lista.ars, 100_000);
    // La variación pisa al producto.
    await q("update variacion set precio_en_dolares = false where id = $1", [a.v]);
    assert.equal((await m.precios.precioDe(e.org, a.v, e.lista))?.lista.ars, 100_000);
    assert.equal((await q<{ n: number }>("select count(*)::int n from precio where variacion_id = $1", [a.v]))[0].n, 1);
  });

  test("preparar cambios: lotes preparados (precios, volumen, nuevas) sin mandar nada; el automático sólo con el interruptor", async () => {
    const e = await escenario();
    const a = await e.producto("A1");
    // La lista tiene el tachado: 13.000 con el 30 % de la categoría → Clásica 10.000.
    await m.precios.guardarPrecio(e.org, { listaId: e.lista, variacionId: a.v, importe: 13_000, moneda: "ARS" });
    await e.publicar(a.v, "MLA100", "gold_special", [], 11_000);
    await e.publicar(a.v, "MLA101", "gold_pro", [], 9_000);
    await m.datos.guardarTachado(e.org, e.canal, { nivel: "general" }, 25);
    await m.datos.guardarTachado(e.org, e.canal, { nivel: "familia", familiaId: e.familia }, 30);
    await m.datos.guardarPlan(e.org, e.canal, "premium", { nivel: "general" }, { activo: true, precioMinimo: null, margenPct: 0 });
    await m.datos.guardarPlan(e.org, e.canal, "12x_campaign", { nivel: "general" }, { activo: true, precioMinimo: 5_000, margenPct: 1 });
    await m.datos.guardarVolumen(e.org, e.canal, { nivel: "general" }, { desde: 0, hasta: null, escalones: [{ cantidad: 2, pct: 5 }], sinDescuento: false });
    await assert.rejects(m.datos.guardarVolumen(e.org, e.canal, { nivel: "general" }, { desde: 5_000, hasta: 8_000, escalones: [{ cantidad: 3, pct: 5 }], sinDescuento: false }), /se pisa/);

    const calc = await m.datos.calcularCanal(e.org, e.canal);
    assert.equal(calc.propuestas.length, 1);
    const p = calc.propuestas[0].propuesta;
    assert.equal(p.clasica, 10_000);
    assert.equal(p.tachado, 13_000); // el de la categoría (30 %) gana al general
    assert.equal(p.pubs.find((x) => x.pub.itemId === "MLA101")?.rol, "plan");
    // Sin stock no hay escalón de 2.
    assert.deepEqual(p.volumen.escalones, []);
    assert.deepEqual(p.faltan.map((f) => f.plan), ["12x_campaign"]);

    const lotes = await m.preparar.prepararCambios(e.org, e.canal, {}, "u1");
    // Las que faltan ya no se crean desde acá (Creaciones en ML).
    assert.deepEqual(lotes.map((l) => l.descripcion.split(" · ")[0]), ["Precios y campañas"]);
    const cola = await q<{ tipo: string; estado: string; item_id: string; payload: { precio?: number; pedidos: { metodo: string; ruta: string; cuerpo: Record<string, unknown> }[] }; lote_id: string }>(
      "select tipo, estado, item_id, payload, lote_id from ml_cola where organizacion_id = $1 order by id", [e.org]);
    assert.ok(cola.every((c) => c.estado === "preparado"), "nada sale sin el clic");
    const clasica = cola.find((c) => c.item_id === "MLA100")!;
    assert.equal(clasica.tipo, "precio");
    assert.equal(clasica.payload.precio, 13_000);
    assert.deepEqual(clasica.payload.pedidos[0], { metodo: "PUT", ruta: "/items/MLA100", cuerpo: { price: 13_000 } });
    assert.ok(!cola.some((c) => c.tipo === "crear"));
    assert.equal((await q("select 1 from ml_lote where organizacion_id = $1 and estado = 'preparado'", [e.org])).length, 1);

    // Con stock aparece el lote de volumen.
    const dep = await id("insert into deposito (organizacion_id, nombre) values ($1, 'Propio') returning id", [e.org]);
    await q("insert into canal_deposito (organizacion_id, canal_id, deposito_id) values ($1, $2, $3)", [e.org, e.canal, dep]);
    const ub = await id("select id from ubicacion where deposito_id = $1 and es_default", [dep]);
    const stock = await import("@/lib/stock");
    await stock.moverStock(e.org, { variacionId: a.v, tipo: "ingreso", cantidad: 10, destinoId: ub });
    const lotes2 = await m.preparar.prepararCambios(e.org, e.canal, {}, "u1", { volumen: true, precios: false, crear: false });
    assert.equal(lotes2.length, 1);
    const vol = await q<{ payload: { pedidos: { ruta: string; cuerpo: unknown }[] } }>("select payload from ml_cola where lote_id = $1", [lotes2[0].id]);
    assert.equal(vol.length, 2); // las dos publicaciones
    assert.deepEqual(vol[0].payload.pedidos[0].cuerpo, { prices: [{ amount: 9_500, currency_id: "ARS", conditions: { min_purchase_unit: 2 } }] });

    // El automático: apagado no encola nada; prendido encola 'pendiente' (sin publicaciones nuevas).
    await q("insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, access_token, refresh_token, expira_el) values ($1, $2, $3, 'x', 'x', now() + interval '1 day')",
      [e.org, e.canal, Math.floor(Math.random() * 1e9)]);
    assert.deepEqual(await m.preparar.sincronizarPreciosMl(e.org), { canales: 0, revisadas: 0, encoladas: 0 });
    await m.datos.fijarInterruptor(e.org, e.canal, "sincronizar_precios", true);
    const auto = await m.preparar.sincronizarPreciosMl(e.org);
    assert.equal(auto.canales, 1);
    const pend = await q<{ tipo: string; origen: string }>("select tipo, origen from ml_cola where organizacion_id = $1 and estado = 'pendiente'", [e.org]);
    assert.ok(pend.length > 0 && pend.every((x) => x.origen === "automatico" && x.tipo !== "crear"));
  });

  test("lectura: precio para ganar y campañas con un ML de mentira; el destacado que deja de ganar queda con alerta", async () => {
    const e = await escenario();
    const a = await e.producto("B1");
    await m.precios.guardarPrecio(e.org, { listaId: e.lista, variacionId: a.v, importe: 10_000, moneda: "ARS" });
    await e.publicar(a.v, "MLA200", "gold_special", [], 10_000);
    await e.publicar(a.v, "MLA201", "gold_pro", [], 11_000);
    await q("insert into meli_cuenta (organizacion_id, canal_id, meli_user_id, access_token, refresh_token, expira_el) values ($1, $2, $3, 'x', 'x', now() + interval '1 day')",
      [e.org, e.canal, Math.floor(Math.random() * 1e9)]);
    await m.datos.guardarPlan(e.org, e.canal, "premium", { nivel: "general" }, { activo: true, precioMinimo: null, margenPct: 0 });
    let estado = "winning";
    const rutas: string[] = [];
    const leer = async (_c: unknown, ruta: string) => {
      rutas.push(ruta);
      if (ruta.includes("price_to_win")) return { status: 200, datos: { price_to_win: ruta.includes("MLA201") ? 10_800 : 9_900, current_price: 11_000, status: estado } };
      return { status: 200, datos: [{ id: "C1", type: "SELLER_CAMPAIGN", status: "candidate", min_discounted_price: 5_000, max_discounted_price: 12_000, name: "Octubre" }] };
    };
    const r = await m.lectura.leerPreciosMl(Date.now() + 20_000, { leer, org: e.org, ritmoMs: 0 });
    assert.equal(r.ptw, 2);
    assert.equal(r.promos, 2);
    assert.ok(rutas.every((x) => !x.startsWith("PUT") && !x.startsWith("POST")));
    // Con eso, el 6 cuotas es destacado (10.800 cierra) y la Clásica entra a la campaña.
    await m.preparar.prepararCambios(e.org, e.canal, {}, "u1", { precios: true, volumen: false, crear: false });
    const d = await q<{ item_id: string; plan: string }>("select item_id, plan from ml_plan_destacado where canal_id = $1", [e.canal]);
    assert.deepEqual(d, [{ item_id: "MLA201", plan: "premium" }]);
    // Deja de ganar: alerta.
    estado = "competing";
    await q("update ml_price_to_win set leido_ts = now() - interval '7 hours' where canal_id = $1", [e.canal]);
    const r2 = await m.lectura.leerPreciosMl(Date.now() + 20_000, { leer, org: e.org, ritmoMs: 0 });
    assert.equal(r2.alertas, 1);
    const al = await q<{ alerta: string }>("select alerta from ml_plan_destacado where canal_id = $1", [e.canal]);
    assert.match(al[0].alerta, /Dejó de ganar/);
  });
}

test("volumen: cada escalón lleva el contexto de ML y la tabla nombra los precios base (si no, ML los borra)", () => {
  const nuevo = { amount: 950, currency_id: "ARS", conditions: { context_restrictions: ["channel_marketplace"], min_purchase_unit: 2 } };
  const actuales = [
    { id: "1", type: "standard", conditions: {} },
    { id: "7", type: "standard", conditions: { min_purchase_unit: 3 } },
    { id: "9", type: "promotion", conditions: {} },
  ];
  assert.deepEqual(tablaVolumen(actuales, [nuevo]), [{ id: "1" }, nuevo]);
});

test("campañas debajo del piso: la propia por su precio, la de ML por lo que pone el vendedor", () => {
  assert.equal(descuentoComprador(81.81818), 45);
  const propia = { id: "D1", tipo: "DEAL", estado: "started", precio: 900, min: null, max: null };
  const smart = { id: "S1", tipo: "SMART", estado: "started", precio: 850, min: null, max: null, original: 1000, pctVendedor: 5 };
  const candidata = { id: "D2", tipo: "DEAL", estado: "candidate", precio: 500, min: null, max: null };
  assert.equal(precioVendedorCampana(smart), 950);
  const pa = { piso: 1000, pub: { campanas: [propia, smart, candidata] } } as unknown as PropuestaPub;
  assert.deepEqual(campanasBajoPiso(pa).map((x) => [x.campana.id, x.precio]), [["D1", 900], ["S1", 950]]);
  assert.deepEqual(campanasBajoPiso({ ...pa, piso: 900 } as PropuestaPub).map((x) => x.campana.id), []);
});

test("descuento que ve el comprador ↔ tachado %: 45 % = 81,81818 % (lo que decide Fer es el descuento)", () => {
  assert.equal(tachadoDeDescuento(45), 81.81818);
  assert.equal(descuentoComprador(tachadoDeDescuento(45)), 45);
  assert.equal(tachadoDeDescuento(0), 0);
  for (const d of [5, 10, 17, 30, 50]) assert.equal(descuentoComprador(tachadoDeDescuento(d)), d);
});
