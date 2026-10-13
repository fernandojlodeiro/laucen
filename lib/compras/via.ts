// ¿Avión o barco? (pedido de Fer, 13/10). Por unidad de cada producto:
//   · flete por avión = kilos cobrables × US$ por kilo (cobrable = el mayor entre el peso real y el volumétrico, CBM × 167);
//   · flete por barco = CBM × US$ por metro cúbico;
//   · por avión viene por courier (Fer, 13/10): costo final = FOB + flete + un % del FOB por todo concepto (8 %), sin despacho;
//   · por barco, costo final (con IVA, como maneja Fer los costos):
//       con NCM cargada (pestaña Costo, propia o heredada de la familia): CIF = FOB + flete + seguro; + derechos,
//       estadística, otros, despachante y depósito sobre el CIF; + IVA sobre la base imponible (CIF + derechos + estadística);
//       sin datos: (FOB + flete) × (1 + recargo sin datos);
//   · ganancia = Clásica − lo que se lleva Mercado Libre − costo final (en dólares al oficial de hoy).
// Categoría por avión:
//   · «Avión»: el flete aéreo no pasa el umbral (% del FOB) y deja al menos el margen mínimo;
//   · «Conviene barco»: el flete aéreo pasa el umbral pero igual deja el margen mínimo (se puede traer rápido si hace falta);
//   · «No rentable por avión»: por avión gana menos que el margen mínimo;
//   · «Imposible por avión»: por avión pierde plata.
// Peso y volumen: los del packing list (lib/compras/packing.ts) y, si no hay, los de la ficha (peso y medidas del paquete).
// Sólo informa: no cambia costos ni precios.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { FACTOR_AEREO, SQL_PACKING_RIGE } from "@/lib/compras/packing";
import { calcular, generalDe, resolver, type Resuelto, type Valores } from "@/lib/costo-importacion";

export type ConfigVia = {
  /** Flete aéreo, US$ por kilo cobrable. */ aereoUsdKg: number;
  /** Por avión viene por courier: todo lo demás (impuestos y gastos) es este % del FOB. */ courierPct: number;
  /** Flete marítimo, US$ por metro cúbico. */ barcoUsdM3: number;
  /** Si el flete aéreo pasa este % del FOB, conviene barco. */ umbralFletePct: number;
  /** Sin NCM cargada: (FOB + flete) × (1 + esto). */ recargoSinDatosPct: number;
  /** Ganancia mínima sobre la Clásica para que traerlo por avión sea rentable. */ margenMinimoPct: number;
};
export const CONFIG_VIA: ConfigVia = { aereoUsdKg: 13, courierPct: 8, barcoUsdM3: 330, umbralFletePct: 30, recargoSinDatosPct: 30, margenMinimoPct: 10 };
export const CAMPOS_VIA: [keyof ConfigVia, string, string][] = [
  ["aereoUsdKg", "Flete aéreo", "US$ por kilo cobrable"],
  ["courierPct", "Por avión (courier), impuestos y gastos", "% del FOB"],
  ["barcoUsdM3", "Flete marítimo", "US$ por metro cúbico"],
  ["umbralFletePct", "Conviene barco si el flete aéreo pasa", "% del FOB"],
  ["recargoSinDatosPct", "Por barco sin NCM cargada, impuestos y gastos", "% sobre FOB + flete"],
  ["margenMinimoPct", "Margen mínimo por avión", "% de la Clásica"],
];

export async function configVia(org: string): Promise<ConfigVia> {
  const f = await una<{ valor: Partial<ConfigVia> }>("select valor from config_org where organizacion_id = $1 and clave = 'via_compra'", [org]).catch(() => null);
  return { ...CONFIG_VIA, ...(f?.valor ?? {}) };
}

