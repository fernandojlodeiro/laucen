// Tests de los destinatarios de las transferencias del espacio personal (lib/personal/destinatarios.ts y
// lib/mercadopago/gastos.ts): el mail se empareja con su movimiento por importe y hora, la cuenta destino sale del
// mail o del usuario de Mercado Pago, un retiro de la cuenta personal es una transferencia (gasto) salvo a un titular
// propio, y el proveedor asignado a la cuenta clasifica todo lo que va a ella.

import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarGastos, esTitularPropio, type MovGasto } from "@/lib/mercadopago/gastos";
import { emparejarAvisos, cuentaDestino, agruparDestinatarios, textoCuenta, type Aviso } from "@/lib/personal/destinatarios";

const mov = (x: Partial<MovGasto>): MovGasto => ({
  conexion_id: 1, cuenta: "PERSONAL", cuenta_mp_id: 100, clave: Math.random().toString(), movimiento_id: "1", tipo_original: "PAYOUTS",
  fecha: new Date("2025-10-01T20:12:11Z"), importe_neto: -100000, descripcion: null, medio_pago: null,
  api_tipo: null, api_descripcion: null, cobrador_id: null, pagador_id: null, tipo_medio: null, ...x,
});
const aviso = (x: Partial<Aviso>): Aviso => ({ id: 1, fecha: new Date("2025-10-01T20:12:15Z"), importe: 100000, nombre: "Salazar German Dario", entidad: "Banco de la Nacion Argentina", cuenta: "0110213230021318138015", ...x });

test("el mail se empareja con su movimiento: mismo importe, la hora más cercana, cada uno una sola vez", () => {
  const a = mov({ clave: "a" }), b = mov({ clave: "b", fecha: new Date("2025-10-01T20:13:00Z") }), c = mov({ clave: "c", importe_neto: -28000 });
  const lejos = mov({ clave: "lejos", fecha: new Date("2025-10-02T20:12:11Z") });
  const p = emparejarAvisos([a, b, c, lejos], [aviso({ id: 1 }), aviso({ id: 2, fecha: new Date("2025-10-01T20:13:03Z"), cuenta: null, entidad: "Mercado Pago", nombre: "Maria Astrada" })]);
  assert.equal(p.get("a")?.id, 1);
  assert.equal(p.get("b")?.id, 2);
  assert.equal(p.has("c"), false, "otro importe");
  assert.equal(p.has("lejos"), false, "fuera de la ventana");
});

test("cuenta destino: el CBU/CVU del mail, si no el usuario de Mercado Pago, si no nombre y banco", () => {
  assert.equal(cuentaDestino(aviso({}), "999"), "0110213230021318138015");
  assert.equal(cuentaDestino(aviso({ cuenta: null }), "999"), "mp:999");
  assert.equal(cuentaDestino(aviso({ cuenta: null }), null), "Salazar German Dario · Banco de la Nacion Argentina");
  assert.equal(cuentaDestino(undefined, null), null);
  assert.equal(textoCuenta("0000003100012345678901"), "CVU 0000003100012345678901");
  assert.equal(textoCuenta("mp:999"), "Usuario de Mercado Pago 999");
});

test("titular propio: todas las palabras del nombre del dueño", () => {
  assert.equal(esTitularPropio("LODEIRO FERNANDO JAVIER", ["Fernando Lodeiro"]), true);
  assert.equal(esTitularPropio("Fernando Ariel Millan", ["Fernando Lodeiro"]), false);
  assert.equal(esTitularPropio(null, ["Fernando Lodeiro"]), false);
});

test("en la cuenta personal un retiro es una transferencia a un tercero; el proveedor de la cuenta la clasifica", () => {
  const prov = { id: 7, nombre: "Drugstore", categoria: "Supermercado y comida", ambito_gasto: "personal", recurrencia: "recurrente" };
  const movs = [
    mov({ clave: "con-proveedor", destino_cuenta: "0110213230021318138015", destino_nombre: "Salazar German Dario" }),
    mov({ clave: "otra-cuenta-mismo-proveedor", destino_cuenta: "0070197230004050232458", importe_neto: -5000 }),
    mov({ clave: "sin-mail" }),
    mov({ clave: "propia", destino_cuenta: "0170000000000000000001", destino_nombre: "LODEIRO FERNANDO" }),
    mov({ clave: "mp", tipo_original: "SETTLEMENT", api_tipo: "money_transfer", cobrador_id: "555", movimiento_id: "9", importe_neto: -3000 }),
  ];
  const c = clasificarGastos(movs, {
    propias: new Set(["100"]), ambitoCuenta: () => "personal", marcas: [], reglas: [], titulares: ["Fernando Lodeiro"],
    proveedores: new Map([["0110213230021318138015", prov], ["0070197230004050232458", prov], ["mp:555", { ...prov, id: 8, nombre: "Verdulería", categoria: "Supermercado y comida" }]]),
  });
  const de = (k: string) => c.find((x) => x.clave === k)!;
  assert.equal(de("con-proveedor").es_gasto, true);
  assert.equal(de("con-proveedor").categoria, "Supermercado y comida");
  assert.equal(de("con-proveedor").proveedor, "Drugstore");
  assert.equal(de("otra-cuenta-mismo-proveedor").proveedor, "Drugstore");
  assert.equal(de("sin-mail").es_gasto, true);
  assert.equal(de("sin-mail").categoria, "Transferencias a terceros");
  assert.equal(de("propia").es_gasto, false);
  assert.equal(de("propia").grupo, "Transferencia entre cuentas propias");
  assert.equal(de("mp").destino, "mp:555");
  assert.equal(de("mp").proveedor, "Verdulería");

  // En la empresa, un retiro sigue siendo a la cuenta bancaria propia.
  const e = clasificarGastos([mov({ cuenta: "EMPRESA" })], { propias: new Set(["100"]), ambitoCuenta: () => "empresa", marcas: [], reglas: [] });
  assert.equal(e[0].grupo, "Retiro a banco propio");

  const g = agruparDestinatarios(c);
  assert.equal(g.lista[0].cuenta, "0110213230021318138015");
  assert.equal(g.lista[0].proveedor, "Drugstore");
  assert.equal(g.sinDestino.cantidad, 1);
  assert.equal(g.sinDestino.total, 100000);
});
