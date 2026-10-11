// Copiar entre cuentas de ML: lo puro (título, fotos, SKU, cuerpo del alta). Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { aceptable, armarCuerpoCopia, atributosFaltantes, atributosInvalidos, atributosNoModificables, claveProducto, motivoNoCopiable, motivoValidacion, rotarFotos, variarTitulo, type ItemGuardado } from "@/lib/mercadolibre/copiar";

// Un item de verdad (BAIRES, 5/10), recortado.
const ITEM: ItemGuardado = {
  id: "MLA668323386", status: "active", title: "Transistor Stf 20nf20 F20nf20 Mosfet N-ch 200v 18a-220fp",
  family_name: "Transistor Stf 20nf20 F20nf20 Mosfet N-ch 200v 18a-220fp", category_id: "MLA380650", price: 2551, currency_id: "ARS",
  available_quantity: 1, buying_mode: "buy_it_now", condition: "new", listing_type_id: "gold_special", channels: ["marketplace"],
  pictures: [{ secure_url: "https://http2.mlstatic.com/a.webp" }, { secure_url: "https://http2.mlstatic.com/b.webp" }],
  attributes: [
    { id: "BRAND", value_id: "54059554", value_name: "Daitom" }, { id: "GTIN", value_id: "-1", value_name: null },
    { id: "SELLER_SKU", value_name: "SKU00040" }, { id: "MAX_SUPPORTED_CURRENT", value_id: null, value_name: "18 A" }, { id: "VACIO", value_id: null, value_name: null },
  ],
  sale_terms: [], shipping: { mode: "me2", local_pick_up: false, free_shipping: false }, catalog_listing: false,
};

test("variarTitulo: la primera palabra queda y la segunda mitad del resto pasa adelante; mismas palabras", () => {
  const v = variarTitulo(ITEM.title!);
  assert.equal(v, "Transistor N-ch 200v 18a-220fp Stf 20nf20 F20nf20 Mosfet");
  assert.deepEqual(v.split(" ").sort(), ITEM.title!.split(" ").sort());
  assert.equal(variarTitulo("Cable USB"), "Cable USB");
});

test("rotarFotos: la primera pasa al final", () => {
  assert.deepEqual(rotarFotos(["a", "b", "c"]), ["b", "c", "a"]);
  assert.deepEqual(rotarFotos(["a"]), ["a"]);
});

test("claveProducto: el SKU sin DE- manda; sin SKU, el título sin tildes ni signos", () => {
  assert.equal(claveProducto("DE-SKU1", "x"), claveProducto("sku1", "y"));
  assert.equal(claveProducto(null, "Cable  Ñandú, USB"), claveProducto("", "cable nandu usb"));
});

test("motivoNoCopiable: sólo activas, sin catálogo ni variaciones", () => {
  assert.equal(motivoNoCopiable(ITEM), null);
  assert.match(motivoNoCopiable({ ...ITEM, status: "paused" })!, /activa/);
  assert.match(motivoNoCopiable({ ...ITEM, catalog_listing: true })!, /catálogo/);
  assert.match(motivoNoCopiable({ ...ITEM, variations: [{}] })!, /variaciones/);
});

test("armarCuerpoCopia: family_name (no title), sin lo propio de la cuenta, SKU de destino y fotos rotadas", () => {
  const c = armarCuerpoCopia(ITEM, "DE-SKU00040", { variarTitulo: true, rotarFotos: true }) as Record<string, unknown> & { attributes: { id: string; value_name?: string }[]; pictures: { source: string }[] };
  assert.equal(c.family_name, "Transistor N-ch 200v 18a-220fp Stf 20nf20 F20nf20 Mosfet");
  assert.equal("title" in c, false);
  assert.deepEqual(c.pictures.map((p) => p.source), ["https://http2.mlstatic.com/b.webp", "https://http2.mlstatic.com/a.webp"]);
  assert.deepEqual(c.attributes.filter((a) => a.id === "SELLER_SKU"), [{ id: "SELLER_SKU", value_name: "DE-SKU00040" }]);
  assert.equal(c.attributes.some((a) => a.id === "GTIN" || a.id === "VACIO"), false);
  for (const k of ["official_store_id", "catalog_product_id", "catalog_listing", "user_product_id", "id", "seller_custom_field"]) assert.equal(k in c, false);
  assert.deepEqual(c.shipping, { mode: "me2" });
  assert.equal(c.price, 2551);
});

