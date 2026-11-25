// Lector mínimo del Excel viejo (.xls, BIFF8 dentro de un contenedor OLE), sin librerías: ARCA baja algunos listados
// así («Mis Retenciones»: MisRetencionesImpositivas.xls) y ExcelJS sólo lee .xlsx. Devuelve la primera hoja como tabla
// de celdas (texto o número). Lee textos (compartidos y sueltos) y números (NUMBER, RK, MULRK); fórmulas, formatos y
// fechas como número de serie no le hacen falta a ARCA, que manda todo como texto.

export function esXlsViejo(buf: Uint8Array) {
  return buf.length > 512 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
}

const FIN = 0xfffffffe, LIBRE = 0xffffffff;

/** El stream «Workbook» (o «Book») del contenedor OLE. */
function streamLibro(b: Buffer): Buffer {
  const tamSector = 1 << b.readUInt16LE(30), tamMini = 1 << b.readUInt16LE(32);
  const nFat = b.readUInt32LE(44), dirInicio = b.readUInt32LE(48), corte = b.readUInt32LE(56);
  const miniFatInicio = b.readUInt32LE(60), difatInicio = b.readUInt32LE(68);
  const sector = (n: number) => b.subarray(512 + n * tamSector, 512 + (n + 1) * tamSector);
  // Los sectores de la FAT: los primeros 109 en el encabezado, el resto en la cadena DIFAT.
  const fatSectores: number[] = [];
  for (let i = 0; i < 109 && fatSectores.length < nFat; i++) fatSectores.push(b.readUInt32LE(76 + i * 4));
  for (let d = difatInicio; d !== FIN && d !== LIBRE && fatSectores.length < nFat;) {
    const s = sector(d);
    for (let i = 0; i < tamSector / 4 - 1 && fatSectores.length < nFat; i++) fatSectores.push(s.readUInt32LE(i * 4));
    d = s.readUInt32LE(tamSector - 4);
  }
  const fat: number[] = [];
  for (const f of fatSectores) { const s = sector(f); for (let i = 0; i < tamSector / 4; i++) fat.push(s.readUInt32LE(i * 4)); }
  const cadena = (inicio: number, tabla: number[], leer: (n: number) => Buffer) => {
    const partes: Buffer[] = [];
    for (let n = inicio, vueltas = 0; n !== FIN && n !== LIBRE && n < tabla.length && vueltas < 1e6; n = tabla[n], vueltas++) partes.push(leer(n));
    return Buffer.concat(partes);
  };
  const dir = cadena(dirInicio, fat, sector);
  type Entrada = { nombre: string; tipo: number; inicio: number; tam: number };
  const entradas: Entrada[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const largo = dir.readUInt16LE(o + 64);
    entradas.push({ nombre: dir.subarray(o, o + Math.max(0, largo - 2)).toString("utf16le"), tipo: dir[o + 66], inicio: dir.readUInt32LE(o + 116), tam: dir.readUInt32LE(o + 120) });
  }
  const raiz = entradas.find((e) => e.tipo === 5);
  const libro = entradas.find((e) => e.tipo === 2 && /^(workbook|book)$/i.test(e.nombre));
  if (!libro) throw new Error("El archivo no tiene una hoja de Excel adentro.");
  if (libro.tam >= corte || !raiz) return cadena(libro.inicio, fat, sector).subarray(0, libro.tam);
  // Chico: vive en el mini stream de la raíz.
  const miniStream = cadena(raiz.inicio, fat, sector);
  const miniFat: number[] = [];
  const mf = cadena(miniFatInicio, fat, sector);
  for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mf.readUInt32LE(i));
  return cadena(libro.inicio, miniFat, (n) => miniStream.subarray(n * tamMini, (n + 1) * tamMini)).subarray(0, libro.tam);
}

/** Número RK de BIFF: entero o double recortado, a veces ×100. */
function rk(v: number): number {
  const centesimos = (v & 1) !== 0;
  let n: number;
  if (v & 2) n = v >> 2;
  else { const t = Buffer.alloc(8); t.writeUInt32LE(v & 0xfffffffc, 4); n = t.readDoubleLE(0); }
  return centesimos ? n / 100 : n;
}

/** Lee la tabla de textos compartidos (SST), que puede seguir en registros CONTINUE: al cortarse un texto, el
 *  pedazo siguiente arranca con su propio byte de opciones (si los caracteres son de 1 o 2 bytes). */
