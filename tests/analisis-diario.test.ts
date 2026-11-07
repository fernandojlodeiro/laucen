// Tests del análisis diario (lib/analisis-diario/calcular.ts): lo puro, sin base ni red. Cómo se clasifica cada
// publicación contra el esquema, la mejor campaña a la que puede entrar, cuándo entra una oferta relámpago y la lista
// de lo urgente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { bajaPct, evaluarOferta, pagaHoy, recibeEnCampana, resumenOfertas, mejorCandidata, nombreOrigen, revisarPublicacion, sumarDias, urgentesDe, type Analisis } from "@/lib/analisis-diario/calcular";
import type { Campana, PropuestaPub, PubMl } from "@/lib/precios-ml/motor";

const pub = (campanas: Campana[], extra: Partial<PubMl> = {}): PubMl => ({
  publicacionId: 1, itemId: "MLA1", variationId: null, plan: "clasica", estado: "activa", precioListaMl: 1_100_000, precioVentaMl: 1_100_000,
  priceToWin: null, estadoPtw: null, campanas, volumenMl: null, userProductId: null, catalogProductId: null, catalogo: false, ...extra,
});
const propuesta = (p: PubMl, extra: Partial<PropuestaPub> = {}): PropuestaPub => ({
  pub: p, rol: "clasica", lista: 1_100_000, venta: 1_000_000, piso: 1_000_000, entrar: [], salir: [], volumen: [], cambiaPrecio: false, cambiaVolumen: false, avisos: [], ...extra,
});
const deal = (x: Partial<Campana>): Campana => ({ id: "P-1", tipo: "DEAL", estado: "candidate", nombre: "Cyber", precio: null, min: null, max: null, ...x });

test("bajaPct y sumarDias", () => {
  assert.equal(bajaPct(970_000, 1_000_000), 3);
  assert.equal(bajaPct(1_000_000, 1_000_000), 0);
  assert.equal(sumarDias("2026-11-07", -7), "2026-10-31");
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
});

test("mejorCandidata: la que deja el precio más alto, sin pasar el del esquema ni bajar del mínimo", () => {
  const cs = [deal({ id: "A", max: 950_000 }), deal({ id: "B", max: 970_000.6 }), deal({ id: "C", max: 1_200_000 }), deal({ id: "D", max: 990_000, min: 995_000 }),
    deal({ id: "E", max: 999_000, estado: "started" }), deal({ id: "F", tipo: "SMART", max: 999_000 })];
  const m = mejorCandidata(cs, 1_000_000)!;
  assert.equal(m.campana.id, "C");
  assert.equal(m.precio, 1_000_000);
  assert.equal(m.bajaPct, 0);
  const sinC = mejorCandidata(cs.filter((c) => c.id !== "C"), 1_000_000)!;
  assert.equal(sinC.campana.id, "B");
  assert.equal(sinC.precio, 970_000);
  assert.equal(mejorCandidata([], 1_000_000), null);
});

test("revisarPublicacion: en campaña al precio del esquema → nada", () => {
  const p = pub([deal({ estado: "started", precio: 1_000_000 })], { precioVentaMl: 1_000_000 });
  assert.equal(revisarPublicacion(propuesta(p), 3, { sinLeer: false, error: null }), null);
});

test("revisarPublicacion: sin tachado no necesita campaña; pausada no se mira", () => {
  const p = pub([], { precioListaMl: 1_000_000 });
  assert.equal(revisarPublicacion(propuesta(p, { lista: 1_000_000 }), 3, { sinLeer: false, error: null }), null);
  assert.equal(revisarPublicacion(propuesta(pub([], { estado: "pausada" })), 3, { sinLeer: false, error: null }), null);
});

test("revisarPublicacion: al tachado sin campaña y una oferta que baja 3 % → puede entrar; 5 % → sin campaña", () => {
  const p3 = pub([deal({ max: 970_000 })]);
  const r = revisarPublicacion(propuesta(p3), 3, { sinLeer: false, error: null })!;
  assert.equal(r.estado, "oportunidad");
  assert.equal(r.campana?.precio, 970_000);
  assert.equal(r.campana?.bajaPct, 3);
  const p5 = pub([deal({ max: 950_000 })]);
  const r5 = revisarPublicacion(propuesta(p5), 3, { sinLeer: false, error: "ERROR_X" })!;
  assert.equal(r5.estado, "sin_campana");
  assert.match(r5.detalle, /5 %/);
  assert.match(r5.detalle, /ERROR_X/);
});

test("revisarPublicacion: el esquema ya tiene la campaña a la que entra → en camino (salvo que ML la rechazó)", () => {
  const c = deal({ id: "P-9", max: 1_050_000 });
  const p = pub([deal({ max: 900_000 }), c]);
  // La candidata que acepta el precio del esquema es una oportunidad (entra sin bajar nada).
  assert.equal(revisarPublicacion(propuesta(p, { entrar: [c] }), 3, { sinLeer: false, error: null })!.estado, "oportunidad");
  // Sin candidatas de ML pero con la campaña propia en el esquema: en camino.
  const propia: Campana = { id: "S-1", tipo: "SELLER_CAMPAIGN", estado: null, nombre: "Promociones", precio: null, min: null, max: null };
  const sinMl = pub([deal({ max: 900_000 })]);
  assert.equal(revisarPublicacion(propuesta(sinMl, { entrar: [propia] }), 3, { sinLeer: false, error: null })!.estado, "en_camino");
  assert.equal(revisarPublicacion(propuesta(sinMl, { entrar: [propia] }), 3, { sinLeer: false, error: "rechazada" })!.estado, "sin_campana");
});

