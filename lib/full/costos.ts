// Costos de Full (db/full.sql; Fer 22/10, bitácora #715/#720/#724).
//
// 1. Lo cobrado: cada día de proceso se piden a ML los cargos de Full de los períodos de facturación
//    cerrados de cada cuenta (GET /billing/integration/periods/key/{AAAA-MM-01}/group/ML/full/details,
//    5 pedidos por minuto; el período abierto da 400 y se reintenta). Almacenamiento viene por día y
//    por tarifa, sin producto; colecta, por producto y envío.
// 2. La foto diaria (fotoStockDia, la saca la lectura de Full): cuántas unidades de cada producto había
//    en el depósito Full de la cuenta y su tamaño.
// 3. El reparto (recalcularCostosFull): el almacenamiento cobrado un día con una tarifa se reparte entre
//    los productos de ese tamaño que había ese día, por unidades (el total da lo cobrado). Los días que
//    ML todavía no facturó se estiman: unidades × tarifa del tamaño. Por mes y producto queda el costo,
//    las unidades vendidas desde Full y lo que le toca a cada una; un mes sin ventas pasa al siguiente.
// 4. La colecta cobrada por producto se guarda en la línea del envío (por número de envío de ML), y la
//    rentabilidad la suma al flete.

import { consulta, una, enTransaccion } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";

export type Tamano = "pequeno" | "mediano" | "grande" | "extragrande";
export const TAMANOS: Record<Tamano, { texto: string; medidas: string; lados: [number, number, number] | null }> = {
  pequeno: { texto: "Pequeño", medidas: "hasta 15 × 20 × 20 cm y 12 kg", lados: [15, 20, 20] },
  mediano: { texto: "Mediano", medidas: "hasta 28 × 36 × 51 cm y 12 kg", lados: [28, 36, 51] },
  grande: { texto: "Grande", medidas: "hasta 60 × 70 × 80 cm y 12 kg", lados: [60, 70, 80] },
  extragrande: { texto: "Extragrande", medidas: "más de 60 × 70 × 80 cm o más de 12 kg", lados: null },
};
export const ORDEN_TAMANOS: Tamano[] = ["pequeno", "mediano", "grande", "extragrande"];
export const esTamano = (x: unknown): x is Tamano => typeof x === "string" && Object.hasOwn(TAMANOS, x);
const PESO_MAXIMO_KG = 12;

export type Tarifa = { tamano: Tamano; almacenamiento_dia: number; antiguo_4_6: number; antiguo_6_12: number; antiguo_12: number; retiro: number; actualizado_ts?: Date };

/** Las de la ayuda de ML (mercadolibre.com.ar/ayuda/24253, 15373 y 16645), leídas el 22/10/2026. */
export const TARIFAS_DEFECTO: Tarifa[] = [
  { tamano: "pequeno", almacenamiento_dia: 0.75, antiguo_4_6: 350, antiguo_6_12: 3250, antiguo_12: 7900, retiro: 595 },
  { tamano: "mediano", almacenamiento_dia: 2.4, antiguo_4_6: 470, antiguo_6_12: 4485, antiguo_12: 10930, retiro: 910 },
  { tamano: "grande", almacenamiento_dia: 20, antiguo_4_6: 1355, antiguo_6_12: 18280, antiguo_12: 39365, retiro: 3500 },
  { tamano: "extragrande", almacenamiento_dia: 65, antiguo_4_6: 4680, antiguo_6_12: 47840, antiguo_12: 92400, retiro: 4050 },
];

/** Desde cuántos días en Full ML cobra stock antiguo. */
export const DIAS_STOCK_ANTIGUO = 120;

/** El tamaño de Full según los lados (cm, en cualquier orden) y el peso (kg). Sin algún dato, null. */
export function tamanoDe(lados: (number | null | undefined)[], pesoKg: number | null | undefined): Tamano | null {
  const l = lados.map(Number);
  if (l.length !== 3 || l.some((x) => !(x > 0)) || !(Number(pesoKg) > 0)) return null;
  if (Number(pesoKg) > PESO_MAXIMO_KG) return "extragrande";
  const o = [...l].sort((a, b) => a - b);
  for (const t of ORDEN_TAMANOS) {
    const lim = TAMANOS[t].lados;
    if (lim && o.every((x, i) => x <= lim[i])) return t;
  }
  return "extragrande";
}

