// La factura de afuera que devuelve ARCA (FECompConsultar), leída sin ARCA:
// base para la nota de crédito de una venta anterior a Laucen (bitácora #341).

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerFactura } from "@/lib/arca/wsfe";

const RESPUESTA = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult><ResultGet>
<Concepto>1</Concepto><DocTipo>96</DocTipo><DocNro>30111222</DocNro><CbteDesde>1234</CbteDesde><CbteHasta>1234</CbteHasta>
<CbteFch>20260812</CbteFch><ImpTotal>13310.00</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>11000.00</ImpNeto><ImpOpEx>0</ImpOpEx>
<ImpTrib>0</ImpTrib><ImpIVA>2310.00</ImpIVA><MonId>PES</MonId><MonCotiz>1</MonCotiz>
<Iva><AlicIva><Id>5</Id><BaseImp>10000.00</BaseImp><Importe>2100.00</Importe></AlicIva><AlicIva><Id>4</Id><BaseImp>2000.00</BaseImp><Importe>210.00</Importe></AlicIva></Iva>
<Resultado>A</Resultado><CodAutorizacion>76123456789012</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20260822</FchVto>
<PtoVta>3</PtoVta><CbteTipo>6</CbteTipo></ResultGet></FECompConsultarResult></FECompConsultarResponse></soap:Body></soap:Envelope>`;

test("lee la factura de afuera que devuelve ARCA", () => {
  const f = leerFactura(RESPUESTA, 6, 3, 1234);
  assert.ok(f);
  assert.equal(f.fecha, "2026-08-12");
  assert.equal(f.docTipo, 96);
  assert.equal(f.docNro, "30111222");
  assert.equal(f.total, 13310);
  assert.equal(f.cae, "76123456789012");
  assert.equal(f.condicionIvaReceptor, null);
  assert.deepEqual(f.alicuotas, [{ id: 5, base: 10000, importe: 2100 }, { id: 4, base: 2000, importe: 210 }]);
});

test("si ARCA no la tiene, null", () => {
  const xml = `<FECompConsultarResult><Errors><Err><Code>602</Code><Msg>No existen datos en nuestros registros para los parametros ingresados.</Msg></Err></Errors></FECompConsultarResult>`;
  assert.equal(leerFactura(xml, 6, 3, 99), null);
});
