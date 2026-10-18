// Un .zip mínimo (guardado o comprimido con deflate), para bajar varios archivos
// juntos sin sumar una librería. Formato PKZIP: encabezado local por
// archivo + directorio central + fin de directorio.

import { deflateRawSync } from "node:zlib";

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** `comprimir`: cada archivo va comprimido (deflate); si no, guardado tal cual. */
export function armarZip(archivos: { nombre: string; contenido: string | Uint8Array }[], fecha = new Date(), comprimir = false): Buffer {
  // Fecha y hora en formato DOS.
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2);
  const dia = ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, "utf8");
    const datos = typeof a.contenido === "string" ? Buffer.from(a.contenido, "latin1") : Buffer.from(a.contenido);
    const crc = crc32(datos);
    const guardado = comprimir ? deflateRawSync(datos, { level: 6 }) : datos;
    const metodo = comprimir ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10); local.writeUInt16LE(dia, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(guardado.length, 18); local.writeUInt32LE(datos.length, 22); local.writeUInt16LE(nombre.length, 26); local.writeUInt16LE(0, 28);
    locales.push(local, nombre, guardado);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(hora, 12); central.writeUInt16LE(dia, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(guardado.length, 20); central.writeUInt32LE(datos.length, 24); central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(offset, 42);
    centrales.push(central, nombre);
    offset += local.length + nombre.length + guardado.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}
