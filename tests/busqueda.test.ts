// La regla de búsqueda de todo el panel (Fer, 6/10; lib/busqueda.ts). Pura, sin base.

import { test } from "node:test";
import assert from "node:assert/strict";
import { terminosBusqueda, patronesBusqueda, digitosBusqueda, numeroBusqueda, sqlBusqueda, coincideBusqueda } from "@/lib/busqueda";

test("busqueda: la frase tal cual; el ? separa condiciones", () => {
  assert.deepEqual(terminosBusqueda("  Mini Elm "), ["Mini Elm"]);
  assert.deepEqual(terminosBusqueda("note?12gb"), ["note", "12gb"]);
  assert.deepEqual(terminosBusqueda("note? ?note"), ["note"]);
  assert.deepEqual(terminosBusqueda(""), []);
  assert.deepEqual(patronesBusqueda("50%_a"), ["%50\\%\\_a%"]);
  assert.deepEqual(patronesBusqueda("abc", true), ["abc%"]);
});

test("busqueda: dígitos sólo para lo que no tiene letras; id sólo con un número solo", () => {
  assert.deepEqual(digitosBusqueda("SKU02252"), [""]);
  assert.deepEqual(digitosBusqueda("20-10225274-9"), ["%20102252749%"]);
  assert.deepEqual(digitosBusqueda("perez?2025"), ["", "%2025%"]);
  assert.equal(numeroBusqueda("1340"), 1340);
  assert.equal(numeroBusqueda("1340?sku"), null);
  assert.equal(numeroBusqueda("SKU1340"), null);
});

test("busqueda: en memoria, todas las condiciones en el mismo dato", () => {
  const nb = ["Notebook Asus 12GB", "F412DA"];
  assert.equal(coincideBusqueda(nb, "note?12gb"), true);
  assert.equal(coincideBusqueda(nb, "note?16gb"), false);
  assert.equal(coincideBusqueda(nb, "notebook 12gb"), false, "la frase va junta");
  assert.equal(coincideBusqueda(nb, "f412?note"), false, "una en un dato y otra en otro no vale");
  assert.equal(coincideBusqueda(nb, "note", true), true);
  assert.equal(coincideBusqueda(nb, "asus", true), false, "comienza por");
  assert.equal(coincideBusqueda(nb, "note?asus", true), true, "comienza por: la primera al principio, las demás en cualquier parte");
  assert.equal(coincideBusqueda(nb, ""), true);
  assert.deepEqual(patronesBusqueda("note?12", true), ["note%", "%12%"]);
});

test("busqueda: el SQL, todas en el mismo campo", () => {
  const s = sqlBusqueda("$2", ["p.titulo", "p.sku_base", { de: "select 1 from variacion v where v.producto_id = p.id", campos: ["v.sku"] }]);
  assert.match(s, /not exists \(select 1 from unnest\(\$2::text\[\]\) w where not coalesce\(p\.titulo ilike w, false\)\) or not exists/);
  assert.match(s, /exists \(select 1 from variacion v where v\.producto_id = p\.id and \(not exists .*v\.sku ilike w/);
  const d = sqlBusqueda("$2", ["c.nombre", "c.cuit"], { param: "$4", campos: ["c.cuit"] });
  assert.match(d, /unnest\(\$2::text\[\], \$4::text\[\]\) t\(w, d\) where not coalesce\(c\.cuit ilike w or \(d <> '' and regexp_replace\(coalesce\(c\.cuit, ''\), '\\D', '', 'g'\) like d\)/);
  assert.throws(() => sqlBusqueda("$2", ["exists (select 1 from x where x.a ilike w)"]));
});
