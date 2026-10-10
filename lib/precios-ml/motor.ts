// El motor de precios de Mercado Libre (Fer, 3/10), en funciones puras (sin
// base ni API: se prueban solas en tests/precios-ml.test.ts).
//
//   · La lista del canal (precio_de) tiene la CLÁSICA (Fer, 8/10; antes tenía
//     el tachado): lo que paga el comprador en la cuenta que gana. Es el único
//     precio que pone Fer.
//   · Tachado = Clásica × (1 + %). La publicación va al tachado y una campaña
//     la baja a la Clásica (ML pide ≥ 5 % de descuento). Uno solo por modelo
//     (Fer, 7/10): todos sus planes salen a ese tachado y la campaña baja cada
//     uno a su precio. Una publicación que ya está en campaña, para cambiar su
//     tachado o su precio (subir o bajar), sale de la campaña y vuelve a entrar
//     al precio nuevo (Fer, 8/10 y 9/10).
//   · Quién gana (Fer, 7/10): en cada canal, la Clásica y cada plan pueden ir
//     un % más caros que el esquema (ajuste_pct; la cuenta que "no gana", 3 %).
//   · Plan de cuotas: Clásica × (1 − comisión Clásica) ÷ (1 − comisión del
//     plan) × (1 + margen extra), con la comisión real de la categoría.
//   · Plan destacado: el que mejor "cierra" con el precio para ganar de ML va
//     a ese precio, en las mismas campañas que la Clásica; los demás planes
//     van a su precio por coeficiente (con tachado, por campaña).
//   · Descuento por volumen: por rango de Clásica, hasta 5 escalones; un
//     escalón sólo si hay stock para su cantidad.
// Todo por canal y, adentro, general → familia (subiendo por el árbol) →
// producto: gana lo más específico.

export type Nivel = "general" | "familia" | "producto";
export const PLANES = ["premium", "3x_campaign", "9x_campaign", "12x_campaign"] as const;
export type Plan = (typeof PLANES)[number];
export type PlanOClasica = Plan | "clasica";
export const esPlan = (x: unknown): x is Plan => PLANES.includes(x as Plan);

export const PLAN_INFO: Record<PlanOClasica, { nombre: string; corto: string; cuotas: number; tipo: "gold_special" | "gold_pro"; tag: string | null }> = {
  clasica: { nombre: "Clásica", corto: "Clásica", cuotas: 1, tipo: "gold_special", tag: null },
  // Los nombres son los de ML: cuántas cuotas ve el comprador depende de la categoría (y del momento) y se carga
  // en Precios en ML › Planes de cuotas (Fer, 8/10); `cuotas` es sólo lo que se supone si no hay nada cargado.
  premium: { nombre: "Premium común", corto: "Premium", cuotas: 6, tipo: "gold_pro", tag: null },
  "3x_campaign": { nombre: "Premium 3x", corto: "3x", cuotas: 3, tipo: "gold_pro", tag: "3x_campaign" },
  "9x_campaign": { nombre: "Premium 9x", corto: "9x", cuotas: 9, tipo: "gold_pro", tag: "9x_campaign" },
  "12x_campaign": { nombre: "Premium 12x", corto: "12x", cuotas: 12, tipo: "gold_pro", tag: "12x_campaign" },
};

/** ML pide al menos 5 % de descuento para que una campaña muestre tachado. */
export const DESCUENTO_MINIMO_ML = 5;
export const MAX_ESCALONES = 5;

/** El plan de una publicación de ML según su tipo y sus marcas (tags). */
export function planDePublicacion(tipo: string | null | undefined, tags: unknown): PlanOClasica | null {
  const t = Array.isArray(tags) ? tags.map(String) : [];
  if (tipo === "gold_special") return "clasica";
  if (tipo !== "gold_pro") return null;
  for (const p of ["12x_campaign", "9x_campaign", "3x_campaign"] as const) if (t.includes(p)) return p;
  return "premium";
}

// ── Herencia general → familia → producto ───────────────────

/** Dónde está la regla que manda. */
export type Origen = { nivel: Nivel; familiaId?: number | null };
/** Una fila de regla de cualquier tabla (lo que importa para heredar). */
export type FilaNivel = { nivel: Nivel; familia_id?: number | null; producto_id?: number | null };
/** El producto y su cadena de familias (la suya primero, después la padre…). */
export type Lugar = { productoId: number; familias: number[] };

/** La cadena de familias de una familia, de abajo hacia arriba (sin ciclos). */
export function cadenaFamilias(familiaId: number | null | undefined, padres: Map<number, number | null>): number[] {
  const salida: number[] = [];
  let f = familiaId ?? null;
  while (f != null && !salida.includes(f) && salida.length < 30) {
    salida.push(f);
    f = padres.get(f) ?? null;
  }
  return salida;
}

/** Las filas de un lugar, de la más específica a la más general. */
export function filasEnOrden<T extends FilaNivel>(filas: T[], lugar: Lugar): { fila: T; origen: Origen }[] {
  const salida: { fila: T; origen: Origen }[] = [];
  for (const f of filas) if (f.nivel === "producto" && f.producto_id === lugar.productoId) salida.push({ fila: f, origen: { nivel: "producto" } });
  for (const fam of lugar.familias) {
    for (const f of filas) if (f.nivel === "familia" && f.familia_id === fam) salida.push({ fila: f, origen: { nivel: "familia", familiaId: fam } });
  }
  for (const f of filas) if (f.nivel === "general") salida.push({ fila: f, origen: { nivel: "general" } });
  return salida;
}

/** El primer valor no vacío de la más específica a la más general. */
export function heredar<T extends FilaNivel, V>(filas: T[], lugar: Lugar, valor: (f: T) => V | null | undefined): { valor: V | null; origen: Origen | null } {
  for (const { fila, origen } of filasEnOrden(filas, lugar)) {
    const v = valor(fila);
    if (v !== null && v !== undefined) return { valor: v, origen };
  }
  return { valor: null, origen: null };
}

