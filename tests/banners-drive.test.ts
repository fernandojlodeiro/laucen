// La convención de las carpetas del Drive para los banners (lib/tienda/banners-drive.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { idDeCarpeta, pantallaDeCarpeta, familiaDe } from "@/lib/tienda/banners-drive";

test("el link de la carpeta (o el id solo) da el id; otra cosa avisa", () => {
  assert.equal(idDeCarpeta("https://drive.google.com/drive/folders/1v3UmobrmhaWNLbtxlV6Pb7soSefmTM2a?usp=sharing"), "1v3UmobrmhaWNLbtxlV6Pb7soSefmTM2a");
  assert.equal(idDeCarpeta("1v3UmobrmhaWNLbtxlV6Pb7soSefmTM2a"), "1v3UmobrmhaWNLbtxlV6Pb7soSefmTM2a");
  assert.equal(idDeCarpeta("  "), null);
  assert.throws(() => idDeCarpeta("mi carpeta"), /link de la carpeta/);
});

test("la pantalla sale del nombre de la carpeta y la familia del nombre de la imagen", () => {
  assert.equal(pantallaDeCarpeta("Escritorio"), "compu");
  assert.equal(pantallaDeCarpeta("Celulares"), "celular");
  assert.equal(pantallaDeCarpeta("PC"), "compu");
  assert.equal(pantallaDeCarpeta("Históricos"), null);
  assert.equal(familiaDe("Daitom_Envios_Oscura_1920x420.png"), "oscura");
  assert.equal(familiaDe("Daitom_Financiacion_Clara_1200x400.png"), "clara");
  assert.equal(familiaDe("Claros"), "clara");
  assert.equal(familiaDe("banner.png"), null);
});