test("armarCuerpoCopia: sin opciones, el título y las fotos quedan como están; sin family_name usa title", () => {
  const c = armarCuerpoCopia({ ...ITEM, family_name: null }, null, { variarTitulo: false, rotarFotos: false }) as { title: string; pictures: { source: string }[]; attributes: { id: string }[] };
  assert.equal(c.title, ITEM.title);
  assert.equal(c.pictures[0].source, "https://http2.mlstatic.com/a.webp");
  assert.equal(c.attributes.some((a) => a.id === "SELLER_SKU"), false);
});

test("armarCuerpoCopia: no manda los atributos que ML fija (PACKAGE_*, IS_TOM_BRAND) y el envío es siempre me2", () => {
  const item: ItemGuardado = { ...ITEM, shipping: { mode: "me1", free_shipping: true }, attributes: [
    ...ITEM.attributes!, { id: "PACKAGE_HEIGHT", value_name: "2 cm" }, { id: "IS_TOM_BRAND", value_id: "242084", value_name: "No" }, { id: "SELLER_PACKAGE_HEIGHT", value_name: "12 cm" }] };
  const c = armarCuerpoCopia(item, null, { variarTitulo: false, rotarFotos: false }) as { attributes: { id: string }[]; shipping: { mode: string; free_shipping: boolean } };
  const ids = c.attributes.map((a) => a.id);
  assert.equal(ids.includes("PACKAGE_HEIGHT") || ids.includes("IS_TOM_BRAND"), false);
  assert.equal(ids.includes("SELLER_PACKAGE_HEIGHT"), true);
  assert.deepEqual(c.shipping, { mode: "me2" }); // el envío gratis lo decide ML para esa cuenta
});

test("armarCuerpoCopia: si la publicación no tiene Modelo, usa el del producto de Laucen; si ya lo tiene, no lo pisa", () => {
  const sin = armarCuerpoCopia(ITEM, null, { variarTitulo: false, rotarFotos: false }, { modelo: "ABC-1" }) as { attributes: { id: string; value_name?: string }[] };
  assert.deepEqual(sin.attributes.filter((a) => a.id === "MODEL"), [{ id: "MODEL", value_name: "ABC-1" }]);
  const con = armarCuerpoCopia({ ...ITEM, attributes: [...ITEM.attributes!, { id: "MODEL", value_name: "X9" }] }, null, { variarTitulo: false, rotarFotos: false }, { modelo: "ABC-1" }) as { attributes: { id: string; value_name?: string }[] };
  assert.deepEqual(con.attributes.filter((a) => a.id === "MODEL").map((a) => a.value_name), ["X9"]);
});

test("respuesta de validate de ML: los avisos de no modificables se sacan y el motivo muestra cada causa con su tipo, los errores primero", () => {
  const datos = { message: "Validation error", cause: [
    { type: "warning", message: "Attribute [IS_TOM_BRAND] ignored because it is not modifiable." },
    { type: "warning", message: "Attribute [PACKAGE_HEIGHT] ignored because it is not modifiable." },
    { type: "error", message: 'El campo "Modelo" es obligatorio y no está cargado.' },
    { type: "error", message: 'El campo "Modelo" es obligatorio y no está cargado.' },
  ] };
  assert.deepEqual(atributosNoModificables(datos), ["IS_TOM_BRAND", "PACKAGE_HEIGHT"]);
  // Primero los errores, después los avisos; sin repetir, con su tipo.
  assert.equal(motivoValidacion(400, datos), 'error: El campo "Modelo" es obligatorio y no está cargado. · aviso: Attribute [IS_TOM_BRAND] ignored because it is not modifiable. · aviso: Attribute [PACKAGE_HEIGHT] ignored because it is not modifiable.');
});

test("armarCuerpoCopia: con sinEnvio no manda el bloque de envío", () => {
  const c = armarCuerpoCopia(ITEM, null, { variarTitulo: false, rotarFotos: false }, { sinEnvio: true });
  assert.equal("shipping" in c, false);
});

test("armarCuerpoCopia: el SKU va tal cual, sin prefijo", () => {
  const c = armarCuerpoCopia(ITEM, "SKU00040", { variarTitulo: false, rotarFotos: false }) as { attributes: { id: string; value_name?: string }[] };
  assert.deepEqual(c.attributes.filter((a) => a.id === "SELLER_SKU"), [{ id: "SELLER_SKU", value_name: "SKU00040" }]);
});

