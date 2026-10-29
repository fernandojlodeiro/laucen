// Banco de prueba de la IA de vendedores referentes (Fer, 29/10: «¿probamos con otros modelos, así comparamos?»): casos ya
// juzgados a mano (base, candidatas y cuáles son el mismo producto), para correr el mismo pedido de agrupar
// (lib/compras/referentes-ia.ts) con cada modelo y contar aciertos. Sin cantidades: ésas las resuelve la regla fija.
// Lo corre /api/diagnostico/apify?accion=modelos.

import { pedirClaude, type Modelo } from "@/lib/claude";
import { pedirIA, modeloDe, type Proveedor } from "@/lib/ia";
import { SISTEMA_AGRUPAR, leerIguales } from "@/lib/compras/referentes-ia";

/** [base, [candidata, ¿es la misma?][]] */
export const BANCO: [string, [string, boolean][]][] = [
  ["Sensor Ultrasonico Hc-sr04 Robotica Pic", [["Sensor Ultrasónico Hc-sr04 Para Arduino Pic Robotica", true], ["Modulo Sensor Ultrasonido Hc-sr04 Compatible Arduino Emakers", true],
    ["Sensor Ultrasonico Impermeable Jsn-sr04t Arduino", false], ["Soporte Para Sensor Ultrasonico Hc-sr04", false]]],
  ["Sensor Infrarrojo Optico Reflectivo Tcrt5000 compatible Arduino", [["Sensor Infrarrojo Seguidor De Linea Tracker Ir Tcrt5000", true], ["Modulo Sensor De Luz Con Ldr Fotoresistor", false],
    ["Modulo Sensor Infrarrojo Seguidor Linea Tcrt5000 5 Canales", false], ["Módulo Sensor Infrarrojo Tcrt5000 Compatible Arduino Emakers", true]]],
  ["Termostato Digital Stc-1000 Control Temperatura Frío Calor", [["Termostato Frio - Calor 220v Stc-1000 Acuarios, Incubadoras", true], ["Termostato Digital Stc-3028 Control Temperatura Humedad 220v", false],
    ["Modulo Termostato Digital Programable Con Display W1209", false], ["Controlador De Temperatura Digital Stc-1000 Frio/calor", true]]],
  ["Modulo Relay Rele De 2 Canales 5v 10a Pic Avr", [["Modulo Relay 5v 2 Canales Estado Sólido Ssr 240v", false], ["Modulo Rele 2 Canales 5v 10a Optoacoplado Arduino", true],
    ["Modulo Rele 4 Canales 5v 10a Arduino", false], ["Modulo Rele 1 Canal 5v 10a", false]]],
  ["Inversor 4000w Pico 12v A 220v Ac Conector Universal + Usb", [["Inversor Conversor De Tension 12v A 220v 2000W Pico de 4000W", false], ["Inversor De Corriente 12v a 220v 4000w Usb", true],
    ["Inversor 12v 220v 1000w Onda Modificada", false], ["Inversor 24v A 220v 4000w", false]]],
  ["Módulo Transceptor Rf Nrf24l01 2.4ghz Para Arduino", [["Módulo Transceptor Inalámbrico Nrf24l01+ Pa+lna Antena", false], ["Modulo Nrf24l01+ 2.4ghz Transceptor Wireless Arduino", true],
    ["Adaptador Base Para Nrf24l01 3.3v Regulador", false]]],
  ["Placa Compatible con Arduino Nano V3 ATmega328 16Mhz", [["Placa Nano V3 Compatible Arduino - Emakers", true], ["Arduino Pro Mini 5v 16mhz Atmega328", false],
    ["Placa Arduino Uno R3 Atmega328 Compatible", false], ["Nano Expansion Shield Para Arduino Nano V3", false]]],
  ["Servo Motor Mg995 180 Grados Emakers", [["Servo Motor Mg995 995 180 Grados Robótica Domotica", true], ["Servo Motor Mg996r 180 Grados Metalico", false],
    ["Micro Servo Sg90 9g Arduino", false], ["Servo Motor Mg995 360 Grados Rotacion Continua", false]]],
  ["Fuente Step Down Buck Ajustable 32v 5a Xl4005", [["Modulo Step Down Xl4005 Convertidor Fuente 0.8 A 30v 5a", true], ["Fuente Step Down Dc Mini360 1v A 17v 1.8a", false],
    ["Modulo Step Down Lm2596 3a Ajustable", false], ["Modulo Step Up Xl6009 Elevador De Tension", false]]],
  ["Sensor Movimiento PIR Infrarrojo HC-SR501 Arduino Ajustable", [["Módulo Sensor De Movimiento Pir Hc Sr501 Paraarduino", true], ["Mini Sensor Pir Hc-sr505 Movimiento", false],
    ["Sensor De Movimiento Pir Am312 Mini", false], ["Lente Fresnel Para Sensor Pir Hc-sr501", false]]],
  ["Modulo Bluetooth Hc05 Maestro Esclavo Uart Ttl", [["Modulo Bluetooth Hc-06 Esclavo Arduino", false], ["Bluetooth Hc05 Maestro Esclavo Uart Ttl At Arduino", true],
    ["Módulo Bluetooth 4.0 Hm-10 Cc2541 Ble", false]]],
  ["Sensor De Temperatura Sumergible Ds18b20", [["Ds18b20 Sensor De Temperatura Sumergible Desarrollo", true], ["Sensor Digital Temperatura Ds18b20 Encapsulado To-92", false],
    ["Sensor Temperatura Humedad Dht22 Am2302", false]]],
  ["Nodemcu Esp32 Wroom Wifi Iot Bluetooth 30 Pines Micro Usb", [["Placa Esp32 Wifi Bluetooth Ble Microusb 30 Pines Arduino Compatible", true], ["Nodemcu Esp8266 V3 Wifi Lolin Ch340", false],
    ["Esp32 Cam Wifi Bluetooth Con Camara Ov2640", false], ["Base Expansion Para Esp32 30 Pines", false]]],
  ["Modulo Lector Tarjeta Micro Sd Arduino Spi", [["Modulo Adaptador Lector Micro Sd Spi Para Arduino", true], ["Modulo Lector Tarjeta Sd Tamaño Grande Arduino", false],
    ["Memoria Micro Sd 32gb Clase 10", false]]],
];

