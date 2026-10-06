// La lectura de lo que contesta OCA y el XML del alta (lib/oca/api.ts), sin red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { bloques, texto, soloCp, xmlAlta, hitoDe, fechaOca, cuitOca } from "@/lib/oca/api";

test("bloques lee las filas de un DataSet de OCA", () => {
  const xml = `<?xml version="1.0"?><DataSet><diffgr:diffgram><NewDataSet>
    <Table diffgr:id="Table1"><Tarifador>15</Tarifador><Precio>8450.5</Precio><PlazoEntrega>3</PlazoEntrega><Total>10225.11</Total></Table>
  </NewDataSet></diffgr:diffgram></DataSet>`;
  const f = bloques(xml, "Table");
  assert.equal(f.length, 1);
  assert.equal(f[0].total, "10225.11");
  assert.equal(f[0].plazoentrega, "3");
});

test("texto y entidades", () => {
  assert.equal(texto(`<string xmlns="#">JVBER&amp;x</string>`, "string"), "JVBER&x");
});

test("soloCp deja los 4 números", () => {
  assert.equal(soloCp("B1646ABC"), "1646");
  assert.equal(soloCp(" 5000 "), "5000");
  assert.equal(soloCp("X5000"), "5000");
});

test("cuitOca pone los guiones", () => {
  assert.equal(cuitOca("30712345678"), "30-71234567-8");
});

test("el XML del alta escapa y saca los acentos", () => {
  const xml = xmlAlta({
    nroCuenta: "111757/001", operativa: "64665", remito: "Pedido 28", fecha: "20261006", franja: 1, centroOrigen: null,
    origen: { calle: "Av. Colón", numero: "1234", piso: "", depto: "", cp: "B1646ABC", localidad: "San Fernando", provincia: "Buenos Aires", contacto: "Fer", email: "a@b.com", telefono: "" },
    destino: { apellido: "Muñoz", nombre: "José", calle: "Calle \"1\" & 2", numero: "10", piso: "", depto: "", localidad: "Córdoba", provincia: "Córdoba", cp: "5000", telefono: "", celular: "", email: "", observaciones: "", idci: null },
    paquetes: [{ largoCm: 20, anchoCm: 15, altoCm: 10, pesoKg: 0.5, valor: 1000 }],
  });
  assert.match(xml, /nrocuenta="111757\/001"/);
  assert.match(xml, /calle="Av. Colon"/);
  assert.match(xml, /apellido="Munoz"/);
  assert.match(xml, /calle="Calle &quot;1&quot; &amp; 2"/);
  assert.match(xml, /cp="1646"/);
  assert.match(xml, /idci="0"/);
  assert.match(xml, /<paquete alto="10" ancho="15" largo="20" peso="0.50" valor="1000.00" cant="1" \/>/);
});

test("hitoDe entiende los estados de OCA", () => {
  assert.equal(hitoDe("Entregada"), "entregado");
  assert.equal(hitoDe("No entregado - domicilio cerrado"), "en_camino");
  assert.equal(hitoDe("En tránsito"), "en_camino");
  assert.equal(hitoDe("Devuelto al remitente"), "devuelto");
  assert.equal(hitoDe("Pendiente de admisión"), null);
});

test("fechaOca en hora argentina", () => {
  assert.equal(fechaOca("06/10/2026 14:35"), "2026-10-06T17:35:00.000Z");
  assert.equal(fechaOca("2026-10-06T14:35:00"), "2026-10-06T17:35:00.000Z");
  assert.equal(fechaOca(""), null);
});

test("bloques lee las sucursales (<Centro>) con sus servicios", () => {
  const xml = `<CentrosDeImposicion><Centro><IdCentroImposicion>44</IdCentroImposicion><Sigla>ROS</Sigla><Sucursal>ROSARIO</Sucursal>
    <Calle>CORRIENTES</Calle><Numero>1234</Numero><Localidad>ROSARIO</Localidad><Provincia>SANTA FE</Provincia><CodigoPostal>2000</CodigoPostal>
    <Servicios><Servicio><IdTipoServicio>1</IdTipoServicio><ServicioDesc>Admision de paquetes</ServicioDesc></Servicio>
    <Servicio><IdTipoServicio>2</IdTipoServicio><ServicioDesc>Entrega de paquetes</ServicioDesc></Servicio></Servicios></Centro></CentrosDeImposicion>`;
  const f = bloques(xml, "Centro");
  assert.equal(f.length, 1);
  assert.equal(f[0].idcentroimposicion, "44");
  assert.equal(f[0].sucursal, "ROSARIO");
  assert.match(f[0].servicios, /Entrega de paquetes/);
});