export const textoOrigen = (o: Origen | null, nombreFamilia?: (id: number) => string | undefined) =>
  !o ? "sin regla" : o.nivel === "producto" ? "del producto" : o.nivel === "general" ? "general"
    : `de la categoría ${o.familiaId != null ? nombreFamilia?.(o.familiaId) ?? `#${o.familiaId}` : ""}`.trim();

// ── Comisiones ──────────────────────────────────────────────

/** Comisión total (% del precio) de cada plan en una categoría. */
export type Comisiones = Record<PlanOClasica, number>;

/** Si la categoría no está relevada: el promedio de las relevadas, y si no
 *  hay ninguna, esto (valores de referencia de ML Argentina). */
export const COMISIONES_REFERENCIA: Comisiones = { clasica: 14, premium: 19, "3x_campaign": 17, "9x_campaign": 24, "12x_campaign": 27 };

/** Una fila de ml_costos_comisiones_vigente: el total de la Premium (6) y lo
 *  que suma cada plan de cuotas a la Clásica. */
export type FilaComision = {
  clasica_pct: number | null; premium_pct: number | null;
  premium_3x_pct: number | null; premium_9x_pct: number | null; premium_12x_pct: number | null;
};

export function comisionesDe(f: FilaComision | null | undefined, general: Comisiones = COMISIONES_REFERENCIA): { valores: Comisiones; estimada: boolean } {
  if (!f || f.clasica_pct == null) return { valores: general, estimada: true };
  const c = Number(f.clasica_pct);
  const premium = f.premium_pct != null ? Number(f.premium_pct) : general.premium - general.clasica + c;
  // Un plan sin relevar se estima sobre la Premium de la categoría (son variantes de la Premium): así nunca
  // queda más barato que la Premium en una categoría de Premium cara (Fer, 10/10: 9x más barata que la Premium).
  const mas = (x: number | null, plan: Plan) => (x == null ? premium + general[plan] - general.premium : c + Number(x));
  const valores: Comisiones = {
    clasica: c,
    premium,
    "3x_campaign": mas(f.premium_3x_pct, "3x_campaign"),
    "9x_campaign": mas(f.premium_9x_pct, "9x_campaign"),
    "12x_campaign": mas(f.premium_12x_pct, "12x_campaign"),
  };
  const estimada = f.premium_pct == null || f.premium_3x_pct == null || f.premium_9x_pct == null || f.premium_12x_pct == null;
  return { valores, estimada };
}

/** El promedio de las categorías relevadas (para las que no lo están). */
export function comisionGeneral(filas: FilaComision[]): Comisiones {
  const val = filas.map((f) => comisionesDe(f).valores).filter((v) => Number.isFinite(v.clasica));
  if (!val.length) return COMISIONES_REFERENCIA;
  const prom = (k: PlanOClasica) => Math.round((val.reduce((s, v) => s + v[k], 0) / val.length) * 100) / 100;
  return { clasica: prom("clasica"), premium: prom("premium"), "3x_campaign": prom("3x_campaign"), "9x_campaign": prom("9x_campaign"), "12x_campaign": prom("12x_campaign") };
}

// ── Las cuentas ─────────────────────────────────────────────

/** Redondeo a pesos enteros (ML acepta centavos, pero un precio redondo se lee mejor). */
export const redondear = (x: number) => Math.round(x);

export function tachado(clasica: number, pct: number): number {
  return redondear(clasica * (1 + pct / 100));
}

/** El % de descuento que ve el comprador entre el tachado y la Clásica. */
export function descuentoVisible(tachadoPrecio: number, venta: number): number {
  if (!(tachadoPrecio > 0)) return 0;
  return Math.round((1 - venta / tachadoPrecio) * 1000) / 10;
}

/** El descuento que ve el comprador con un tachado de `tachadoPct` sobre la
 *  Clásica (81,8 % → 45 %). */
export function descuentoComprador(tachadoPct: number): number {
  if (!(tachadoPct > 0)) return 0;
  return Math.round(tachadoPct / (100 + tachadoPct) * 1000) / 10;
}

/** Al revés: el tachado % que hace falta para que el comprador vea `descuento` % (45 % → 81,81818 %).
 *  Fer decide el descuento que ve el comprador; el tachado % es la cuenta interna. */
export function tachadoDeDescuento(descuento: number): number {
  if (!(descuento > 0)) return 0;
  return Math.round(descuento / (100 - descuento) * 100 * 100000) / 100000;
}

/** Precio de un plan por coeficiente: deja lo mismo que la Clásica (después
 *  de la comisión) más el margen extra. */
export function precioPlan(clasica: number, comisionClasicaPct: number, comisionPlanPct: number, margenPct = 0): number {
  if (comisionPlanPct >= 100) return NaN;
  return redondear(clasica * (1 - comisionClasicaPct / 100) / (1 - comisionPlanPct / 100) * (1 + margenPct / 100));
}

/** Qué tan bien "cierra" un plan al precio para ganar: lo que queda después de
 *  la comisión del plan, contra lo que deja la Clásica, menos el margen que
 *  se le pide. ≥ 0 = cierra. */
export function holguraPlan(priceToWin: number, clasica: number, comisionClasicaPct: number, comisionPlanPct: number, margenPct = 0): number {
  const netoPlan = priceToWin * (1 - comisionPlanPct / 100);
  const netoClasica = clasica * (1 - comisionClasicaPct / 100);
  if (!(netoClasica > 0)) return -Infinity;
  return Math.round(((netoPlan / netoClasica - 1) * 100 - margenPct) * 100) / 100;
}

export type OpcionPlan = { plan: Plan; priceToWin: number | null; comisionPct: number; margenPct: number; cuotasVisibles: number };

/** El plan destacado: el que mejor cierra con su precio para ganar (si
 *  empatan, el que el comprador ve con más cuotas). null si ninguno cierra o
 *  no hay precio para ganar leído. */