function leerSst(partes: Buffer[]): string[] {
  let p = 0, o = 8; // la primera parte arranca con el total y la cantidad de textos únicos
  const cuantos = partes[0].readUInt32LE(4);
  const disponible = () => partes[p].length - o;
  const avanzar = () => { if (disponible() <= 0 && p < partes.length - 1) { p++; o = 0; } };
  const u8 = () => { avanzar(); return partes[p][o++]; };
  const u16 = () => { avanzar(); const v = partes[p].readUInt16LE(o); o += 2; return v; };
  const u32 = () => { avanzar(); const v = partes[p].readUInt32LE(o); o += 4; return v; };
  const saltear = (n: number) => { while (n > 0) { avanzar(); const k = Math.min(n, disponible()); o += k; n -= k; if (k === 0) break; } };
  const textos: string[] = [];
  for (let i = 0; i < cuantos && p < partes.length; i++) {
    const cch = u16(); let opciones = u8();
    const runs = opciones & 0x08 ? u16() : 0;
    const ext = opciones & 0x04 ? u32() : 0;
    let t = "", faltan = cch;
    while (faltan > 0) {
      if (disponible() <= 0) { if (p >= partes.length - 1) break; p++; o = 0; opciones = partes[p][o++]; }
      const ancho = opciones & 0x01 ? 2 : 1;
      const k = Math.min(faltan, Math.floor(disponible() / ancho));
      const trozo = partes[p].subarray(o, o + k * ancho);
      t += ancho === 2 ? trozo.toString("utf16le") : trozo.toString("latin1");
      o += k * ancho; faltan -= k;
      if (k === 0 && disponible() > 0) break;
    }
    saltear(runs * 4 + ext);
    textos.push(t);
  }
  return textos;
}

/** La primera hoja como tabla (filas × columnas; celda vacía = null). */
export function tablaDeXlsViejo(buf: Uint8Array): (string | number | null)[][] {
  const s = streamLibro(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  const celdas = new Map<number, Map<number, string | number>>();
  const poner = (f: number, c: number, v: string | number) => { if (!celdas.has(f)) celdas.set(f, new Map()); celdas.get(f)!.set(c, v); };
  let sst: string[] = [];
  let sstPartes: Buffer[] | null = null;
  let bofs = 0;
  for (let o = 0; o + 4 <= s.length;) {
    const tipo = s.readUInt16LE(o), largo = s.readUInt16LE(o + 2);
    const d = s.subarray(o + 4, o + 4 + largo);
    o += 4 + largo;
    if (sstPartes && tipo !== 0x003c) { sst = leerSst(sstPartes); sstPartes = null; }
    if (tipo === 0x0809) { bofs++; if (bofs > 2) break; continue; } // 1.º los datos del libro, 2.º la primera hoja
    if (tipo === 0x00fc) { sstPartes = [d]; continue; }
    if (tipo === 0x003c && sstPartes) { sstPartes.push(d); continue; }
    if (bofs !== 2) continue;
    if (tipo === 0x00fd) poner(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readUInt32LE(6)] ?? "");
    else if (tipo === 0x0203) poner(d.readUInt16LE(0), d.readUInt16LE(2), d.readDoubleLE(6));
    else if (tipo === 0x027e) poner(d.readUInt16LE(0), d.readUInt16LE(2), rk(d.readInt32LE(6)));
    else if (tipo === 0x00bd) {
      const f = d.readUInt16LE(0), c0 = d.readUInt16LE(2), n = (largo - 6) / 6;
      for (let i = 0; i < n; i++) poner(f, c0 + i, rk(d.readInt32LE(4 + i * 6 + 2)));
    } else if (tipo === 0x0204) {
      const cch = d.readUInt16LE(6), ancho = d[8] & 1 ? 2 : 1;
      const t = d.subarray(9, 9 + cch * ancho);
      poner(d.readUInt16LE(0), d.readUInt16LE(2), ancho === 2 ? t.toString("utf16le") : t.toString("latin1"));
    }
  }
  const filas = [...celdas.keys()];
  if (!filas.length) return [];
  const maxF = Math.max(...filas), maxC = Math.max(...[...celdas.values()].flatMap((m) => [...m.keys()]));
  return Array.from({ length: maxF + 1 }, (_, f) => Array.from({ length: maxC + 1 }, (_, c) => celdas.get(f)?.get(c) ?? null));
}