test("revisarPublicacion: en una campaña bastante debajo del esquema → muy abajo; dentro del tope, nada", () => {
  const abajo = pub([deal({ estado: "started", precio: 940_000 })], { precioVentaMl: 940_000 });
  assert.equal(revisarPublicacion(propuesta(abajo), 3, { sinLeer: false, error: null })!.estado, "bajo_piso");
  const tope = pub([deal({ estado: "started", precio: 970_000 })], { precioVentaMl: 970_000 });
  assert.equal(revisarPublicacion(propuesta(tope), 3, { sinLeer: false, error: null }), null);
});

test("revisarPublicacion: en campaña con un cambio de precio pendiente → cambio sin salir (salvo mandado sin confirmar)", () => {
  const p = pub([deal({ estado: "started", precio: 1_000_000 })], { precioVentaMl: 1_000_000, precioListaMl: 1_050_000 });
  const pa = propuesta(p, { cambiaPrecio: true });
  assert.equal(revisarPublicacion(pa, 3, { sinLeer: false, error: null })!.estado, "pendiente");
  assert.equal(revisarPublicacion(pa, 3, { sinLeer: true, error: null }), null);
});

test("evaluarOferta: baja, piso, stock", () => {
  const base = { estado: "candidate", rel: 970_000, bajaPct: 3, alcanza: true, stock: 10, stock_min: 5, base: 1_000_000 };
  assert.deepEqual(evaluarOferta(base, 3), { entra: true, motivo: null });
  assert.equal(evaluarOferta({ ...base, bajaPct: 5.5 }, 3).entra, false);
  assert.equal(evaluarOferta({ ...base, alcanza: false }, 3).entra, false);
  assert.equal(evaluarOferta({ ...base, alcanza: null }, 3).entra, true);
  assert.equal(evaluarOferta({ ...base, stock: 3 }, 3).entra, false);
  assert.equal(evaluarOferta({ ...base, estado: "started" }, 3).entra, false);
  assert.equal(evaluarOferta({ ...base, rel: null }, 3).entra, false);
});

test("nombreOrigen", () => {
  assert.equal(nombreOrigen("anuncio", "google"), "Anuncio de Google");
  assert.equal(nombreOrigen("organico", null), "Buscador (sin anuncio)");
  assert.equal(nombreOrigen(null, null), "Sin dato");
});

test("urgentesDe: cuenta cada cosa y las fuentes viejas", () => {
  const fila = (estado: string) => ({ estado }) as Analisis["campanas"]["filas"][number];
  const a = {
    config: { familias: [], maxBajaPct: 3 },
    campanas: { publicaciones: 10, enCampana: 5, sinNecesidad: 1, filas: [fila("oportunidad"), fila("oportunidad"), fila("sin_campana"), fila("en_camino")] },
    ofertas: [{ entra: true }, { entra: false }] as Analisis["ofertas"],
    publicidad: { mlAds: [{ veredicto: "cortar" }, { veredicto: "subir" }], fuentes: [{ nombre: "Meta", vieja: true, estado: "rechazo" }, { nombre: "Google", vieja: false }] } as unknown as Analisis["publicidad"],
  } as unknown as Omit<Analisis, "urgentes">;
  const u = urgentesDe(a);
  assert.equal(u.length, 5);
  assert.match(u[0], /^1 oferta/);
  assert.match(u[1], /^2 publicaciones sin campaña/);
  assert.match(u[2], /^1 publicación está al tachado/);
  assert.match(u[3], /1 producto para CORTAR/);
  assert.match(u[4], /Meta.*volver a conectar/);
});

test("compartida («Potencia tus ventas»): se mide lo que paga el comprador más lo que pone ML", () => {
  // Como MLA1706473885 el 7/11: el comprador paga 920.762,80, ML pone 2,9 % de 1.725.891 (50.051): quedan 970.814.
  const c: Campana = { id: "P-MLA18167004", tipo: "SMART", estado: "started", nombre: "Potencia tus ventas", precio: 920_762.8, min: null, max: null,
    original: 1_725_891, pctVendedor: 43.7, pctMeli: 2.9 };
  const r = recibeEnCampana(c)!;
  assert.equal(r.aporteMl, 50_051);
  assert.equal(Math.round(r.queda), 970_814);
  const p = pub([c], { precioListaMl: 1_049_000, precioVentaMl: 1_049_000 });
  assert.equal(pagaHoy(p), 920_762.8);
  const v = revisarPublicacion(propuesta(p, { lista: 1_049_000, venta: 1_049_000, piso: 1_049_000 }), 3, { sinLeer: false, error: null })!;
  assert.equal(v.estado, "bajo_piso");
  assert.equal(v.campana?.bajaPct, 7.5);
  // Una oferta del vendedor (DEAL) no lleva aporte de ML.
  assert.equal(recibeEnCampana({ ...c, tipo: "DEAL" })!.aporteMl, 0);
});

test("resumenOfertas: relámpago y compartidas por separado, una línea por producto", () => {
  const o = (x: Partial<Analisis["ofertas"][number]>) => ({ productoId: 1, sku: "ET5", titulo: "", tipo: "LIGHTNING", estado: "candidate", entra: false, bajaPct: 5.5, precio: 472_499, base: 499_999, ...x }) as Analisis["ofertas"][number];
  const ofertas = [o({}), o({ bajaPct: 7 }), o({ estado: "pending" }), o({ productoId: 2, sku: "A8", tipo: "SMART", entra: true, bajaPct: 2 })];
  const rel = resumenOfertas(ofertas, true);
  assert.equal(rel.length, 1);
  assert.deepEqual([rel[0].propuestas, rel[0].entran, rel[0].mejorBaja, rel[0].aceptadas], [2, 0, 5.5, 1]);
  const comp = resumenOfertas(ofertas, false);
  assert.deepEqual([comp[0].sku, comp[0].entran], ["A8", 1]);
});
