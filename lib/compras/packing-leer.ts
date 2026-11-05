// Lee un packing list del proveedor caja por caja (pedido de Fer, 5/11; órdenes de compra al exterior). Sin base:
// lo prueban los tests.
//
// Los packing lists traen una tabla con el SKU, la cantidad, el número de caja («Carton», «CTN No.»), las medidas
// (L, W, H en cm), el volumen (CBM) y el peso de la caja. Una caja puede traer varios SKU: el número de caja va en el
// primer renglón y los de abajo quedan vacíos (o la celda está combinada: se lee el mismo número). El peso y el CBM
// son de la caja entera y se repiten en cada renglón de esa caja.
// Un renglón puede ser varias cajas iguales («1-20», «45,46»): la cantidad se toma como el total de esos renglones
// (salvo que el título diga «por caja», «/CTN») y se reparte entre las cajas; el peso y el CBM, como de cada caja
// (salvo que el título diga «total»).

import { numeroInvoice, ES_SKU_PROPIO, type Celda } from "@/lib/compras/invoice-leer";

export type ItemPacking = { fila: number; sku: string; descripcion: string | null; cantidad: number };
export type CajaPacking = {
  numero: number; peso_kg: number | null; cbm: number | null; largo_cm: number | null; ancho_cm: number | null; alto_cm: number | null;
  items: ItemPacking[];
};
export type PackingLeido = { cajas: CajaPacking[]; avisos: string[]; total: { unidades: number; peso_kg: number; cbm: number } };

const normal = (v: Celda): string =>
  v == null ? "" : String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const T_CAJA = /^(carton|cartons|ctn|ctns|ctn ?no\.?|c\/no\.?|carton ?no\.?|box|box ?no\.?|caja|cajas|bulto|箱号|箱号码)\b/;