test("aceptable: 2xx, o 400 con sólo avisos; con un error, o sin causas, no", () => {
  const aviso = { type: "warning", code: "shipping.lost_me1_by_user", message: "User has not mode me1" };
  assert.equal(aceptable({ status: 204, datos: null }), true);
  assert.equal(aceptable({ status: 400, datos: { cause: [aviso, { ...aviso, code: "item.shipping.mandatory_free_shipping" }] } }), true);
  assert.equal(aceptable({ status: 400, datos: { cause: [aviso, { type: "error", message: "falta Modelo" }] } }), false);
  assert.equal(aceptable({ status: 400, datos: { message: "x" } }), false);
  assert.equal(aceptable({ status: 401, datos: { cause: [aviso] } }), false);
});

test("atributosInvalidos: el atributo con un valor que ML no acepta en la cuenta (los avisos no cuentan)", () => {
  const datos = { cause: [
    { type: "error", code: "invalid.item.attribute.values", message: "Attribute [PRODUCT_TYPE] is not valid, item values [(null:Notebook)]" },
    { type: "warning", message: "Attribute [COLOR] is not valid, item values [(x)]" },
  ] };
  assert.deepEqual(atributosInvalidos(datos), ["PRODUCT_TYPE"]);
});

test("número de pieza obligatorio: se detecta y se completa con el Modelo (10/10)", () => {
  const datos = { cause: [{ type: "error", code: "item.attributes.missing_required", message: "The attributes [DEVICE_PART_NUMBER] are required for category MLA380668 and channel marketplace." }] };
  assert.deepEqual(atributosFaltantes(datos), ["DEVICE_PART_NUMBER"]);
  const it = { title: "Ic Tda9570h", category_id: "MLA380668", price: 1, attributes: [{ id: "MODEL", value_name: "Tda9570h" }] } as unknown as ItemGuardado;
  const cuerpo = armarCuerpoCopia(it, "SKU02343", { variarTitulo: false, rotarFotos: false }, { completar: ["DEVICE_PART_NUMBER"] }) as { attributes: { id: string; value_name?: string }[] };
  assert.equal(cuerpo.attributes.find((a) => a.id === "DEVICE_PART_NUMBER")?.value_name, "Tda9570h");
});

test("armarCuerpoCopia: completa el motivo sin código de barras y la cantidad de envases cuando ML los pide", () => {
  const c = armarCuerpoCopia(ITEM, null, { variarTitulo: false, rotarFotos: false }, { completar: ["EMPTY_GTIN_REASON", "UNITS_PER_PACK"] }) as { attributes: { id: string; value_id?: string; value_name?: string }[] };
  assert.equal(c.attributes.find((a) => a.id === "EMPTY_GTIN_REASON")?.value_id, "17055160");
  assert.equal(c.attributes.find((a) => a.id === "UNITS_PER_PACK")?.value_name, "1");
  const conGtin = armarCuerpoCopia({ ...ITEM, attributes: [...ITEM.attributes!, { id: "GTIN", value_name: "7790000000000" }] }, null, { variarTitulo: false, rotarFotos: false }, { completar: ["EMPTY_GTIN_REASON"] }) as { attributes: { id: string }[] };
  assert.ok(!conGtin.attributes.some((a) => a.id === "EMPTY_GTIN_REASON"));
});

test("cantidadDelPack y modeloDelTitulo: del título de un componente", async () => {
  const { cantidadDelPack, modeloDelTitulo } = await import("@/lib/mercadolibre/copiar");
  assert.equal(cantidadDelPack("Pack X 5 Mmbt2907a Kst2907a 2907a"), 5);
  assert.equal(cantidadDelPack("Pack X10 Unidades Termistor Ntc 100k"), 10);
  assert.equal(cantidadDelPack("Resistencia Metal Film 220 Ohm 1/4w X 10 Unidades"), 10);
  assert.equal(cantidadDelPack("Transistor Bc327 Pnp 50v"), null);
  assert.equal(modeloDelTitulo("Interruptor Magnetico Rutenio Mka10110 Reed Switch Na"), "MKA10110");
  assert.equal(modeloDelTitulo("Transistor Irf7316trpbf F7316 Irf7316 Sop-8 Nuevos"), "IRF7316TRPBF");
  assert.equal(modeloDelTitulo("Capacitor 1000uf 10v Grado Acustico"), "1000UF 10V");
  assert.equal(modeloDelTitulo("Par Inyector Y Eyector Poe Splitter"), "Inyector Y Eyector");
});
