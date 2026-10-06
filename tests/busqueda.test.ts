// La regla de búsqueda de todo el panel (Fer, 6/10; lib/busqueda.ts). Pura, sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { gruposBusqueda, terminosBusqueda, parametroBusqueda, sqlBusqueda, coincideBusqueda } from "@/lib/busqueda";

test("busqueda: la frase tal cual; ? en el mismo campo, * en la misma fila", () => {
  assert.deepEqual(gruposBusqueda("  Mini Elm "), [["Mini Elm"]]);
  assert.deepEqual(gruposBusqueda("note?12gb"), [["note", "12gb"]]);
  assert.deepEqual(gruposBusqueda("note?12gb*asus"), [["note", "12gb"], ["asus"]]);
  assert.deepEqual(gruposBusqueda("note? ?*"), [["note"]]);
  assert.deepEqual(gruposBusqueda(""), []);
  assert.deepEqual(terminosBusqueda("a?b*a"), ["a", "b"]);
  assert.equal(parametroBusqueda("50%_a"), JSON.stringify([["%50\\%\\_a%"]]));
  assert.equal(parametroBusqueda("abc?d*e", true), JSON.stringify([["abc%", "%d%"], ["e%"]]));
  assert.equal(parametroBusqueda(""), "[]");
});

test("busqueda: en memoria", () => {
  const nb = ["Notebook Asus 12GB", "F412DA"];
  assert.equal(coincideBusqueda(nb, "note?12gb"), true);
  assert.equal(coincideBusqueda(nb, "note?16gb"), false);
  assert.equal(coincideBusqueda(nb, "notebook 12gb"), false, "la frase va junta");
  assert.equal(coincideBusqueda(nb, "f412?note"), false, "con ? tienen que estar en el mismo dato");
  assert.equal(coincideBusqueda(nb, "f412*note"), true, "con * pueden estar en datos distintos");
  assert.equal(coincideBusqueda(nb, "note?asus*f41"), true);
  assert.equal(coincideBusqueda(nb, "note", true), true);
  assert.equal(coincideBusqueda(nb, "asus", true), false, "comienza por");
  assert.equal(coincideBusqueda(nb, "2022"), false, "números y letras por igual: no se separan");
  assert.equal(coincideBusqueda(["Banco"], "0720-1234", false, ["07201234000"]), true, "campo numérico: lo escrito sin guiones");
  assert.equal(coincideBusqueda(nb, ""), true);
});

test("busqueda: el SQL", () => {
  const s = sqlBusqueda("$2", ["p.titulo", { num: "c.cuit" }, { de: "select 1 from variacion v where v.producto_id = p.id", campos: ["v.sku"] }]);
  assert.match(s, /^not exists \(select 1 from jsonb_array_elements\(\$2::jsonb\) _g where not \(/);
  assert.match(s, /coalesce\(p\.titulo ilike _p, false\)/);
  assert.match(s, /c\.cuit like '%' \|\| regexp_replace\(_p, '\[\^0-9\]', '', 'g'\) \|\| '%'/);
  assert.match(s, /exists \(select 1 from variacion v where v\.producto_id = p\.id and \(not exists .*v\.sku ilike _p/);
  assert.equal(sqlBusqueda("$2", []), "true");
  assert.throws(() => sqlBusqueda("$2", ["x ilike _p"]));
});