const T_CANT = /^(qty|q'?ty|quantity|pcs|cantidad|cant\.?|units?|unidades|total ?qty|total ?pcs|数量)\b/;
const T_POR_CAJA = /(\/ ?ctn|per ?ctn|per ?carton|por caja|pcs\/ctn|qty\/ctn|每箱)/;
const T_PESO = /^(weight|g\.? ?w\.?|gross ?weight|n\.? ?w\.?|net ?weight|peso|kg|kgs|毛重|净重)\b/;
const T_CBM = /^(cbm|meas|measurement|volume|volumen|m3|体积)\b/;
const T_TOTAL = /total|ttl/;
const T_DESC = /^(product|description|descripcion|producto|name|item ?name|品名|名称)\b/;
const T_SKU = /^(sku|item ?no\.?|model|codigo|code|货号|型号)\b/;

/** Los números de caja de una celda: «12», «1-20», «45,46», «3~5». */
export function numerosDeCaja(v: Celda): number[] {
  if (v == null || v === "") return [];
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? [v] : [];
  const t = String(v).replace(/\s+/g, "");
  const salida: number[] = [];
  for (const parte of t.split(/[,;/]/)) {
    const r = parte.match(/^(\d+)[-~](\d+)$/);
    if (r) {
      const a = Number(r[1]), b = Number(r[2]);
      if (b >= a && b - a < 2000) for (let i = a; i <= b; i++) salida.push(i);
      continue;
    }
    if (/^\d+$/.test(parte)) salida.push(Number(parte));
  }
  return salida;
}

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export function leerPacking(filas: Celda[][]): PackingLeido {
  const avisos: string[] = [];
  // El renglón de títulos: el primero con caja y cantidad.
  let cab = -1;
  let c = { sku: -1, cant: -1, caja: -1, peso: -1, cbm: -1, desc: -1, l: -1, w: -1, h: -1 };
  let cantPorCaja = false, pesoTotal = false, cbmTotal = false;
  for (let i = 0; i < Math.min(filas.length, 60) && cab < 0; i++) {
    const t = filas[i].map(normal);
    const caja = t.findIndex((x) => T_CAJA.test(x));
    const cant = t.findIndex((x) => T_CANT.test(x));
    if (caja < 0 || cant < 0) continue;
    const debajo = filas.slice(i + 1, i + 300);
    let sku = -1, mejor = 0;
    t.forEach((_, k) => {
      if (k === caja || k === cant) return;
      const n = debajo.filter((f) => ES_SKU_PROPIO.test(String(f[k] ?? "").trim())).length;
      if (n > mejor) { mejor = n; sku = k; }
    });
    if (sku < 0) sku = t.findIndex((x, k) => k !== caja && T_SKU.test(x));
    if (sku < 0) continue;
    const idx = (re: RegExp) => t.findIndex((x, k) => k !== sku && k !== caja && k !== cant && re.test(x));
    // L, W, H: tres columnas seguidas con esas letras (o largo, ancho, alto).
    const l = t.findIndex((x) => /^(l|length|largo)$/.test(x.replace(/\(.*\)/, "").trim()));
    const w = t.findIndex((x) => /^(w|width|ancho)$/.test(x.replace(/\(.*\)/, "").trim()));
    const h = t.findIndex((x) => /^(h|height|alto)$/.test(x.replace(/\(.*\)/, "").trim()));
    c = { sku, cant, caja, peso: idx(T_PESO), cbm: idx(T_CBM), desc: idx(T_DESC), l, w, h };
    cantPorCaja = T_POR_CAJA.test(t[cant]);
    pesoTotal = c.peso >= 0 && T_TOTAL.test(t[c.peso]);
    cbmTotal = c.cbm >= 0 && T_TOTAL.test(t[c.cbm]);
    cab = i;
  }
  if (cab < 0) {
    return { cajas: [], avisos: ["No encontré la tabla: hace falta un renglón de títulos con la caja («Carton», «CTN»), la cantidad («QTY») y el SKU."], total: { unidades: 0, peso_kg: 0, cbm: 0 } };
  }

  const cajas = new Map<number, CajaPacking>();
  let actuales: number[] = [];
  let vacias = 0;
  let pieUnidades: number | null = null, piePeso: number | null = null;
  for (let i = cab + 1; i < filas.length; i++) {
    const f = filas[i];
    const sku = f[c.sku] == null ? "" : String(f[c.sku]).replace(/\s+/g, " ").trim();
    const cant = numeroInvoice(f[c.cant]);
    if (!f.some((x) => x != null && x !== "")) { if (++vacias >= 3 && cajas.size) break; continue; }
    vacias = 0;
    if (!sku) {
      // El pie con los totales: sin SKU y con la cantidad total.
      if (cant != null && cajas.size) { pieUnidades = cant; piePeso = c.peso >= 0 ? numeroInvoice(f[c.peso]) : null; break; }
      continue;
    }
    if (cant == null || cant <= 0) continue;
    const nums = numerosDeCaja(f[c.caja]);
    if (nums.length) actuales = nums;
    if (!actuales.length) { avisos.push(`Fila ${i + 1} (${sku}): no tiene número de caja y no hay una caja arriba.`); continue; }
    const n = actuales.length;
    const num = (k: number) => (k >= 0 ? numeroInvoice(f[k]) : null);
    const peso = num(c.peso), cbm = num(c.cbm), l = num(c.l), w = num(c.w), h = num(c.h);
    const total = cantPorCaja ? cant * n : cant;
    const base = Math.floor(total / n), resto = total - base * n;
    if (n > 1 && resto) avisos.push(`Fila ${i + 1} (${sku}): ${total} unidades en ${n} cajas no da justo; las ${resto} que sobran van en las primeras.`);
    actuales.forEach((numero, k) => {
      let caja = cajas.get(numero);
      if (!caja) {
        caja = {
          numero, items: [],
          peso_kg: peso != null ? redondear(pesoTotal ? peso / n : peso, 3) : null,
          cbm: cbm != null ? redondear(cbmTotal ? cbm / n : cbm, 6) : l && w && h ? redondear((l * w * h) / 1e6, 6) : null,
          largo_cm: l, ancho_cm: w, alto_cm: h,
        };
        cajas.set(numero, caja);
      }
      const u = base + (k < resto ? 1 : 0);
      if (u > 0) {
        caja.items.push({ fila: i + 1, sku: sku.slice(0, 80), descripcion: c.desc >= 0 && f[c.desc] != null ? String(f[c.desc]).replace(/\s+/g, " ").trim().slice(0, 300) || null : null, cantidad: u });
      }
    });
  }
  const lista = [...cajas.values()].sort((a, b) => a.numero - b.numero);
  const total = {
    unidades: lista.reduce((t, x) => t + x.items.reduce((s, i) => s + i.cantidad, 0), 0),
    peso_kg: redondear(lista.reduce((t, x) => t + (x.peso_kg ?? 0), 0), 3),
    cbm: redondear(lista.reduce((t, x) => t + (x.cbm ?? 0), 0), 6),
  };
  if (!lista.length) avisos.push("Encontré los títulos pero ninguna caja con productos.");
  if (pieUnidades != null && Math.abs(pieUnidades - total.unidades) > 0.5) avisos.push(`El pie dice ${pieUnidades} unidades y las cajas suman ${total.unidades}: revisalo.`);
  if (piePeso != null && Math.abs(piePeso - total.peso_kg) > Math.max(0.5, piePeso * 0.01)) avisos.push(`El pie dice ${piePeso} kg y las cajas suman ${total.peso_kg} kg: revisá el peso.`);
  const sinPeso = lista.filter((x) => x.peso_kg == null).length;
  if (sinPeso) avisos.push(`${sinPeso} caja${sinPeso === 1 ? "" : "s"} sin peso.`);
  return { cajas: lista, avisos, total };
}

/** Peso y CBM por unidad de cada SKU (como Laucen guardaba siempre los packing lists): exacto si el SKU tiene cajas
 *  propias (sólo esas cuentan: peso y CBM de la caja ÷ unidades); aproximado si sólo vino en cajas mezcladas (la caja
 *  se reparte entre todas sus unidades por partes iguales). */
export function porUnidad(cajas: CajaPacking[]): { sku: string; cantidad: number; peso_kg: number; cbm: number; exacto: boolean; cajas: string }[] {
  type Acum = { cantidad: number; peso: number; cbm: number; cajas: number[] };
  const propias = new Map<string, Acum>(), mezcladas = new Map<string, Acum>();
  for (const caja of cajas) {
    const unidades = caja.items.reduce((t, i) => t + i.cantidad, 0);
    if (!unidades) continue;
    const skus = new Set(caja.items.map((i) => i.sku.toUpperCase()));
    const destino = skus.size === 1 ? propias : mezcladas;
    for (const i of caja.items) {
      const k = i.sku.toUpperCase();
      const a = destino.get(k) ?? { cantidad: 0, peso: 0, cbm: 0, cajas: [] };
      const parte = i.cantidad / unidades;
      a.cantidad += i.cantidad; a.peso += (caja.peso_kg ?? 0) * parte; a.cbm += (caja.cbm ?? 0) * parte;
      if (!a.cajas.includes(caja.numero)) a.cajas.push(caja.numero);
      destino.set(k, a);
    }
  }
  const salida: { sku: string; cantidad: number; peso_kg: number; cbm: number; exacto: boolean; cajas: string }[] = [];
  for (const k of new Set([...propias.keys(), ...mezcladas.keys()])) {
    const exacto = propias.has(k);
    const a = (exacto ? propias.get(k) : mezcladas.get(k))!;
    salida.push({ sku: k, cantidad: a.cantidad, peso_kg: redondear(a.peso, 4), cbm: redondear(a.cbm, 6), exacto, cajas: a.cajas.join(",") });
  }
  return salida;
}