export function elegirDestacado(clasica: number, comisionClasicaPct: number, opciones: OpcionPlan[]): { plan: Plan; precio: number; holgura: number } | null {
  let mejor: { plan: Plan; precio: number; holgura: number; cuotas: number } | null = null;
  for (const o of opciones) {
    if (o.priceToWin == null || !(o.priceToWin > 0)) continue;
    const h = holguraPlan(o.priceToWin, clasica, comisionClasicaPct, o.comisionPct, o.margenPct);
    if (h < 0) continue;
    if (!mejor || h > mejor.holgura || (h === mejor.holgura && o.cuotasVisibles > mejor.cuotas)) {
      mejor = { plan: o.plan, precio: redondear(o.priceToWin), holgura: h, cuotas: o.cuotasVisibles };
    }
  }
  return mejor ? { plan: mejor.plan, precio: mejor.precio, holgura: mejor.holgura } : null;
}

/** Planes que el comprador ve con la misma cantidad de cuotas (uno sobra). */
export function cuotasRepetidas(planes: { plan: Plan; cuotasVisibles: number }[]): { cuotas: number; planes: Plan[] }[] {
  const por = new Map<number, Plan[]>();
  for (const p of planes) por.set(p.cuotasVisibles, [...(por.get(p.cuotasVisibles) ?? []), p.plan]);
  return [...por].filter(([, ps]) => ps.length > 1).map(([cuotas, ps]) => ({ cuotas, planes: ps }));
}

// ── Descuento por volumen ───────────────────────────────────

export type Escalon = { cantidad: number; pct: number };
export type FilaVolumen = FilaNivel & { desde_precio: number; hasta_precio: number | null; escalones: Escalon[]; sin_descuento: boolean };

/** Limpia los escalones: cantidad ≥ 2, % entre 0 y 90, sin cantidades
 *  repetidas, ordenados y como mucho 5 (lo que acepta ML). */
export function normalizarEscalones(e: unknown): Escalon[] {
  const lista = Array.isArray(e) ? e : [];
  const vistos = new Map<number, number>();
  for (const x of lista) {
    const cantidad = Math.trunc(Number((x as Escalon)?.cantidad));
    const pct = Number((x as Escalon)?.pct);
    if (!(cantidad >= 2) || !(pct > 0 && pct <= 90)) continue;
    vistos.set(cantidad, pct);
  }
  return [...vistos].map(([cantidad, pct]) => ({ cantidad, pct })).sort((a, b) => a.cantidad - b.cantidad).slice(0, MAX_ESCALONES);
}

/** Los escalones que le tocan a una publicación: el nivel más específico que
 *  tiene filas manda entero (con "sin descuento" no hay); adentro, el rango
 *  que contiene la Clásica. Con la regla de stock, un escalón sólo si hay
 *  stock para su cantidad. */
export function escalonesPara(clasica: number, filas: FilaVolumen[], lugar: Lugar, stock: number | null, reglaStock = true): { escalones: Escalon[]; origen: Origen | null; sinStock: Escalon[] } {
  const ordenadas = filasEnOrden(filas, lugar);
  if (!ordenadas.length) return { escalones: [], origen: null, sinStock: [] };
  const primero = ordenadas[0].origen;
  const delNivel = ordenadas.filter((x) => x.origen.nivel === primero.nivel && (x.origen.familiaId ?? null) === (primero.familiaId ?? null)).map((x) => x.fila);
  if (delNivel.some((f) => f.sin_descuento)) return { escalones: [], origen: primero, sinStock: [] };
  const fila = delNivel.find((f) => clasica >= Number(f.desde_precio) && (f.hasta_precio == null || clasica < Number(f.hasta_precio)));
  if (!fila) return { escalones: [], origen: primero, sinStock: [] };
  const todos = normalizarEscalones(fila.escalones);
  if (!reglaStock || stock == null) return { escalones: todos, origen: primero, sinStock: [] };
  return { escalones: todos.filter((e) => stock >= e.cantidad), origen: primero, sinStock: todos.filter((e) => stock < e.cantidad) };
}

/** Los precios por cantidad que se mandan a ML (POST /items/{id}/prices/standard/quantity). */
export function preciosPorCantidad(venta: number, escalones: Escalon[]): { cantidad: number; precio: number; pct: number }[] {
  return escalones.map((e) => ({ cantidad: e.cantidad, pct: e.pct, precio: redondear(venta * (1 - e.pct / 100)) }));
}

// ── La propuesta de una variación en un canal ───────────────

export type ReglasPlan = FilaNivel & { plan: Plan; activo: boolean | null; precio_minimo: number | null; margen_pct: number | null; cuotas_visibles: number | null;
  /** % más caro que el esquema en este canal (la cuenta que no gana el plan). */
  ajuste_pct?: number | null };
export type ReglaTachado = FilaNivel & { tachado_pct: number | null;
  /** % más cara la Clásica en este canal que la de la lista (la cuenta que no gana la Clásica). */
  ajuste_pct?: number | null };

/** Una campaña de ML de una publicación (leída de /seller-promotions). */
export type Campana = { id: string; tipo: string; estado: string | null; nombre?: string | null; precio: number | null; min: number | null; max: number | null;
  /** Las que arma ML («Potencia tus ventas»): el precio sin descuento y qué % pone el vendedor. */
  original?: number | null; pctVendedor?: number | null;
  /** Cuándo arranca la campaña: una que todavía no arrancó no da descuento hoy. */
  desde?: string | null };

/** La campaña ya arrancó (o no se sabe cuándo arranca). */
export const rigeHoy = (c: Campana, ahora: Date = new Date()) => !c.desde || new Date(c.desde).getTime() <= ahora.getTime();