/** "60.2 cm" → 60,2 (en cm); "14700 g" → 14,7 (en kg). */
export function medida(valor: unknown): number | null {
  const m = String(valor ?? "").trim().replace(",", ".").match(/^([\d.]+)\s*(mm|cm|m|g|kg)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = (m[2] ?? "").toLowerCase();
  return u === "mm" ? n / 10 : u === "m" ? n * 100 : u === "g" ? n / 1000 : n;
}

/** La tarifa a la que corresponde un cargo de almacenamiento: la más cercana (en proporción) a lo que
 *  cobró por unidad y por día (así también ubica tarifas viejas: 0,67 → Pequeño, 60 → Extragrande). */
export function tamanoDeTarifa(porUnidad: number, tarifas: Tarifa[]): Tamano | null {
  if (!(porUnidad > 0) || !tarifas.length) return null;
  let mejor: Tarifa | null = null, dist = Infinity;
  for (const t of tarifas) {
    if (!(t.almacenamiento_dia > 0)) continue;
    const d = Math.abs(Math.log(porUnidad / t.almacenamiento_dia));
    if (d < dist) { dist = d; mejor = t; }
  }
  return mejor?.tamano ?? null;
}

// ── Tarifas ──────────────────────────────────────────────

export async function tarifas(org: string): Promise<Tarifa[]> {
  await consulta(`
    insert into full_tarifa (organizacion_id, tamano, almacenamiento_dia, antiguo_4_6, antiguo_6_12, antiguo_12, retiro)
    select $1, t.tamano, t.almacenamiento_dia, t.antiguo_4_6, t.antiguo_6_12, t.antiguo_12, t.retiro
      from jsonb_to_recordset($2::jsonb) t(tamano text, almacenamiento_dia numeric, antiguo_4_6 numeric, antiguo_6_12 numeric, antiguo_12 numeric, retiro numeric)
    on conflict do nothing`, [org, JSON.stringify(TARIFAS_DEFECTO)]);
  const filas = await consulta<Tarifa>(`
    select tamano, almacenamiento_dia::float, antiguo_4_6::float, antiguo_6_12::float, antiguo_12::float, retiro::float, actualizado_ts
      from full_tarifa where organizacion_id = $1`, [org]);
  return ORDEN_TAMANOS.map((t) => filas.find((f) => f.tamano === t)!).filter(Boolean);
}

export async function guardarTarifa(org: string, t: Tarifa) {
  await tarifas(org);
  await consulta(`update full_tarifa set almacenamiento_dia = $3, antiguo_4_6 = $4, antiguo_6_12 = $5, antiguo_12 = $6, retiro = $7, actualizado_ts = now()
                   where organizacion_id = $1 and tamano = $2`,
    [org, t.tamano, t.almacenamiento_dia, t.antiguo_4_6, t.antiguo_6_12, t.antiguo_12, t.retiro]);
}

// ── Tamaño de cada producto ──────────────────────────────

export type TamanoProducto = { ml: Tamano | null; ficha: Tamano | null; usado: Tamano | null };

/** El tamaño de Full de cada variación en una cuenta: el de las medidas que tomó ML del paquete (en sus
 *  publicaciones de la cuenta); si ML no lo midió, el de las medidas declaradas en ML; y el de la ficha
 *  del producto. `usado`: el de ML si lo hay, si no el de la ficha. */
export async function tamanosDe(org: string, canal: number, variaciones: number[]): Promise<Map<number, TamanoProducto>> {
  const out = new Map<number, TamanoProducto>();
  if (!variaciones.length) return out;
  const filas = await consulta<{ v: number; attrs: Record<string, string> | null; logistica: string | null; largo: number | null; ancho: number | null; alto: number | null; peso_g: number | null }>(`
    select v.id::int v, pr.largo_cm::float largo, pr.ancho_cm::float ancho, pr.alto_cm::float alto, pr.peso_g::float peso_g, mi.logistica,
           (select jsonb_object_agg(a ->> 'id', a ->> 'value_name') from jsonb_array_elements(coalesce(mi.datos_externos -> 'ml' -> 'attributes', '[]')) a
             where a ->> 'id' like '%PACKAGE_%') attrs
      from variacion v join producto pr on pr.id = v.producto_id
      left join publicacion pu on pu.variacion_id = v.id and pu.canal_id = $2
      left join meli_item mi on mi.publicacion_id = pu.id and coalesce(mi.estado, '') <> 'closed'
     where v.organizacion_id = $1 and v.id = any($3::bigint[])
     order by v.id, (mi.logistica = 'fulfillment') desc nulls last`, [org, canal, variaciones]);
  for (const f of filas) {
    const a = f.attrs ?? {};
    const medidoMl = tamanoDe([medida(a.PACKAGE_WIDTH), medida(a.PACKAGE_HEIGHT), medida(a.PACKAGE_LENGTH)], medida(a.PACKAGE_WEIGHT));
    const declaradoMl = tamanoDe([medida(a.SELLER_PACKAGE_WIDTH), medida(a.SELLER_PACKAGE_HEIGHT), medida(a.SELLER_PACKAGE_LENGTH)], medida(a.SELLER_PACKAGE_WEIGHT));
    const ficha = tamanoDe([f.largo, f.ancho, f.alto], f.peso_g != null ? f.peso_g / 1000 : null);
    const ya = out.get(f.v);
    const mlT = ya?.ml ?? medidoMl ?? declaradoMl;
    out.set(f.v, { ml: mlT, ficha, usado: mlT ?? ficha });
  }
  return out;
}

// ── Foto diaria ──────────────────────────────────────────

/** Anota cuántas unidades de cada producto hay hoy en el depósito Full de la cuenta (queda la mayor del día). */
export async function fotoStockDia(org: string, canal: number, deposito: number): Promise<number> {
  const hay = await consulta<{ v: number; n: number }>(`
    select s.variacion_id::int v, sum(s.cantidad)::int n from stock s join ubicacion u on u.id = s.ubicacion_id
     where u.deposito_id = $1 and s.organizacion_id = $2 group by s.variacion_id having sum(s.cantidad) > 0`, [deposito, org]);
  if (!hay.length) return 0;
  const tam = await tamanosDe(org, canal, hay.map((h) => h.v));
  await consulta(`
    insert into full_stock_dia (organizacion_id, canal_id, variacion_id, fecha, unidades, tamano)
    select $1, $2, x.v, (now() at time zone 'America/Argentina/Buenos_Aires')::date, x.n, x.t
      from unnest($3::bigint[], $4::int[], $5::text[]) x(v, n, t)
    on conflict (canal_id, variacion_id, fecha) do update set unidades = greatest(full_stock_dia.unidades, excluded.unidades), tamano = excluded.tamano`,
    [org, canal, hay.map((h) => h.v), hay.map((h) => h.n), hay.map((h) => tam.get(h.v)?.usado ?? null)]);
  return hay.length;
}

// ── Lectura de lo cobrado ────────────────────────────────

/** Los meses que ML deja leer (los últimos 12) en formato del período (AAAA-MM-01), del más nuevo al más viejo. */
export function periodosLeibles(hoy = new Date()): string[] {
  const out: string[] = [];
  const base = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Qué período falta leer de cada cuenta: los nunca leídos (salvo los que ML ya no deja), los abiertos y
 *  los dos últimos (el que corre contesta 200 vacío y se va llenando) cada 12 h, y los que dieron error cada 6 h. */
async function pendientes(org: string | null, canal?: number) {
  return consulta<{ organizacion_id: string; canal_id: number; periodo: string }>(`
    select c.organizacion_id, c.id::int canal_id, to_char(p.periodo, 'YYYY-MM-DD') periodo
      from canal c cross join unnest($3::date[]) p(periodo)
      left join full_cargo_lectura l on l.canal_id = c.id and l.periodo = p.periodo
     where c.tipo = 'mercadolibre' and c.estado = 'activo' and ($1::text is null or c.organizacion_id = $1) and ($2::bigint is null or c.id = $2)
       and (l.estado is null
            or ((l.estado = 'abierto' or (l.estado = 'ok' and p.periodo >= $4::date)) and l.leido_ts < now() - interval '12 hours')
            or (l.estado = 'error' and l.leido_ts < now() - interval '6 hours'))
     order by p.periodo desc, c.id`, [org, canal ?? null, periodosLeibles(), periodosLeibles()[1]]);
}

export async function hayCargosFullPendientes(): Promise<boolean> {
  return (await pendientes(null)).length > 0;
}

type CargoMl = {
  charge_info?: { detail_id?: number; creation_date_time?: string; detail_sub_type?: string; transaction_detail?: string; detail_amount?: number; detail_type?: string };
  fulfillment_info?: { type?: string; quantity?: number; amount_per_unit?: number; amount?: number; inventory_id?: string | null; item_id?: string | null;
    sku?: string | null; inbound_id?: number | string | null; volume_total?: number | null };
};

/** Lee de ML los cargos de Full que falten (a lo sumo `maxPedidos`, por el límite de 5 por minuto). */
export async function leerCargosFull(org: string | null, hastaMs: number, opts: { canal?: number; maxPedidos?: number } = {}): Promise<{ periodos: number; cargos: number; abiertos: number; errores: number }> {
  const res = { periodos: 0, cargos: 0, abiertos: 0, errores: 0 };
  let pedidos = 0;
  const max = opts.maxPedidos ?? 4;
  const tocadas = new Set<string>();
  for (const p of await pendientes(org, opts.canal)) {
    if (Date.now() > hastaMs || pedidos >= max) break;
    const cuenta = await cuentaDelCanal(p.organizacion_id, p.canal_id);
    if (!cuenta || cuenta.estado !== "activa") continue;
    const filas: CargoMl[] = [];
    let offset = 0, estado = "ok", error: string | null = null;
    for (;;) {
      if (pedidos >= max) { estado = "cortado"; break; }
      pedidos++;
      const r = await ml<{ total?: number; results?: CargoMl[]; message?: string }>(cuenta, "GET",
        `/billing/integration/periods/key/${p.periodo}/group/ML/full/details?document_type=BILL&offset=${offset}&limit=200`);
      if (r.status === 429) { estado = "cortado"; break; }
      // 400: el período todavía no cerró; en uno viejo, ML no lo da (como el 404).
      if (r.status === 400) { estado = p.periodo >= periodosLeibles()[1] ? "abierto" : "fuera"; break; }
      if (r.status === 404) { estado = "fuera"; break; }
      if (r.status !== 200) { estado = "error"; error = `ML contestó ${r.status}`; break; }
      const lista = Array.isArray(r.datos?.results) ? r.datos.results : [];
      filas.push(...lista);
      offset += lista.length;
      if (!lista.length || offset >= Number(r.datos?.total ?? 0)) break;
    }
    if (estado === "cortado") break; // se sigue en la próxima vuelta
    if (estado === "ok") {
      await enTransaccion(async (c) => {
        for (const f of filas) {
          const ci = f.charge_info ?? {}, fi = f.fulfillment_info ?? {};
          if (!ci.detail_id) continue;
          await c.query(`
            insert into full_cargo (organizacion_id, canal_id, periodo, detalle_id, fecha, tipo, subtipo, descripcion, cantidad, por_unidad, monto,
                                    inventory_id, item_id, sku, envio_ml, volumen_m3, datos)
            values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
            on conflict (canal_id, detalle_id) do nothing`,
            [p.organizacion_id, p.canal_id, p.periodo, ci.detail_id, String(ci.creation_date_time ?? p.periodo).slice(0, 10),
              fi.type ?? ci.detail_sub_type ?? "OTRO", ci.detail_sub_type ?? null, ci.transaction_detail ?? null,
              fi.quantity ?? null, fi.amount_per_unit ?? null, Number(fi.amount ?? ci.detail_amount ?? 0) * (ci.detail_type && ci.detail_type !== "CHARGE" ? -1 : 1),
              fi.inventory_id ?? null, fi.item_id ?? null, fi.sku ?? null, fi.inbound_id != null ? String(fi.inbound_id) : null, fi.volume_total ?? null, JSON.stringify(f)]);
        }
      });
      res.cargos += filas.length;
    }
    if (estado === "abierto") res.abiertos++;
    if (estado === "error") res.errores++;
    await consulta(`
      insert into full_cargo_lectura (organizacion_id, canal_id, periodo, estado, cargos, error, leido_ts) values ($1, $2, $3, $4, $5, $6, now())
      on conflict (canal_id, periodo) do update set estado = excluded.estado, cargos = excluded.cargos, error = excluded.error, leido_ts = now()`,
      [p.organizacion_id, p.canal_id, p.periodo, estado, filas.length, error]);
    res.periodos++;
    if (filas.length) tocadas.add(p.organizacion_id);
  }
  for (const o of tocadas) await recalcularCostosFull(o);
  return res;
}

// ── Reparto ──────────────────────────────────────────────

const diaMas = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Los días que cubre cada período de facturación leído: el de la facturación de ML si Laucen lo tiene;
 *  si no, del día anterior al 1.º hasta tres días antes del 1.º del mes siguiente (así vienen los de ML). */
async function diasFacturados(canal: number): Promise<{ desde: string; hasta: string }[]> {
  const filas = await consulta<{ desde: string; hasta: string }>(`
    select to_char(coalesce(fp.desde, l.periodo - 1), 'YYYY-MM-DD') desde,
           to_char(coalesce(fp.hasta, (l.periodo + interval '1 month')::date - 3), 'YYYY-MM-DD') hasta
      from full_cargo_lectura l
      left join ml_factura_periodo fp on fp.canal_id = l.canal_id and fp.grupo = 'ML' and fp.clave = to_char(l.periodo, 'YYYY-MM-DD')
     where l.canal_id = $1 and l.estado = 'ok'`, [canal]).catch(() => []);
  return filas;
}

export type ResultadoReparto = { canales: number; productos: number; meses: number };

/** Recalcula el costo de Full por producto y mes de las cuentas de la organización (ver arriba). */
export async function recalcularCostosFull(org: string, canalSolo?: number): Promise<ResultadoReparto> {
  const out: ResultadoReparto = { canales: 0, productos: 0, meses: 0 };
  const tars = await tarifas(org);
  const tarifaDe = new Map(tars.map((t) => [t.tamano, t.almacenamiento_dia]));
  const canales = await consulta<{ canal_id: number; deposito: number | null }>(`
    select c.id::int canal_id, (select d.id::int from canal_deposito cd join deposito d on d.id = cd.deposito_id
                                 where cd.canal_id = c.id and d.tipo = 'full_ml' order by cd.prioridad limit 1) deposito
      from canal c where c.organizacion_id = $1 and c.tipo = 'mercadolibre' and ($2::bigint is null or c.id = $2)
       and (exists (select 1 from full_stock_dia f where f.canal_id = c.id) or exists (select 1 from full_cargo g where g.canal_id = c.id))`,
    [org, canalSolo ?? null]);
  for (const { canal_id: canal, deposito } of canales) {
    out.canales++;
    const fotos = await consulta<{ v: number; fecha: string; n: number; t: Tamano | null }>(
      "select variacion_id::int v, to_char(fecha, 'YYYY-MM-DD') fecha, unidades n, tamano t from full_stock_dia where canal_id = $1 order by fecha", [canal]);
    const cargos = await consulta<{ fecha: string; tipo: string; por_unidad: number | null; monto: number; inventory_id: string | null }>(
      "select to_char(fecha, 'YYYY-MM-DD') fecha, tipo, por_unidad::float, monto::float, inventory_id from full_cargo where canal_id = $1", [canal]);
    const varDeCodigo = new Map((await consulta<{ inv: string; v: number }>(
      "select inventory_id inv, variacion_id::int v from full_stock where canal_id = $1 and variacion_id is not null", [canal])).map((x) => [x.inv, x.v]));
    const facturados = await diasFacturados(canal);
    const facturado = (d: string) => facturados.some((p) => d >= p.desde && d <= p.hasta);

    // Por variación y mes: [almacenamiento real, estimado, otros, unidades·día].
    const acum = new Map<string, { real: number; est: number; otros: number; ud: number }>();
    const sumar = (v: number, d: string, k: "real" | "est" | "otros" | "ud", x: number) => {
      const key = `${v}|${d.slice(0, 7)}-01`;
      const a = acum.get(key) ?? { real: 0, est: 0, otros: 0, ud: 0 };
      a[k] += x; acum.set(key, a);
    };
    const fotosDe = new Map<string, typeof fotos>();
    for (const f of fotos) { (fotosDe.get(f.fecha) ?? fotosDe.set(f.fecha, []).get(f.fecha)!).push(f); sumar(f.v, f.fecha, "ud", f.n); }
    // Lo cobrado de almacenamiento: a los productos de ese tamaño que había ese día (o el anterior).
    for (const c of cargos.filter((x) => x.tipo === "WAREHOUSING")) {
      const del = fotosDe.get(c.fecha) ?? fotosDe.get(diaMas(c.fecha, -1)) ?? [];
      const t = tamanoDeTarifa(Number(c.por_unidad), tars);
      const mismos = del.filter((f) => f.t === t);
      const entre = mismos.length ? mismos : del;
      const total = entre.reduce((s, f) => s + f.n, 0);
      for (const f of entre) if (total) sumar(f.v, c.fecha, "real", (c.monto * f.n) / total);
    }
    // Los días que ML todavía no facturó: estimado.
    for (const f of fotos) if (!facturado(f.fecha) && f.t) sumar(f.v, f.fecha, "est", f.n * (tarifaDe.get(f.t) ?? 0));
    // Otros cargos con producto (stock antiguo, retiros…). La colecta va a la línea del envío.
    for (const c of cargos.filter((x) => x.tipo !== "WAREHOUSING" && x.tipo !== "INBOUND_COLLECT" && x.inventory_id)) {
      const v = varDeCodigo.get(c.inventory_id!);
      if (v) sumar(v, c.fecha, "otros", c.monto);
    }
    // Unidades vendidas desde el depósito Full, por mes.
    const vendidas = deposito ? await consulta<{ v: number; mes: string; n: number }>(`
      select l.variacion_id::int v, to_char(date_trunc('month', p.fecha at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD') mes, sum(l.cantidad)::int n
        from pedido p join pedido_linea l on l.pedido_id = p.id
       where p.organizacion_id = $1 and p.deposito_id = $2 and l.variacion_id is not null and p.estado not in ('presupuesto', 'nuevo', 'cancelado', 'devuelto')
       group by 1, 2`, [org, deposito]) : [];
    const vendDe = new Map(vendidas.map((x) => [`${x.v}|${x.mes}`, x.n]));
    for (const x of vendidas) if (!acum.has(`${x.v}|${x.mes}`)) acum.set(`${x.v}|${x.mes}`, { real: 0, est: 0, otros: 0, ud: 0 });

    // Por variación, mes a mes, con arrastre.
    const porVar = new Map<number, string[]>();
    for (const k of acum.keys()) { const [v, mes] = k.split("|"); (porVar.get(Number(v)) ?? porVar.set(Number(v), []).get(Number(v))!).push(mes); }
    const filas: { v: number; mes: string; real: number; est: number; otros: number; ud: number; vend: number; arr: number; pu: number | null }[] = [];
    for (const [v, meses] of porVar) {
      let arrastre = 0;
      for (const mes of meses.sort()) {
        const a = acum.get(`${v}|${mes}`)!;
        const vend = vendDe.get(`${v}|${mes}`) ?? 0;
        const total = arrastre + a.real + a.est + a.otros;
        const pu = vend > 0 ? Math.round((total / vend) * 10000) / 10000 : null;
        filas.push({ v, mes, ...a, vend, arr: Math.round(arrastre * 100) / 100, pu });
        arrastre = vend > 0 ? 0 : total;
      }
    }
    await enTransaccion(async (c) => {
      await c.query("delete from full_costo_mes where canal_id = $1", [canal]);
      if (filas.length) await c.query(`
        insert into full_costo_mes (organizacion_id, canal_id, variacion_id, mes, almacenamiento, estimado, otros, unidades_dia, vendidas, arrastre, por_unidad)
        select $1, $2, x.v, x.mes::date, x.real, x.est, x.otros, x.ud, x.vend, x.arr, x.pu
          from jsonb_to_recordset($3::jsonb) x(v bigint, mes text, real numeric, est numeric, otros numeric, ud int, vend int, arr numeric, pu numeric)`,
        [org, canal, JSON.stringify(filas.map((f) => ({ ...f, real: Math.round(f.real * 100) / 100, est: Math.round(f.est * 100) / 100, otros: Math.round(f.otros * 100) / 100 })))]);
      // La colecta cobrada, en la línea del envío (por número de envío de ML y producto).
      await c.query(`
        update full_envio_linea l set colecta_unit_ars = x.por_unidad
          from (select g.envio_ml, coalesce(fs.variacion_id, (select pu.variacion_id from meli_item mi join publicacion pu on pu.id = mi.publicacion_id
                                                               where mi.canal_id = g.canal_id and mi.item_id = g.item_id limit 1)) variacion_id,
                       sum(g.monto) / nullif(sum(g.cantidad), 0) por_unidad
                  from full_cargo g left join full_stock fs on fs.canal_id = g.canal_id and fs.inventory_id = g.inventory_id
                 where g.canal_id = $1 and g.tipo = 'INBOUND_COLLECT' and g.envio_ml is not null
                 group by 1, 2) x, full_envio e
         where e.id = l.envio_id and e.canal_id = $1 and trim(e.numero_ml) = x.envio_ml and l.variacion_id = x.variacion_id`, [canal]);
    });
    out.productos += porVar.size; out.meses += filas.length;
  }
  return out;
}

// ── Para las pantallas ───────────────────────────────────

export type ResumenMes = { canal_id: number; cuenta: string; mes: string; almacenamiento: number; colecta: number; otros: number; estimado: number; asignado: number; periodo_leido: boolean };

/** Por cuenta y mes: lo cobrado por ML (almacenamiento, colecta, otros), lo estimado y lo que quedó repartido en productos. */
export async function resumenPorMes(org: string): Promise<ResumenMes[]> {
  return consulta<ResumenMes>(`
    with cobrado as (
      select canal_id, to_char(date_trunc('month', fecha), 'YYYY-MM-DD') mes,
             sum(monto) filter (where tipo = 'WAREHOUSING')::float almacenamiento, sum(monto) filter (where tipo = 'INBOUND_COLLECT')::float colecta,
             sum(monto) filter (where tipo not in ('WAREHOUSING', 'INBOUND_COLLECT'))::float otros
        from full_cargo where organizacion_id = $1 group by 1, 2
    ), costo as (
      select canal_id, to_char(mes, 'YYYY-MM-DD') mes, sum(estimado)::float estimado, sum(almacenamiento + otros)::float asignado
        from full_costo_mes where organizacion_id = $1 group by 1, 2
    )
    select coalesce(a.canal_id, b.canal_id)::int canal_id, c.nombre cuenta, coalesce(a.mes, b.mes) mes,
           coalesce(a.almacenamiento, 0) almacenamiento, coalesce(a.colecta, 0) colecta, coalesce(a.otros, 0) otros,
           coalesce(b.estimado, 0) estimado, coalesce(b.asignado, 0) asignado, a.canal_id is not null periodo_leido
      from cobrado a full join costo b on b.canal_id = a.canal_id and b.mes = a.mes
      join canal c on c.id = coalesce(a.canal_id, b.canal_id)
     order by mes desc, cuenta`, [org]);
}

/** Cargos de almacenamiento del último período leído cuyo precio por unidad no coincide con ninguna tarifa cargada (±2 %). */
export async function tarifasDistintas(org: string): Promise<{ cuenta: string; por_unidad: number; fecha: string }[]> {
  const tars = await tarifas(org);
  const ult = await consulta<{ cuenta: string; por_unidad: number; fecha: string }>(`
    select distinct on (g.canal_id, g.por_unidad) c.nombre cuenta, g.por_unidad::float, to_char(max(g.fecha) over (partition by g.canal_id, g.por_unidad), 'YYYY-MM-DD') fecha
      from full_cargo g join canal c on c.id = g.canal_id
     where g.organizacion_id = $1 and g.tipo = 'WAREHOUSING'
       and g.periodo = (select max(periodo) from full_cargo x where x.canal_id = g.canal_id)`, [org]);
  return ult.filter((u) => !tars.some((t) => Math.abs(u.por_unidad / t.almacenamiento_dia - 1) <= 0.02));
}

/** La fecha de la última lectura de cargos de Full de la organización. */
export async function ultimaLecturaCargos(org: string): Promise<Date | null> {
  return (await una<{ t: Date | null }>("select max(leido_ts) t from full_cargo_lectura where organizacion_id = $1", [org]))?.t ?? null;
}
