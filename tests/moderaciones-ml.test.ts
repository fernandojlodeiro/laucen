// Motivos de revisión de ML: lo puro (HTML, forma de la respuesta, si es por precio). Sin base ni red.
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { sinHtml, listaDe, resumir } from "@/lib/mercadolibre/moderaciones";

test("sinHtml: saca etiquetas y entidades, respeta los renglones", () => {
  assert.equal(sinHtml("<p>El precio&nbsp;es <b>muy bajo</b>.</p><br/>Corregilo"), "El precio es muy bajo.\nCorregilo");
  assert.equal(sinHtml("Modific&aacute; el valor de la categor&iacute;a &#191;s&iacute;?"), "Modificá el valor de la categoría ¿sí?");
  assert.equal(sinHtml(null), "");
});

test("listaDe: lista suelta o adentro de infractions/results/data", () => {
  assert.equal(listaDe([{ reason: "a" }]).length, 1);
  assert.equal(listaDe({ infractions: [{}, {}] }).length, 2);
  assert.equal(listaDe({ results: [{}] }).length, 1);
  assert.deepEqual(listaDe({ message: "not found" }), []);
});

test("resumir: motivo y solución de la publicación; por precio si lo dice el motivo, la solución o el grupo", () => {
  const r = resumir([
    { related_item_id: "MLA1", reason: "<p>El precio no es real</p>", remedy: "Modificá el precio", filter_subgroup: "PRICE" },
    { related_item_id: "MLA2", reason: "Otra cosa" },
  ], "MLA1");
  assert.equal(r.motivo, "El precio no es real");
  assert.equal(r.solucion, "Modificá el precio");
  assert.equal(r.porPrecio, true);
  const f = resumir([{ related_item_id: "MLA3", reason: "Foto con logo", remedy: "Cambiá la foto" }], "MLA3");
  assert.equal(f.porPrecio, false);
  assert.equal(resumir([], "MLA9").motivo, null);
});