export type PubMl = {
  publicacionId: number; itemId: string; variationId: string | null; plan: PlanOClasica | null; estado: string;
  /** Lo que ML tiene hoy: el precio de lista (tachado si hay campaña) y lo que paga el comprador. */
  precioListaMl: number | null; precioVentaMl: number | null;
  priceToWin: number | null; estadoPtw: string | null;
  campanas: Campana[];
  /** Los escalones de volumen mandados la última vez (ok en la cola). */
  volumenMl: { cantidad: number; precio: number }[] | null;
  userProductId: string | null; catalogProductId: string | null; catalogo: boolean;
  /** Publicación de catálogo atada a otra nuestra (item_relations): ML le copia el precio publicado de la original. */
  gemelaDe?: string | null;
};

export type EntradaVariacion = {
  variacionId: number; productoId: number; lugar: Lugar;
  /** El precio de la lista del canal: la Clásica del esquema (el tachado sale de ella). */
  clasica: number | null; stock: number | null; comisiones: Comisiones; comisionEstimada: boolean;
  pubs: PubMl[];
  /** Planes que la cuenta tiene sólo en publicaciones pausadas: no se tocan, pero tampoco se vuelven a crear. */
  planesPausados?: PlanOClasica[];
};

export type ReglasCanal = {
  tachado: ReglaTachado[];
  planes: ReglasPlan[];
  volumen: FilaVolumen[];
  reglaStock: boolean;
  /** «¿Gana?» del grupo del producto (Precios en ML › Planes de cuotas; Fer, 8/10): 0 si esta cuenta gana esa
   *  publicación, +% si no. Se usa cuando ni el producto, ni sus categorías, ni lo general de la cuenta dicen nada. */
  ajusteGrupo?: (lugar: Lugar) => Partial<Record<PlanOClasica, number>>;
  /** La campaña propia vigente de la cuenta («Promociones Daitom»; Fer, 8/10), si hay. */
  campanaPropia?: { id: string; nombre: string } | null;
  /** Para las pruebas: el momento contra el que se mira si una campaña ya arrancó. */
  ahora?: Date;
  /** Desde qué precio Mercado Libre da envío gratis: ningún plan se crea con su precio en la franja de
   *  FRANJA_SIN_PLANES_PCT % abajo de ese umbral (Fer, 10/10). */
  envioGratis?: number | null;
};

/** La franja abajo del envío gratis en la que no va ningún plan (%), para que un plan no lo cruce por poco. */
export const FRANJA_SIN_PLANES_PCT = 10;

/** El precio de un plan cae en la franja sin planes: entre el envío gratis menos 10 % y el envío gratis. */
export const enFranjaSinPlanes = (precio: number | null, envioGratis: number | null | undefined) =>
  precio != null && !!envioGratis && precio >= envioGratis * (1 - FRANJA_SIN_PLANES_PCT / 100) - 0.5 && precio < envioGratis;

/** Qué tiene que tener una publicación (y qué cambia). */
export type PropuestaPub = {
  pub: PubMl;
  rol: "clasica" | "destacado" | "plan" | "apagado" | "otro";
  /** El precio de la publicación en ML (lista) y lo que paga el comprador. */
  lista: number | null; venta: number | null;
  /** El piso: lo que da el esquema para esta publicación, antes de mirar las campañas en las que ya está. */
  piso: number | null;
  /** Campañas para entrar (o volver a entrar con otro precio). */
  entrar: Campana[]; salir: Campana[];
  volumen: { cantidad: number; precio: number; pct: number }[];
  cambiaPrecio: boolean; cambiaVolumen: boolean;
  avisos: string[];
};

export type PlanCalculado = {
  plan: Plan; activo: boolean; habilitado: boolean; precioMinimo: number | null; margenPct: number; ajustePct: number; cuotasVisibles: number;
  comisionPct: number; precio: number | null; origen: Origen | null;
  /** Su precio cae en la franja sin planes (abajo del envío gratis). */
  enFranja?: boolean;
};

export type Propuesta = {
  /** `clasica`: la de este canal (la del esquema × (1 + ajuste)); `clasicaLista`: la del esquema (la de la lista). */
  variacionId: number; clasica: number | null; clasicaLista: number | null; ajustePct: number; tachadoPct: number; tachado: number | null; tachadoOrigen: Origen | null;
  planes: PlanCalculado[];
  destacado: { plan: Plan; precio: number; holgura: number; itemId: string } | null;
  pubs: PropuestaPub[];
  /** Planes habilitados que no tienen publicación (se pueden crear). */
  faltan: { plan: Plan; precio: number; userProductId: string | null; catalogProductId: string | null }[];
  volumen: { escalones: Escalon[]; sinStock: Escalon[]; origen: Origen | null };
  avisos: string[];
};

/** Las campañas en las que se elige el precio con descuento. */
export const CON_PRECIO = ["DEAL", "SELLER_CAMPAIGN"];

const igual = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 1;

/** Las campañas en las que conviene estar a `venta`: las que ya tiene a ese
 *  precio quedan; las candidatas cuyo rango acepta ese precio, a entrar; las
 *  que tiene a otro precio, a salir y volver a entrar. Sólo las que llevan
 *  precio (DEAL, SELLER_CAMPAIGN). */
export function campanasPara(campanas: Campana[], venta: number, soloEstas?: Set<string>): { entrar: Campana[]; salir: Campana[]; quedan: Campana[]; fuera: Campana[] } {
  const entrar: Campana[] = [], salir: Campana[] = [], quedan: Campana[] = [], fuera: Campana[] = [];
  for (const c of campanas) {
    if (!CON_PRECIO.includes(c.tipo)) continue;
    if (soloEstas && !soloEstas.has(c.id)) continue;
    const adentro = c.estado === "started" || c.estado === "pending";
    const entra = (c.min == null || venta >= c.min - 0.5) && (c.max == null || venta <= c.max + 0.5);
    if (adentro && igual(c.precio, venta)) { quedan.push(c); continue; }
    if (!entra) { fuera.push(c); continue; }
    if (adentro) salir.push(c);
    entrar.push(c);
  }
  return { entrar, salir, quedan, fuera };
}

