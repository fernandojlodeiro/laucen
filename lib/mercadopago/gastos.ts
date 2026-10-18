// Los gastos de Mercado Pago (pedido de Fer, 18/10): cada movimiento de las
// cuentas, con su categoría, a quién corresponde (personal / empresa / mixto)
// y si es gasto o no (las transferencias entre cuentas propias, los retiros a
// banco y los ingresos no son gasto). Sirve para el tablero personal y el de
// la empresa: quien llama pasa los movimientos, las cuentas propias y las
// marcas y reglas de su lado.
//
// Orden de decisión: la marca puesta a mano en el movimiento → una regla
// guardada («todo lo de este destinatario / este texto es …») → transferencia
// entre cuentas propias → reglas fijas (por tipo de movimiento y por palabras
// de la descripción). Lo que no encaja queda «Sin clasificar».

export const CATEGORIAS = [
  "Impuestos", "Servicios (luz, gas, agua)", "Telefonía e internet", "Vivienda y expensas", "Compras", "Supermercado y comida", "Salud",
  "Transporte y auto", "Suscripciones", "Viajes", "Educación", "Comisiones y cargos de Mercado Pago", "Envíos", "Reclamos y devoluciones de ventas",
  "Transferencias a terceros", "Otros", "Sin clasificar",
] as const;
export const AMBITOS = ["personal", "empresa", "mixto", "sin clasificar"] as const;
export const RECURRENCIAS = ["recurrente", "eventual", "extraordinario", "sin clasificar"] as const;

/** Lo que no es gasto: se muestra aparte y nunca se suma al gasto. */
export const NO_GASTO = ["Transferencia entre cuentas propias", "Retiro a banco propio", "Ingreso", "Devolución recibida", "Rendimiento", "Movimiento interno de Mercado Pago"] as const;

export type MovGasto = {
  conexion_id: number; cuenta: string; cuenta_mp_id: number; clave: string; movimiento_id: string | null; tipo_original: string;
  fecha: Date | null; importe_neto: number; descripcion: string | null; medio_pago: string | null;
  api_tipo: string | null; api_descripcion: string | null; cobrador_id: string | null; pagador_id: string | null; tipo_medio: string | null;
};
export type Marca = { conexion_id: number; clave: string; categoria: string | null; ambito_gasto: string | null; recurrencia: string | null; nota: string | null };
export type Regla = { id: number; campo: "contraparte" | "texto"; valor: string; categoria: string | null; ambito_gasto: string | null; recurrencia: string | null };

export type Clasificado = MovGasto & {
  ambito_cuenta: "personal" | "empresa";
  contraparte: string | null; texto: string; categoria: string; ambito_gasto: string; recurrencia: string; es_gasto: boolean; grupo: string; origen: string;
  /** Pista de que podría ser un gasto personal (sólo en cuentas de la empresa). */
  posible_personal: string | null;
};

