// Las galletas de Google Analytics que lleva el clic en WhatsApp mandado desde el servidor (lib/tienda/ga4-mp.ts).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIdDe, sesionDe, SECRETO_GA4 } from "@/lib/tienda/ga4-mp";

test("el client_id sale de la galleta _ga; una rota o vacía no da nada", () => {
  assert.equal(clientIdDe("GA1.1.123456789.1700000000"), "123456789.1700000000");
  assert.equal(clientIdDe("GA1.2.987.1600000000"), "987.1600000000");
  assert.equal(clientIdDe("cualquier cosa"), null);
  assert.equal(clientIdDe(undefined), null);
});

test("la sesión sale de la galleta _ga_<ID>, en el formato viejo y en el nuevo", () => {
  assert.equal(sesionDe("GS1.1.1761580000.3.1.1761580100.0.0.0"), "1761580000");
  assert.equal(sesionDe("GS2.1.s1761580000$o3$g1$t1761580100$j60$l0$h0"), "1761580000");
  assert.equal(sesionDe("GA1.1.123.456"), null);
  assert.equal(sesionDe(null), null);
});

test("la clave secreta: una tira sin espacios", () => {
  assert.ok(SECRETO_GA4.test("aB3dE_fG-hIjKlMnOp"));
  assert.ok(!SECRETO_GA4.test("con espacios adentro"));
  assert.ok(!SECRETO_GA4.test("corta"));
});