/** Todo lo de una variación en un canal: tachado, planes, destacado, qué
 *  precio va en cada publicación, campañas, volumen y qué planes faltan. */
export function proponer(e: EntradaVariacion, r: ReglasCanal): Propuesta {
  const avisos: string[] = [];
  const t = heredar(r.tachado, e.lugar, (f) => f.tachado_pct);
  const tachadoPct = Number(t.valor ?? 0);
  const delGrupo = r.ajusteGrupo?.(e.lugar) ?? {};
  const ajustePct = Number(heredar(r.tachado, e.lugar, (f) => (f.ajuste_pct == null ? null : Number(f.ajuste_pct))).valor ?? delGrupo.clasica ?? 0);
  // La lista tiene la Clásica del esquema (Fer, 8/10); el tachado sale de ella (el mismo
  // en todos los canales y planes del modelo), y la Clásica de este canal, con su ajuste (si no gana).
  const base = e.clasica != null && e.clasica > 0 ? redondear(e.clasica) : null;
  const tach = base != null ? tachado(base, tachadoPct) : null;
  const clasica = base != null ? redondear(base * (1 + ajustePct / 100)) : null;
  if (clasica == null) avisos.push("Sin precio en la lista Clásicas: no se calcula nada.");
  if (clasica != null && tachadoPct > 0 && descuentoVisible(tach!, clasica) < DESCUENTO_MINIMO_ML) {
    avisos.push(`El tachado da ${descuentoVisible(tach!, clasica).toLocaleString("es-AR")} % de descuento: ML pide al menos ${DESCUENTO_MINIMO_ML} % para mostrarlo.`);
  }

  const planes: PlanCalculado[] = PLANES.map((plan) => {
    const delPlan = r.planes.filter((f) => f.plan === plan);
    const act = heredar(delPlan, e.lugar, (f) => f.activo);
    const min = heredar(delPlan, e.lugar, (f) => (f.precio_minimo == null ? null : Number(f.precio_minimo)));
    const mar = heredar(delPlan, e.lugar, (f) => (f.margen_pct == null ? null : Number(f.margen_pct)));
    const cuo = heredar(delPlan, e.lugar, (f) => f.cuotas_visibles);
    const aju = heredar(delPlan, e.lugar, (f) => (f.ajuste_pct == null ? null : Number(f.ajuste_pct)));
    const activo = act.valor === true;
    const margenPct = mar.valor ?? 0;
    const ajuste = aju.valor ?? delGrupo[plan] ?? 0;
    // El plan sale de la Clásica de la lista (no de la de este canal) más su ajuste.
    const precio = base != null ? redondear(precioPlan(base, e.comisiones.clasica, e.comisiones[plan], margenPct) * (1 + ajuste / 100)) : null;
    const enFranja = enFranjaSinPlanes(precio, r.envioGratis);
    const habilitado = activo && clasica != null && (min.valor == null || clasica >= min.valor) && !enFranja;
    return {
      plan, activo, habilitado, precioMinimo: min.valor, margenPct, ajustePct: ajuste, cuotasVisibles: cuo.valor ?? PLAN_INFO[plan].cuotas,
      comisionPct: e.comisiones[plan], precio, origen: act.origen, enFranja,
    };
  });
  const habilitados = planes.filter((p) => p.habilitado);
  for (const rep of cuotasRepetidas(habilitados)) {
    avisos.push(`El comprador ve ${rep.cuotas} cuotas en ${rep.planes.map((p) => PLAN_INFO[p].corto).join(" y ")}: sobra uno (manda lo que ve el comprador).`);
  }

  // El destacado: entre los planes habilitados que ya tienen publicación con precio para ganar leído.
  const pubDe = (plan: PlanOClasica) => e.pubs.find((p) => p.plan === plan && p.estado !== "cerrada") ?? null;
  const dest = clasica != null ? elegirDestacado(clasica, e.comisiones.clasica, habilitados.map((p) => ({
    plan: p.plan, priceToWin: pubDe(p.plan)?.priceToWin ?? null, comisionPct: p.comisionPct, margenPct: p.margenPct, cuotasVisibles: p.cuotasVisibles,
  }))) : null;
  const destacado = dest ? { ...dest, itemId: pubDe(dest.plan)!.itemId } : null;
  if (clasica != null && habilitados.some((p) => pubDe(p.plan)?.priceToWin != null) && !destacado) {
    avisos.push("Ningún plan cierra al precio para ganar de ML: no hay destacado (los planes quedan a su precio por coeficiente).");
  }

  const vol = clasica != null ? escalonesPara(clasica, r.volumen, e.lugar, e.stock, r.reglaStock) : { escalones: [], origen: null, sinStock: [] };

  // Las campañas de la Clásica: el destacado entra en las mismas.
  const pubClasica = pubDe("clasica");
  const campanasClasica = pubClasica && clasica != null ? campanasPara(pubClasica.campanas, clasica) : null;
  const idsClasica = campanasClasica ? new Set([...campanasClasica.entrar, ...campanasClasica.quedan].map((c) => c.id)) : new Set<string>();

  const pubs: PropuestaPub[] = e.pubs.map((pub) => {
    const pa: PropuestaPub = { pub, rol: "otro", lista: null, venta: null, piso: null, entrar: [], salir: [], volumen: [], cambiaPrecio: false, cambiaVolumen: false, avisos: [] };
    if (clasica == null || pub.estado === "cerrada") return pa;
    if (pub.plan === "clasica") {
      // Con tachado (que deje el descuento mínimo de ML), al tachado; si no, al precio de venta (Fer, 10/10: sin tachado
      // en el esquema, la Clásica que no gana —+5 %— quedaba con el tachado debajo y se mandaba a una campaña más cara
      // que su precio publicado: ML la rechaza).
      pa.rol = "clasica"; pa.venta = clasica;
      pa.lista = tachadoPct > 0 && tach != null && descuentoVisible(tach, clasica) >= DESCUENTO_MINIMO_ML ? tach : clasica;
    } else if (pub.plan && esPlan(pub.plan)) {
      const pc = planes.find((p) => p.plan === pub.plan)!;
      if (!pc.habilitado) {
        pa.rol = "apagado";
        pa.avisos.push(!pc.activo ? "El plan no está activo: no se toca."
          : pc.enFranja ? `Su precio ($ ${Math.round(pc.precio!).toLocaleString("es-AR")}) cae en la franja sin planes, a menos de ${FRANJA_SIN_PLANES_PCT} % abajo del envío gratis ($ ${Math.round(r.envioGratis!).toLocaleString("es-AR")}): no se toca.`
          : `Debajo del mínimo del plan (${pc.precioMinimo?.toLocaleString("es-AR")}): no se toca.`);
        return pa;
      }
      if (destacado && destacado.plan === pub.plan) {
        pa.rol = "destacado"; pa.venta = destacado.precio;
      } else {
        pa.rol = "plan"; pa.venta = pc.precio;
      }
      // El mismo tachado que la Clásica (uno por modelo), si deja al menos el descuento mínimo de ML.
      pa.lista = tachadoPct > 0 && tach != null && pa.venta != null && descuentoVisible(tach, pa.venta) >= DESCUENTO_MINIMO_ML ? tach : pa.venta;
    } else {
      pa.avisos.push("Tipo de publicación desconocido: no se toca.");
      return pa;
    }
    pa.piso = pa.venta;
    const adentro = pub.campanas.filter((c) => (c.estado === "started" || c.estado === "pending") && CON_PRECIO.includes(c.tipo));
    // Descuento creíble (Fer, 10/10): en una publicación que ya existe, ML no acepta un precio con descuento más alto
    // que el máximo que informa en sus campañas (≈ el precio de referencia reciente menos 1 % a 10 %). Si el esquema da
    // más (o no hay campañas leídas para saberlo), va sin tachado ni campaña: el comprador paga el precio del esquema.
    // Lo que ya está en una campaña y se mantiene o baja, sigue.
    if (pa.lista != null && pa.venta != null && pa.lista > pa.venta + 0.5
        && !adentro.some((c) => c.precio != null && c.precio > 0 && pa.venta! <= Number(c.precio) + 0.5)) {
      const maximos = pub.campanas.map((c) => (c.max == null ? null : Number(c.max))).filter((m): m is number => m != null && m > 0);
      const maximo = maximos.length ? Math.min(...maximos) : null;
      if (maximo == null || pa.venta > maximo + 0.5) {
        pa.avisos.push(maximo == null
          ? "Sin campañas leídas de esta publicación: va sin tachado hasta saber qué descuento acepta Mercado Libre."
          : `Mercado Libre acepta descuento sólo hasta $ ${Math.floor(maximo).toLocaleString("es-AR")} en esta publicación (por su precio reciente): va sin tachado, a $ ${Math.round(pa.venta).toLocaleString("es-AR")}.`);
        pa.lista = pa.venta;
      }
    }
    // En campaña: el tachado no se toca (Fer, 7/10). El precio sube o baja al del esquema: sale de la
    // campaña y vuelve a entrar al precio nuevo (Fer, 8/10; ML no deja cambiarlo estando adentro).
    if (adentro.length && pub.precioListaMl != null && pa.lista != null && pa.venta != null) {
      // El tachado también se corrige (Fer, 9/10): como el precio, sale de la campaña, cambia el
      // precio publicado y vuelve a entrar. Sin descuento en el esquema, la oferta puesta a mano no se toca.
      if (!igual(pub.precioListaMl, pa.lista)) {
        if (tachadoPct > 0) {
          pa.avisos.push(`En campaña: el tachado pasa de $ ${Math.round(pub.precioListaMl).toLocaleString("es-AR")} a $ ${Math.round(pa.lista).toLocaleString("es-AR")}: sale de la campaña, cambia el precio y vuelve a entrar (si la campaña no acepta el precio nuevo, va a la campaña propia).`);
        } else {
          pa.avisos.push(`En campaña sin descuento en el esquema: el precio publicado queda en $ ${Math.round(pub.precioListaMl).toLocaleString("es-AR")}.`);
          pa.lista = pub.precioListaMl;
        }
      }
      if (pub.precioVentaMl != null && pa.venta > pub.precioVentaMl + 0.5) {
        if (tachadoPct > 0) {
          pa.avisos.push(`En campaña sube de $ ${Math.round(pub.precioVentaMl).toLocaleString("es-AR")} a $ ${Math.round(pa.venta).toLocaleString("es-AR")}: sale de la campaña y vuelve a entrar al precio nuevo (si la campaña no lo acepta, queda afuera al tachado hasta entrar en otra).`);
        } else {
          // Sin descuento en el esquema, la campaña es una oferta puesta a mano: no se toca (7/10).
          pa.avisos.push(`En campaña sin descuento en el esquema: queda en $ ${Math.round(pub.precioVentaMl).toLocaleString("es-AR")} (el esquema da $ ${Math.round(pa.venta).toLocaleString("es-AR")}).`);
          pa.venta = pub.precioVentaMl;
        }
      }
    }
    // La gemela de catálogo nunca cambia su precio publicado (Fer, 10/10): ML le copia el de la original, y cambiárselo
    // a ella se lo cambia también a la original (bajó el tachado de las F412DA y las sacó de Día de la Madre). Sólo entra
    // o sale de campañas, al precio de venta del esquema.
    if (pub.gemelaDe && pub.precioListaMl != null) {
      if (!igual(pub.precioListaMl, pa.lista)) pa.avisos.push(`Publicación de catálogo atada a ${pub.gemelaDe}: su precio publicado lo copia Mercado Libre de ésa; acá sólo se manejan sus campañas.`);
      pa.lista = pub.precioListaMl;
      if (pa.venta != null && pa.lista <= pa.venta + 0.5) pa.venta = pa.lista;
    }
    // Una campaña nunca sube el precio: si el de venta queda arriba del publicado, el publicado sube a él (en la gemela,
    // que no cambia su precio publicado, se vende a ése).
    if (pa.lista != null && pa.venta != null && pa.venta > pa.lista + 0.5) {
      if (pub.gemelaDe) pa.venta = pa.lista;
      else pa.lista = pa.venta;
    }
    pa.cambiaPrecio = !igual(pub.precioListaMl, pa.lista);
    // Campañas: con tachado, la publicación va a su precio de venta con campaña
    // (la Clásica, el destacado —en las mismas que la Clásica— y cada plan).
    // Para cambiar el precio hay que salir antes de las campañas en las que
    // está (ML no deja) y volver a entrar.
    if (pa.lista !== pa.venta) {
      // La campaña propia de la cuenta (Fer, 8/10) va sólo si ninguna de Mercado Libre acepta el precio; si
      // aparece una de ML que lo acepta, sale de la propia y entra a la de ML.
      const propia = r.campanaPropia ?? null;
      const esPropia = (x: Campana) => !!propia && (x.id === propia.id || (x.tipo === "SELLER_CAMPAIGN" && x.nombre === propia.nombre));
      const propiasAdentro = adentro.filter(esPropia);
      const c = campanasPara(pub.campanas.filter((x) => !esPropia(x)), pa.venta!, pa.rol === "destacado" ? idsClasica : undefined);
      pa.salir = pa.cambiaPrecio ? adentro : c.salir;
      pa.entrar = pa.cambiaPrecio ? [...c.entrar.filter((x) => !c.quedan.includes(x)), ...c.quedan] : c.entrar;
      // Una campaña que arranca más adelante no da descuento hoy (Fer, 10/10: la 9x del K24 quedó sólo en «OFERTAS
      // OCTUBRE», que arranca el 19/10, y se vendía al tachado): mientras tanto va también a la propia.
      const ahora = r.ahora ?? new Date();
      const futuras = [...c.entrar, ...c.quedan].filter((x) => !rigeHoy(x, ahora));
      if ([...c.entrar, ...c.quedan].some((x) => rigeHoy(x, ahora))) {
        for (const x of propiasAdentro) if (!pa.salir.includes(x)) pa.salir.push(x);
      } else if (propia) {
        if (futuras.length) {
          const dia = (x: Campana) => new Date(x.desde!).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric" });
          pa.avisos.push(`${futuras.map((x) => `«${x.nombre ?? x.tipo}» arranca el ${dia(x)}`).join(", ")}: hasta entonces va también a «${propia.nombre}».`);
        }
        const yaEsta = propiasAdentro.find((x) => x.id === propia.id && igual(x.precio, pa.venta));
        if (!yaEsta || pa.cambiaPrecio) {
          for (const x of propiasAdentro) if (!pa.salir.includes(x)) pa.salir.push(x);
          pa.entrar = [...pa.entrar, { id: propia.id, tipo: "SELLER_CAMPAIGN", estado: null, nombre: propia.nombre, precio: null, min: null, max: null }];
        }
        if (!pa.entrar.length && !yaEsta) pa.avisos.push("Ninguna campaña acepta ese precio: el comprador pagaría el tachado.");
      } else {
        pa.avisos.push(pub.campanas.length ? "Ninguna campaña acepta ese precio: el comprador pagaría el tachado." : "Sin campañas leídas: el comprador pagaría el tachado hasta que entre en una.");
      }
    } else {
      pa.salir = adentro;
    }
    pa.volumen = preciosPorCantidad(pa.venta!, vol.escalones);
    const antes = (pub.volumenMl ?? []).map((x) => `${x.cantidad}:${x.precio}`).join(",");
    if (pa.volumen.length) pa.cambiaVolumen = antes !== pa.volumen.map((x) => `${x.cantidad}:${x.precio}`).join(",");
    else if (antes) pa.avisos.push("Tenía descuento por volumen y ya no le corresponde: sacalo a mano en ML.");
    return pa;
  });

  // Planes habilitados sin publicación: se pueden crear (con el user product de otra publicación de la variación).
  const conUp = e.pubs.find((p) => p.userProductId) ?? null;
  const conCat = e.pubs.find((p) => p.catalogProductId) ?? null;
  const faltan = habilitados.filter((p) => !pubDe(p.plan) && !e.planesPausados?.includes(p.plan) && p.precio != null).map((p) => ({
    plan: p.plan, precio: p.precio!, userProductId: conUp?.userProductId ?? null, catalogProductId: conCat?.catalogProductId ?? null,
  }));

  return {
    variacionId: e.variacionId, clasica, clasicaLista: base, ajustePct, tachadoPct, tachado: tach, tachadoOrigen: t.origen, planes, destacado, pubs, faltan,
    volumen: vol, avisos,
  };
}