// Palabras de la descripción → categoría (en minúsculas, sin acentos). La primera que encaja gana.
const PALABRAS: [RegExp, string, string][] = [
  [/\b(arca|afip|arba|agip|rentas|municipalidad|impuesto|monotributo|iibb|ingresos brutos|vep)\b/, "Impuestos", "recurrente"],
  [/\b(telecom|claro|personal|movistar|fibertel|telecentro|flow|directv|starlink|iplan)\b/, "Telefonía e internet", "recurrente"],
  [/\b(edenor|edesur|epec|metrogas|naturgy|aysa|camuzzi|ecogas|litoral gas|edelap|edea|aguas|energia|electricidad)\b/, "Servicios (luz, gas, agua)", "recurrente"],
  [/\b(expensas|alquiler|consorcio|inmobiliaria)\b/, "Vivienda y expensas", "recurrente"],
  [/\b(meli\+|meli plus|netflix|spotify|disney|youtube|google|apple|icloud|microsoft|adobe|chatgpt|openai|hbo|paramount|suscripcion)\b/, "Suscripciones", "recurrente"],
  [/\b(ypf|shell|axion|puma|peaje|ausa|autopista|cabify|uber|didi|sube|patente|estacionamiento|seguro auto|vtv)\b/, "Transporte y auto", "eventual"],
  [/\b(coto|carrefour|supermercado dia|jumbo|disco|vea|changomas|walmart|supermercado|almacen|verduleria|carniceria|pedidosya|rappi|restaurant|cafe|dean & dennys|mcdonald|burger)\b/, "Supermercado y comida", "eventual"],
  [/\b(farmacia|farmacity|osde|swiss medical|galeno|medife|omint|sancor salud|medico|clinica|sanatorio|laboratorio|odontolog)\b/, "Salud", "recurrente"],
  [/\b(aerolineas|flybondi|jetsmart|latam|despegar|booking|airbnb|hotel|turismo)\b/, "Viajes", "eventual"],
  [/\b(colegio|universidad|curso|escuela|udemy|coursera)\b/, "Educación", "recurrente"],
];
const sinAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// Categorías que, pagadas desde la empresa, son pista de gasto personal.
const PERSONALES = new Set(["Supermercado y comida", "Salud", "Viajes", "Educación"]);

/** Clasifica los movimientos. `propias`: los números de cuenta de Mercado Pago propios (las 6). `pagadosDesdePersonal`:
 *  los destinatarios a los que se pagó desde una cuenta personal (pista de gasto personal en la empresa). */
