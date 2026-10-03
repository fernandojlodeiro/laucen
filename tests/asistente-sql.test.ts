// Los resguardos de los cambios libres del asistente (lib/asistente/sql.ts),
// sin base: qué instrucciones se aceptan y cuáles no.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tablaDelCambio, revisarConsultaCon } from "@/lib/asistente/sql";

const TABLAS = new Set(["meli_item", "publicacion", "asiento", "asiento_linea", "cliente", "pedido", "variacion", "meli_llave", "config_org", "producto"]);
const FUNCIONES = new Set(["precio_de", "mis_organizaciones"]);

test("consultas libres: cada tabla con el permiso de su pantalla", () => {
  const vendedor = { pedidos_ver: true, publicaciones_ver: true, contabilidad_ver: false };
  assert.ok(revisarConsultaCon("select count(*) from meli_item where status = 'under_review'", vendedor, false, TABLAS, FUNCIONES));
  assert.ok(revisarConsultaCon("select p.id, c.nombre from pedido p join cliente c on c.id = p.cliente_id", vendedor, false, TABLAS, FUNCIONES));
  assert.throws(() => revisarConsultaCon("select * from asiento", vendedor, false, TABLAS, FUNCIONES), /otro rol/);
  assert.throws(() => revisarConsultaCon("select * from config_org", vendedor, false, TABLAS, FUNCIONES), /superadministrador/);
  assert.throws(() => revisarConsultaCon("select * from precio_de('x', 1, 1)", vendedor, false, TABLAS, FUNCIONES), /sin funciones del sistema/);
  assert.throws(() => revisarConsultaCon("update cliente set nombre = 'x' where id = 1", vendedor, false, TABLAS, FUNCIONES), /SELECT/);
  // El superadministrador consulta todo menos lo secreto.
  assert.ok(revisarConsultaCon("select * from asiento", {}, true, TABLAS, FUNCIONES));
  assert.throws(() => revisarConsultaCon("select * from meli_llave", {}, true, TABLAS, FUNCIONES), /llaves/);
  // Una tabla sin política de fila daría vacío: se avisa en vez de contestar "0".
  assert.throws(() => revisarConsultaCon("select * from producto", {}, true, TABLAS, FUNCIONES, new Set(["producto"])), /datos compartidos/);
});

test("acepta un cambio simple sobre una tabla de Laucen", () => {
  assert.deepEqual(tablaDelCambio("update cliente set telefono = '351' where id = 5"), { tabla: "cliente", tipo: "update", aviso: null });
  assert.equal(tablaDelCambio("insert into proveedor (organizacion_id, nombre) values ('x', 'Acme; SA')").tabla, "proveedor");
  assert.equal(tablaDelCambio("delete from public.cucarda where id = 3;").tipo, "delete");
  assert.match(tablaDelCambio("update precio set lista_ars = lista_ars * 1.1 where variacion_id = 1").aviso ?? "", /Mercado Libre/);
});

test("rechaza lo que no corresponde", () => {
  assert.throws(() => tablaDelCambio("select * from cliente"), /INSERT INTO, UPDATE o DELETE/);
  assert.throws(() => tablaDelCambio("update cliente set nombre = 'a' where id = 1; delete from cliente where id = 2"), /Una sola instrucción/);
  assert.throws(() => tablaDelCambio("update cliente set nombre = 'a' where id = 1 -- x"), /Sin comentarios/);
  assert.throws(() => tablaDelCambio("update cliente set nombre = 'a'"), /sin WHERE/);
  assert.throws(() => tablaDelCambio("delete from cliente"), /sin WHERE/);
  assert.throws(() => tablaDelCambio("update meli_cuenta set x = 1 where id = 1"), /Mercado Libre/);
  assert.throws(() => tablaDelCambio("update canal set config = '{}' where id = 1"), /Mercado Libre/);
  assert.throws(() => tablaDelCambio("update membresias set superadmin = true where id = 'x'"), /usuarios y permisos/);
  assert.throws(() => tablaDelCambio("update stock set cantidad = 5 where id = 1"), /ajuste/);
  assert.throws(() => tablaDelCambio("delete from asiento where id = 1"), /asiento manual/);
  assert.throws(() => tablaDelCambio("update pedido set estado = 'entregado' where id = 1"), /cambiar estado/);
  assert.throws(() => tablaDelCambio("update coordinacion.bitacora set titulo = 'x' where id = 1"), /esquema público/);
  assert.throws(() => tablaDelCambio("update cliente set nombre = set_config('role', 'x', true) where id = 1"), /no está permitido/);
});