// ── Los pedidos a ML de una propuesta ───────────────────────

export type PedidoHttp = { metodo: "PUT" | "POST" | "DELETE"; ruta: string; cuerpo?: unknown };

/** Lo que pone el vendedor en una campaña: en las propias, su precio; en las
 *  que arma ML con descuento compartido, el precio sin descuento menos la parte
 *  del vendedor (la de ML no sale de su bolsillo). */
export function precioVendedorCampana(c: Campana): number | null {
  if (!CON_PRECIO.includes(c.tipo) && c.original && c.pctVendedor != null) return Math.round(c.original * (1 - c.pctVendedor / 100));
  return c.precio != null && c.precio > 0 ? Number(c.precio) : null;
}

/** Las campañas en curso de una publicación que la dejan debajo del piso del esquema. */
export function campanasBajoPiso(pa: PropuestaPub): { campana: Campana; precio: number }[] {
  if (pa.piso == null) return [];
  const salida: { campana: Campana; precio: number }[] = [];
  for (const c of pa.pub.campanas) {
    if (c.estado !== "started" && c.estado !== "pending") continue;
    const precio = precioVendedorCampana(c);
    if (precio != null && precio < pa.piso - 0.5) salida.push({ campana: c, precio });
  }
  return salida;
}

/** Salir de una campaña. */
export function pedidoSalirCampana(itemId: string, c: Campana): PedidoHttp {
  return { metodo: "DELETE", ruta: `/seller-promotions/items/${itemId}?promotion_type=${encodeURIComponent(c.tipo)}&promotion_id=${encodeURIComponent(c.id)}&app_version=v2` };
}