export function clasificarGastos(movs: MovGasto[], o: { propias: Set<string>; ambitoCuenta: (m: MovGasto) => "personal" | "empresa"; marcas: Marca[]; reglas: Regla[]; pagadosDesdePersonal?: Set<string> }): Clasificado[] {
  const marcas = new Map(o.marcas.map((x) => [`${x.conexion_id}|${x.clave}`, x]));
  return movs.map((m) => {
    const neto = Number(m.importe_neto);
    const yo = String(m.cuenta_mp_id);
    const contraparte = m.cobrador_id === yo ? m.pagador_id : m.cobrador_id;
    const texto = sinAcentos(`${m.api_descripcion ?? ""} ${m.descripcion ?? ""}`.trim());
    const ambitoCuenta = o.ambitoCuenta(m);
    let categoria = "Sin clasificar", recurrencia = "sin clasificar", grupo = "gasto", origen = "sin regla";
    let ambito = ambitoCuenta === "personal" ? "personal" : "empresa";

    // Lo que no es gasto, por el tipo de movimiento.
    if (m.tipo_original === "WITHDRAWAL" || m.tipo_original === "PAYOUT" || m.tipo_original === "WITHDRAWAL_CANCEL") { grupo = "Retiro a banco propio"; origen = "tipo retiro"; }
    else if (m.api_tipo === "money_transfer" && contraparte && o.propias.has(contraparte)) { grupo = "Transferencia entre cuentas propias"; origen = "contraparte propia"; }
    else if (neto > 0) {
      if (m.tipo_original === "REFUND" || m.tipo_original === "CHARGEBACK") { grupo = "Devolución recibida"; origen = "tipo devolución"; }
      else if (!m.movimiento_id || (!m.medio_pago && !m.api_tipo && neto < 5000)) { grupo = "Rendimiento"; origen = "entrada sin operación"; }
      else { grupo = "Ingreso"; origen = "entrada"; }
    } else if (neto === 0) { grupo = "Movimiento interno de Mercado Pago"; origen = "sin efecto en el saldo"; }

    if (grupo === "gasto") {
      // Reglas fijas.
      if (m.tipo_original === "SETTLEMENT_SHIPPING" || m.tipo_original === "DISPUTE_SHIPPING") { categoria = "Envíos"; recurrencia = "eventual"; origen = "tipo envío"; }
      else if (m.tipo_original === "REFUND" || m.tipo_original === "CHARGEBACK" || m.tipo_original === "DISPUTE") { categoria = "Reclamos y devoluciones de ventas"; recurrencia = "eventual"; origen = "tipo reclamo"; }
      else if (m.api_tipo === "recurring_payment") { categoria = "Suscripciones"; recurrencia = "recurrente"; origen = "pago recurrente"; }
      else {
        const p = PALABRAS.find(([re]) => re.test(texto));
        if (p) { categoria = p[1]; recurrencia = p[2]; origen = `palabra en la descripción`; }
        else if (m.api_tipo === "money_transfer") { categoria = "Transferencias a terceros"; origen = "transferencia"; }
        else if (!m.movimiento_id || m.tipo_original !== "SETTLEMENT") { categoria = "Comisiones y cargos de Mercado Pago"; origen = "cargo sin operación"; }
        else if (m.api_tipo === "regular_payment" && texto) { categoria = "Compras"; recurrencia = "eventual"; origen = "pago con descripción"; }
      }
      // Reglas guardadas: por destinatario (exacto) o por texto (contiene).
      const r = o.reglas.find((x) => x.campo === "contraparte" ? contraparte === x.valor : texto.includes(sinAcentos(x.valor)));
      if (r) {
        if (r.categoria) categoria = r.categoria;
        if (r.ambito_gasto) ambito = r.ambito_gasto;
        if (r.recurrencia) recurrencia = r.recurrencia;
        origen = `regla: ${r.campo === "contraparte" ? "destinatario" : "texto"} ${r.valor}`;
      }
    }
    // La marca a mano manda sobre todo (también puede volver gasto algo que no lo parecía, o al revés).
    const mk = marcas.get(`${m.conexion_id}|${m.clave}`);
    if (mk) {
      if (mk.categoria) {
        if ((NO_GASTO as readonly string[]).includes(mk.categoria)) grupo = mk.categoria;
        else { grupo = "gasto"; categoria = mk.categoria; }
      }
      if (mk.ambito_gasto) ambito = mk.ambito_gasto;
      if (mk.recurrencia) recurrencia = mk.recurrencia;
      origen = "marcado a mano";
    }
    const es_gasto = grupo === "gasto";
    let posible_personal: string | null = null;
    if (es_gasto && ambitoCuenta === "empresa" && ambito === "empresa" && !mk) {
      if (contraparte && o.pagadosDesdePersonal?.has(contraparte)) posible_personal = "al mismo destinatario se le pagó desde la cuenta personal";
      else if (PERSONALES.has(categoria)) posible_personal = `categoría ${categoria}`;
      else if (m.fecha && [0, 6].includes(new Date(m.fecha.getTime() - 3 * 3600_000).getUTCDay()) && categoria !== "Envíos" && categoria !== "Reclamos y devoluciones de ventas") posible_personal = "pagado un fin de semana";
    }
    return { ...m, ambito_cuenta: ambitoCuenta, importe_neto: neto, contraparte, texto, categoria: es_gasto ? categoria : grupo, ambito_gasto: ambito, recurrencia, es_gasto, grupo, origen, posible_personal };
  });
}

/** Mes en hora argentina (AAAA-MM). */
export const mesAr = (d: Date | null) => (d ? new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 7) : "sin fecha");

/** Los 12 meses cerrados hasta el mes pasado y el mes en curso. */
export function mesesDelAnio(ahora = new Date()) {
  const ar = new Date(ahora.getTime() - 3 * 3600_000);
  const meses: string[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth() - i, 1));
    meses.push(d.toISOString().slice(0, 7));
  }
  return { meses, cerrados: meses.slice(0, 12), enCurso: meses[12] };
}

export type Tablero = {
  meses: string[]; enCurso: string;
  totalAnio: number; promedioMensual: number; sinClasificar: number; sinClasificarCant: number;
  porMes: { mes: string; total: number }[];
  porCategoria: { categoria: string; total: number; porMes: Record<string, number>; cantidad: number }[];
  porDestinatario: { contraparte: string; ejemplo: string; total: number; cantidad: number; categoria: string }[];
  recurrenteVsEventual: { recurrencia: string; total: number }[];
  noGasto: { grupo: string; entradas: number; salidas: number; cantidad: number }[];
  personalesDeEmpresa: { cuenta: string; total: number; cantidad: number }[];
  candidatosPersonales: number;
};