export type Candidato = { nombre: string; correr: (system: string, contenido: string) => Promise<{ texto?: string; error?: string; usd: number }> };

/** Los modelos para comparar: los tres de Claude y los otros proveedores que tengan llave y modelo cargados en Vercel. */
export function candidatos(): Candidato[] {
  const claude = (m: Modelo): Candidato => ({ nombre: `Claude ${m}`, correr: async (system, contenido) => {
    const r = await pedirClaude({ system, contenido, modelo: m, effort: "low", maxTokens: 300 });
    return "error" in r ? { error: r.error, usd: r.usd } : { texto: r.texto, usd: r.usd };
  } });
  const otro = (p: Proveedor): Candidato => ({ nombre: `${p} ${modeloDe(p) || "(sin modelo)"}`, correr: async (system, contenido) => {
    const r = await pedirIA(p, { system, contenido, maxTokens: 300 });
    return "error" in r ? { error: r.error, usd: r.usd } : { texto: r.texto, usd: r.usd };
  } });
  return [claude("chico"), claude("medio"), claude("grande"), otro("openai"), otro("gemini"), otro("perplexity")];
}

/** Corre el banco entero con un modelo: aciertos sobre el total de juicios, lo que erró, costo y segundos. */
export async function correrBanco(c: Candidato) {
  const t0 = Date.now();
  let bien = 0, total = 0, usd = 0;
  const errores: string[] = [];
  await Promise.all(BANCO.map(async ([base, cands]) => {
    const lista = cands.map(([t], k) => `${k + 1}. ${t}`).join("\n");
    const r = await c.correr(SISTEMA_AGRUPAR, `Base: ${base}\n\nCandidatas:\n${lista}`);
    usd += r.usd;
    total += cands.length;
    const iguales = r.texto ? leerIguales(r.texto, cands.length) : null;
    if (!iguales) { errores.push(`${base}: sin respuesta (${(r.error ?? r.texto ?? "").slice(0, 120)})`); return; }
    cands.forEach(([t, es], k) => {
      if (iguales.includes(k + 1) === es) bien++;
      else errores.push(`${base} ↔ ${t}: dijo ${es ? "distinto" : "igual"}`);
    });
  }));
  return { modelo: c.nombre, aciertos: `${bien}/${total}`, pct: total ? Math.round((bien / total) * 1000) / 10 : 0, usd: Math.round(usd * 10000) / 10000, segundos: Math.round((Date.now() - t0) / 1000), errores };
}