/** Precio y campañas de una publicación, en orden: salir de las campañas a
 *  otro precio → cambiar el precio → entrar a las campañas. */
export function pedidosPrecio(pa: PropuestaPub): PedidoHttp[] {
  const id = pa.pub.itemId;
  const salida: PedidoHttp[] = [];
  for (const c of pa.salir) {
    salida.push(pedidoSalirCampana(id, c));
  }
  if (pa.cambiaPrecio && pa.lista != null) {
    const v = pa.pub.variationId ? Number(pa.pub.variationId) : null;
    salida.push({ metodo: "PUT", ruta: `/items/${id}`, cuerpo: v ? { variations: [{ id: v, price: pa.lista }] } : { price: pa.lista } });
  }
  if (pa.venta != null) {
    for (const c of pa.entrar) {
      salida.push({ metodo: "POST", ruta: `/seller-promotions/items/${id}?app_version=v2`, cuerpo: { promotion_id: c.id, promotion_type: c.tipo, deal_price: pa.venta } });
    }
  }
  return salida;
}

/** Los precios por cantidad (hasta 5) de una publicación. */
export function pedidoVolumen(pa: PropuestaPub): PedidoHttp {
  return {
    metodo: "POST", ruta: `/items/${pa.pub.itemId}/prices/standard/quantity`,
    // ML exige el contexto en cada escalón («Marketplace context is mandatory», 7/10). Al mandarlo,
    // la cola le suma los precios base que ya tiene la publicación (tablaVolumen): uno que no se
    // nombra, ML lo borra.
    cuerpo: { prices: pa.volumen.map((x) => ({ amount: x.precio, currency_id: "ARS", conditions: { context_restrictions: ["channel_marketplace"], min_purchase_unit: x.cantidad } })) },
  };
}