/** Los números del tablero: sólo gasto (salidas que son gasto) del ámbito pedido, por mes y categoría. */
export function armarTablero(c: Clasificado[], incluir: (x: Clasificado) => boolean, ahora = new Date()): Tablero {
  const { meses, cerrados, enCurso } = mesesDelAnio(ahora);
  const delAnio = c.filter((x) => meses.includes(mesAr(x.fecha)));
  const gastos = delAnio.filter((x) => x.es_gasto && incluir(x));
  const monto = (x: Clasificado) => -x.importe_neto;
  const suma = (l: Clasificado[]) => Math.round(l.reduce((s, x) => s + monto(x), 0) * 100) / 100;
  const enAnio = gastos.filter((x) => cerrados.includes(mesAr(x.fecha)));
  const cats = new Map<string, Clasificado[]>();
  for (const g of gastos) cats.set(g.categoria, [...(cats.get(g.categoria) ?? []), g]);
  const dest = new Map<string, Clasificado[]>();
  for (const g of enAnio) { const k = g.contraparte ?? (g.api_descripcion || g.descripcion || "sin dato"); dest.set(k, [...(dest.get(k) ?? []), g]); }
  const grupos = new Map<string, Clasificado[]>();
  for (const x of delAnio.filter((y) => !y.es_gasto && incluir(y))) grupos.set(x.grupo, [...(grupos.get(x.grupo) ?? []), x]);
  const sc = enAnio.filter((x) => x.categoria === "Sin clasificar");
  const personalesEmp = gastos.filter((x) => x.ambito_gasto === "personal" && x.ambito_cuenta === "empresa");
  return {
    meses, enCurso,
    totalAnio: suma(enAnio), promedioMensual: Math.round(suma(enAnio) / 12), sinClasificar: suma(sc), sinClasificarCant: sc.length,
    porMes: meses.map((mes) => ({ mes, total: suma(gastos.filter((x) => mesAr(x.fecha) === mes)) })),
    porCategoria: [...cats].map(([categoria, l]) => ({
      categoria, total: suma(l.filter((x) => cerrados.includes(mesAr(x.fecha)))), cantidad: l.length,
      porMes: Object.fromEntries(meses.map((mes) => [mes, suma(l.filter((x) => mesAr(x.fecha) === mes))])),
    })).sort((a, b) => b.total - a.total),
    porDestinatario: [...dest].map(([contraparte, l]) => ({ contraparte, ejemplo: (l.find((x) => x.api_descripcion)?.api_descripcion ?? l[0].descripcion ?? "").slice(0, 60), total: suma(l), cantidad: l.length, categoria: l[0].categoria }))
      .sort((a, b) => b.total - a.total).slice(0, 20),
    recurrenteVsEventual: RECURRENCIAS.map((r) => ({ recurrencia: r, total: suma(enAnio.filter((x) => x.recurrencia === r)) })).filter((x) => x.total),
    noGasto: [...grupos].map(([grupo, l]) => ({ grupo, entradas: Math.round(l.filter((x) => x.importe_neto > 0).reduce((s, x) => s + x.importe_neto, 0)), salidas: Math.round(l.filter((x) => x.importe_neto < 0).reduce((s, x) => s - x.importe_neto, 0)), cantidad: l.length })),
    personalesDeEmpresa: [...new Set(personalesEmp.map((x) => x.cuenta))].map((cuenta) => ({ cuenta, total: suma(personalesEmp.filter((x) => x.cuenta === cuenta && cerrados.includes(mesAr(x.fecha)))), cantidad: personalesEmp.filter((x) => x.cuenta === cuenta).length })),
    candidatosPersonales: gastos.filter((x) => x.posible_personal).length,
  };
}
