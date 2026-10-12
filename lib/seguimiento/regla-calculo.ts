// Las cuentas de la regla de precio del seguimiento, sin base (las usan el
// servidor y la vista previa del navegador mientras se edita la regla).

export type ModoRegla = "apagada" | "propuesta" | "automatico";
export type ComoRegla = "igual" | "pesos" | "pct";

export const MODOS_REGLA: Record<ModoRegla, string> = {
  apagada: "Apagada",
  propuesta: "Proponer el cambio y esperar mi clic",
  automatico: "Automático: cambiar la lista sola",
};
export const COMO_REGLA: Record<ComoRegla, string> = { igual: "Igualar su precio", pesos: "Quedar X pesos abajo", pct: "Quedar X % abajo" };

/** El precio al que hay que quedar, según el de la referencia. En pesos enteros, hacia abajo. Pura. */
export function objetivoDe(referencia: number, como: ComoRegla, diferencia: number): number {
  const v = como === "igual" ? referencia : como === "pesos" ? referencia - diferencia : referencia * (1 - diferencia / 100);
  return Math.floor(v);
}

/** Qué hacer con una Clásica: bajar hasta el objetivo, nunca por debajo del piso; con techo (también subir),
 *  subir hasta el objetivo, nunca por encima del techo. Pura. */
export function decidir(actual: number, objetivo: number, piso: number, techo: number | null = null): { nuevo: number | null; motivo: string } {
  if (actual > objetivo) {
    if (actual <= piso) return { nuevo: null, motivo: "ya está en el piso" };
    if (objetivo < piso) return { nuevo: piso, motivo: "queda en el piso" };
    return { nuevo: objetivo, motivo: "" };
  }
  if (actual === objetivo) return { nuevo: null, motivo: "ya está en el objetivo" };
  if (techo == null) return { nuevo: null, motivo: "ya está más barato (no sube)" };
  if (actual >= techo) return { nuevo: null, motivo: "ya está en el techo" };
  if (objetivo > techo) return { nuevo: techo, motivo: "queda en el techo" };
  return { nuevo: objetivo, motivo: "" };
}

/** Una publicación seguida, para elegir la referencia. */
export type Candidata = { id: number; nombre: string; precio: number | null; estado: string | null; moneda: string | null; excluido: boolean; internacional: boolean | null };
export type Parametros = { contra: "mas_barato" | "una"; seguimientoId: number | null; como: ComoRegla; diferencia: number; piso: number | null; subir: boolean; techo: number | null };

/** La referencia: la elegida o la más barata de las activas con precio en pesos, sin excluidas ni internacionales. Pura. */
export function referenciaEntre(c: Candidata[], p: Pick<Parametros, "contra" | "seguimientoId">): Candidata | null {
  const validas = c.filter((x) => x.estado === "activa" && x.precio != null && (x.moneda ?? "ARS") === "ARS" && !x.excluido && !x.internacional);
  if (p.contra === "una") return validas.find((x) => x.id === p.seguimientoId) ?? null;
  return validas.sort((a, b) => a.precio! - b.precio!)[0] ?? null;
}

export type Simulacion = {
  referencia: Candidata | null; objetivo: number | null;
  filas: { sku: string; actual: number | null; nuevo: number | null; motivo: string }[];
};

/** Qué haría la regla con cada Clásica, con estos parámetros (sin el piso, no cambia nada). Pura. */
export function simular(clasicas: { sku: string; ars: number | null }[], candidatas: Candidata[], p: Parametros): Simulacion {
  const ref = referenciaEntre(candidatas, p);
  if (!ref) return { referencia: null, objetivo: null, filas: clasicas.map((c) => ({ sku: c.sku, actual: c.ars, nuevo: null, motivo: "sin referencia" })) };
  const objetivo = objetivoDe(ref.precio!, p.como, p.como === "igual" ? 0 : p.diferencia);
  return {
    referencia: ref, objetivo,
    filas: clasicas.map((c) => {
      if (c.ars == null) return { sku: c.sku, actual: null, nuevo: null, motivo: "sin precio en la lista" };
      if (!p.piso) return { sku: c.sku, actual: c.ars, nuevo: null, motivo: "falta el piso" };
      const d = decidir(c.ars, objetivo, p.piso, p.subir ? p.techo : null);
      return { sku: c.sku, actual: c.ars, nuevo: d.nuevo, motivo: d.motivo };
    }),
  };
}