type PrecioMl = { id?: string | number; type?: string; conditions?: { min_purchase_unit?: number | null } | null };

/** La tabla de precios por cantidad que se manda a ML: los precios "standard" que ya
 *  tiene la publicación sin cantidad mínima (el precio base, por canal) van por su id,
 *  para que ML no los borre; los escalones viejos no se nombran (se reemplazan por los
 *  nuevos). Pura: se prueba sin ML. */
export function tablaVolumen(actuales: PrecioMl[], nuevos: unknown[]): unknown[] {
  const base = actuales.filter((p) => p.type === "standard" && p.id != null && !(Number(p.conditions?.min_purchase_unit) > 1));
  return [...base.map((p) => ({ id: String(p.id) })), ...nuevos];
}

/** Crear la publicación de un plan: ya no sale de acá. Colgarla del user
 *  product (POST /user-products/{up}/items) daba 500 siempre (7/10); una
 *  publicación de cuotas es una publicación propia (POST /items, Premium con
 *  la marca del plan, copiando todo de otra) y se prepara desde Creaciones en
 *  ML. La vista previa sigue mostrando qué planes faltan. */
export function pedidoCrear(_f: Propuesta["faltan"][number]): PedidoHttp | null {
  return null;
}

/** Qué cambia, en palabras (Fer, 8/10: «que diga claramente qué cambia»), separado por "; ":
 *  «Paga el comprador: $ 13.000 → $ 12.000; Sale de «Día de la Madre» y vuelve a entrar a $ 12.000». */
export function queCambia(pa: PropuestaPub): string {
  const n = (x: number) => `$ ${Math.round(x).toLocaleString("es-AR")}`;
  const nombres = (cs: Campana[]) => cs.map((c) => `«${c.nombre ?? c.tipo}»`).join(", ");
  const partes: string[] = [];
  const conTachado = pa.lista != null && pa.venta != null && pa.lista > pa.venta + 0.5;
  if (pa.cambiaPrecio && pa.lista != null) partes.push(`${conTachado ? "Precio publicado (tachado)" : "Precio publicado"}: ${pa.pub.precioListaMl != null ? `${n(pa.pub.precioListaMl)} → ` : ""}${n(pa.lista)}`);
  const pagaHoy = pa.pub.precioVentaMl;
  if (pa.venta != null && (pa.salir.length || pa.entrar.length || pa.cambiaPrecio) && (pagaHoy == null || Math.abs(pagaHoy - pa.venta) >= 1)) {
    partes.push(`Paga el comprador: ${pagaHoy != null ? `${n(pagaHoy)} → ` : ""}${n(pa.venta)}`);
  }
  const vuelve = pa.salir.filter((c) => pa.entrar.some((x) => x.id === c.id));
  const soloSale = pa.salir.filter((c) => !vuelve.includes(c));
  const soloEntra = pa.entrar.filter((c) => !vuelve.some((x) => x.id === c.id));
  if (vuelve.length && pa.venta != null) partes.push(`Sale de ${nombres(vuelve)} y vuelve a entrar a ${n(pa.venta)}`);
  if (soloSale.length) partes.push(`Sale de ${nombres(soloSale)}`);
  if (soloEntra.length && pa.venta != null) partes.push(`Entra a ${nombres(soloEntra)} a ${n(pa.venta)}`);
  if (pa.cambiaVolumen) partes.push(`Descuento por volumen: ${pa.volumen.map((x) => `${x.cantidad}+ ${n(x.precio)}`).join(", ")}`);
  return partes.join("; ");
}