export async function guardarConfigVia(org: string, c: ConfigVia): Promise<void> {
  for (const [k, t] of CAMPOS_VIA) {
    const v = c[k];
    if (!Number.isFinite(v) || v < 0 || v > 10000) throw new ErrorErp(`${t}: el valor no es válido.`);
  }
  await consulta(`insert into config_org (organizacion_id, clave, valor) values ($1, 'via_compra', $2::jsonb)
                  on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, JSON.stringify(c)]);
}

export const CATEGORIAS_VIA = {
  avion: { texto: "Avión", tono: "verde", ayuda: "El flete aéreo no pasa el umbral y deja el margen mínimo." },
  barco: { texto: "Conviene barco", tono: "azul", ayuda: "El flete aéreo pasa el umbral, pero por avión igual deja el margen mínimo: se puede traer rápido si hace falta." },
  no_rentable: { texto: "No rentable por avión", tono: "ambar", ayuda: "Por avión gana menos que el margen mínimo." },
  imposible: { texto: "Imposible por avión", tono: "rojo", ayuda: "Por avión pierde plata." },
  sin_datos: { texto: "Sin datos", tono: "gris", ayuda: "Falta el peso, el FOB o el precio de la Clásica." },
} as const;
export type CategoriaVia = keyof typeof CATEGORIAS_VIA;

export type Medidas = { peso_g: number | null; cbm: number | null; origen: "packing" | "ficha" | null; exacto: boolean };
export type CostoVia = { flete: number; final: number; ganancia: number | null; margen_pct: number | null };
export type ViaProducto = {
  medidas: Medidas; cobrable_kg: number | null; flete_aereo_pct: number | null; con_ncm: boolean;
  avion: CostoVia | null; barco: CostoVia | null; categoria: CategoriaVia;
};

/** Costo final por unidad por avión: viene por courier, FOB + flete + el % de courier sobre el FOB. */
export const costoCourier = (fob: number, flete: number, cfg: ConfigVia) => fob * (1 + cfg.courierPct / 100) + flete;

/** Costo final por unidad por barco (con IVA) para un flete dado. Sin derechos cargados, el recargo general. */
export function costoFinal(fob: number, flete: number, r: Resuelto | null, cfg: ConfigVia): number {
  if (!r || r.derecho_pct.valor == null) return (fob + flete) * (1 + cfg.recargoSinDatosPct / 100);
  const c = calcular(fob, { ...r, flete_pct: { valor: fob > 0 ? (flete / fob) * 100 : 0, origen: null } });
  return c.costo + c.baseImponible * ((r.iva_pct.valor ?? 0) / 100);
}

/** Todo el cálculo de una unidad. `netoUsd` = Clásica menos lo de Mercado Libre, en dólares (null si no hay precio);
 *  `precioUsd` = la Clásica en dólares: el margen es la ganancia sobre ella (como «% venta» de la sugerencia). */
export function calcularVia(fob: number | null, m: Medidas, netoUsd: number | null, r: Resuelto | null, cfg: ConfigVia, precioUsd: number | null = netoUsd): ViaProducto {
  const conNcm = r?.derecho_pct.valor != null;
  const cobrable = m.peso_g != null || m.cbm != null ? Math.max((m.peso_g ?? 0) / 1000, (m.cbm ?? 0) * FACTOR_AEREO) : null;
  if (fob == null || fob <= 0 || cobrable == null || cobrable <= 0)
    return { medidas: m, cobrable_kg: cobrable, flete_aereo_pct: null, con_ncm: conNcm, avion: null, barco: null, categoria: "sin_datos" };
  const uno = (flete: number, final: number): CostoVia => {
    const ganancia = netoUsd != null ? netoUsd - final : null;
    return { flete, final, ganancia, margen_pct: ganancia != null && precioUsd ? (ganancia / precioUsd) * 100 : null };
  };
  const fa = cobrable * cfg.aereoUsdKg;
  const avion = uno(fa, costoCourier(fob, fa, cfg));
  const fb = m.cbm != null && m.cbm > 0 ? m.cbm * cfg.barcoUsdM3 : null;
  const barco = fb != null ? uno(fb, costoFinal(fob, fb, r, cfg)) : null;
  const pct = (avion.flete / fob) * 100;
  let categoria: CategoriaVia;
  if (avion.ganancia == null || avion.margen_pct == null) categoria = "sin_datos";
  else if (avion.ganancia < 0) categoria = "imposible";
  else if (avion.margen_pct < cfg.margenMinimoPct) categoria = "no_rentable";
  else categoria = pct > cfg.umbralFletePct ? "barco" : "avion";
  return { medidas: m, cobrable_kg: cobrable, flete_aereo_pct: pct, con_ncm: conNcm, avion, barco, categoria };
}

/** Peso y volumen por unidad de cada variación: el packing list que rige y, si no hay, la ficha del producto. */
export async function medidasDe(org: string, variaciones: number[]): Promise<Map<number, Medidas>> {
  if (!variaciones.length) return new Map();
  const r = await consulta<{ id: number; pk_peso: number | null; pk_cbm: number | null; exacto: boolean | null; peso_g: number | null; cbm: number | null }>(`
    with pk as (${SQL_PACKING_RIGE})
    select va.id::int, pk.peso_g pk_peso, pk.cbm pk_cbm, pk.exacto, pr.peso_g::float8 peso_g,
           (pr.largo_cm * pr.ancho_cm * pr.alto_cm / 1e6)::float8 cbm
      from variacion va join producto pr on pr.id = va.producto_id left join pk on pk.variacion_id = va.id
     where va.organizacion_id = $1 and va.id = any($2::bigint[])`, [org, variaciones]);
  return new Map(r.map((x) => [x.id, x.pk_peso != null || x.pk_cbm != null
    ? { peso_g: x.pk_peso, cbm: x.pk_cbm, origen: "packing" as const, exacto: !!x.exacto }
    : x.peso_g != null || x.cbm != null ? { peso_g: x.peso_g, cbm: x.cbm, origen: "ficha" as const, exacto: false }
      : { peso_g: null, cbm: null, origen: null, exacto: false }]));
}

/** NCM y alícuotas resueltas de cada producto (propias → familia → … → generales), de una vez para muchos. */
export async function costosResueltos(org: string, productos: { id: number; familia_id: number | null }[]): Promise<Map<number, Resuelto>> {
  if (!productos.length) return new Map();
  const general = await generalDe(org);
  const COLS = "ncm, via, flete_pct::float8, seguro_pct::float8, derecho_pct::float8, tasa_estadistica_pct::float8, arancel_otros_pct::float8, despachante_pct::float8, deposito_pct::float8, iva_pct::float8, iva_adicional_pct::float8, percepcion_ganancias_pct::float8, ingresos_brutos_pct::float8";
  const [propios, familias] = await Promise.all([
    consulta<{ producto_id: number } & Valores>(`select producto_id::int, ${COLS} from producto_costo where organizacion_id = $1 and producto_id = any($2::bigint[])`, [org, productos.map((p) => p.id)]),
    consulta<{ hoja: number; nivel: number; nombre: string } & Valores>(`
      with recursive arriba as (
        select f.id hoja, f.id, f.padre_id, f.nombre, 0 nivel from familia f where f.organizacion_id = $1 and f.id = any($2::bigint[])
        union all
        select a.hoja, f.id, f.padre_id, f.nombre, a.nivel + 1 from familia f join arriba a on f.id = a.padre_id where a.nivel < 50)
      select a.hoja::int, a.nivel, a.nombre, ${COLS.split(", ").map((c) => `fc.${c}`).join(", ")}
        from arriba a join familia_costo fc on fc.familia_id = a.id order by a.hoja, a.nivel`,
      [org, [...new Set(productos.map((p) => p.familia_id).filter((x): x is number => x != null))]]),
  ]);
  const porProducto = new Map(propios.map(({ producto_id, ...v }) => [producto_id, v as Valores]));
  const porFamilia = new Map<number, { nombre: string; valores: Valores }[]>();
  for (const { hoja, nivel: _n, nombre, ...v } of familias) porFamilia.set(hoja, [...(porFamilia.get(hoja) ?? []), { nombre, valores: v as Valores }]);
  return new Map(productos.map((p) => [p.id, resolver(porProducto.get(p.id) ?? null, p.familia_id ? porFamilia.get(p.familia_id) ?? [] : [], general)]));
}
