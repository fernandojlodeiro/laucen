// Las reglas de la web, que no se rompen nunca (Fer, 25/10): en la tienda jamás hay un producto inactivo, sin
// precio o sin stock — ni en los listados, ni en la ficha por link directo, ni en los catálogos de publicidad,
// ni en el mapa del sitio. Y no hay ninguna opción de configuración que lo apague.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = (p: string) => readFileSync(p, "utf8");

test("el listado sólo deja lo que tiene precio y stock", async () => {
  const { vendibleEnLaWeb } = await import("@/app/tienda/[slug]/catalogo");
  assert.equal(vendibleEnLaWeb({ venta: 1000, stock: 3 }), true);
  assert.equal(vendibleEnLaWeb({ venta: 1000, stock: 0 }), false);
  assert.equal(vendibleEnLaWeb({ venta: 0, stock: 3 }), false);
  const c = leer("app/tienda/[slug]/catalogo.ts");
  assert.match(c, /todos\.filter\(vendibleEnLaWeb\)/);
  assert.match(c, /p\.estado = 'activo'/);
});

test("la ficha por link directo exige activo, precio y stock", () => {
  const f = leer("app/tienda/[slug]/producto/[id]/page.tsx");
  assert.match(f, /p\.estado = 'activo'/);
  assert.match(f, /v\.estado = 'activa'/);
  assert.match(f, /else pr\.venta_ars end, 0\) > 0/);
  assert.match(f, /stock_disponible_canal\(\$2, v\.id, \$3\) > 0/);
});

test("el catálogo de publicidad nunca manda sin stock, sin precio ni inactivos", () => {
  const f = leer("lib/tienda/feed.ts");
  assert.match(f, /if \(f\.disponible <= 0\) \{ afuera\.sin_stock\+\+; continue; \}/);
  assert.match(f, /p\.estado = 'activo'/);
  assert.match(f, /else pr\.venta_ars end, 0\) > 0/);
  assert.doesNotMatch(f, /agotado/);
});

test("ninguna configuración puede mostrar productos sin stock", () => {
  for (const p of ["app/config/tienda/page.tsx", "app/config/tienda/acciones.ts", "lib/tienda/tienda.ts",
    "app/config/tienda/medicion/page.tsx", "app/config/tienda/medicion/acciones.ts"]) {
    assert.doesNotMatch(leer(p), /name="sin_stock"|sin_stock:|"agotado"/, p);
  }
});
