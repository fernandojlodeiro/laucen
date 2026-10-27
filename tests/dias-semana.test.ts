// Días de la semana de las reglas comerciales y los banners (lib/dias-semana.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { diaSemanaAR, fechaAR, normalizarDias, valeElDia, textoDias } from "@/lib/dias-semana";
import { bannerVale } from "@/lib/tienda/banners";

test("diaSemanaAR y fechaAR: en hora argentina (el martes 27/10 a las 23:30 de acá ya es miércoles en UTC)", () => {
  const martesNoche = new Date("2026-10-28T02:30:00Z");
  assert.equal(diaSemanaAR(martesNoche), 2);
  assert.equal(fechaAR(martesNoche), "2026-10-27");
  assert.equal(diaSemanaAR(new Date("2026-10-28T12:00:00Z")), 3, "miércoles");
  assert.equal(diaSemanaAR(new Date("2026-11-01T12:00:00Z")), 7, "domingo");
});

test("normalizarDias: sin repetir y en orden; ninguno o los siete = todos (null)", () => {
  assert.deepEqual(normalizarDias(["6", "3", "3"]), [3, 6]);
  assert.equal(normalizarDias([]), null);
  assert.equal(normalizarDias([1, 2, 3, 4, 5, 6, 7]), null);
  assert.deepEqual(normalizarDias(["0", "8", "x", "1"]), [1]);
});

test("valeElDia: miércoles y sábados", () => {
  assert.equal(valeElDia([3, 6], new Date("2026-10-28T12:00:00Z")), true);
  assert.equal(valeElDia([3, 6], new Date("2026-10-29T12:00:00Z")), false);
  assert.equal(valeElDia(null, new Date("2026-10-29T12:00:00Z")), true);
});

test("textoDias: en criollo", () => {
  assert.equal(textoDias([3, 6]), "Miércoles y sábados");
  assert.equal(textoDias([1, 2, 3, 4, 5]), "Lunes a viernes");
  assert.equal(textoDias([2]), "Martes");
  assert.equal(textoDias(null), "Todos los días");
  assert.equal(textoDias([1, 3, 5]), "Lunes, miércoles y viernes");
});

test("bannerVale: días y desde / hasta", () => {
  const mie = new Date("2026-10-28T12:00:00Z");
  assert.equal(bannerVale({ dias: [3, 6], desde: "2026-10-28", hasta: "2026-12-28" }, mie), true);
  assert.equal(bannerVale({ dias: [3, 6], desde: "2026-10-29", hasta: null }, mie), false, "todavía no");
  assert.equal(bannerVale({ dias: [3, 6], desde: null, hasta: "2026-10-27" }, mie), false, "vencido");
  assert.equal(bannerVale({ dias: [6], desde: null, hasta: null }, mie), false, "no es sábado");
  assert.equal(bannerVale({ dias: null, desde: null, hasta: null }, mie), true);
});

test("financiacionHoy (Fer, 27/10): sin fechas no vence; fuera de fecha, el plan no se ofrece y el descuento contado no se aplica", async () => {
  const { financiacionDe, financiacionHoy } = await import("@/lib/tienda/financiacion");
  const f = financiacionDe({
    activo: true, descuento_pct: 10, medios_descuento: ["transferencia"], descuento_hasta: "2026-11-30",
    planes: [
      { cuotas: 3, medio: "payway", vigente_desde: "2026-10-22", vigente_hasta: "2026-11-30" },
      { cuotas: 6, medio: "payway", vigente_hasta: "2026-11-30" },
      { cuotas: 12, medio: "mercadopago" },
    ],
  });
  const nov = financiacionHoy(f, new Date("2026-11-30T23:00:00Z")); // 30/11 a las 20 h de acá
  assert.deepEqual(nov.planes.map((p) => p.cuotas), [3, 6, 12]);
  assert.equal(nov.descuento_pct, 10);
  const dic = financiacionHoy(f, new Date("2026-12-01T03:30:00Z")); // 1/12 a las 0:30 de acá
  assert.deepEqual(dic.planes.map((p) => p.cuotas), [12], "Mercado Pago, sin fechas, sigue");
  assert.equal(dic.descuento_pct, 0);
  assert.deepEqual(financiacionHoy(f, new Date("2026-10-21T15:00:00Z")).planes.map((p) => p.cuotas), [6, 12], "el de 3 todavía no empezó");
});
