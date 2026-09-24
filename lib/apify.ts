// Apify: correr "actores" (scrapers de terceros) de Mercado Libre y traer lo
// que devuelven. Token en APIFY_TOKEN (Vercel).
//
// Cada actor pide su entrada con nombres distintos (query, search, keyword,
// startUrls…). En vez de escribirla a mano por actor, se lee el esquema de
// entrada del actor desde Apify y se completa por nombre de campo.

const API = "https://api.apify.com/v2";

export function apifyToken() {
  return process.env.APIFY_TOKEN?.trim() || null;
}

async function get(ruta: string, token: string) {
  const r = await fetch(`${API}${ruta}${ruta.includes("?") ? "&" : "?"}token=${token}`, { cache: "no-store" });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${r.status} ${cuerpo?.error?.message ?? ""}`.trim());
  return cuerpo?.data ?? cuerpo;
}

type Campo = { type?: string; enum?: unknown[]; default?: unknown; prefill?: unknown; editor?: string; minimum?: number; maximum?: number };
type Esquema = { properties?: Record<string, Campo>; required?: string[] };

/** Esquema de entrada de la última versión del actor. */
async function esquemaDe(actor: string, token: string): Promise<{ esquema: Esquema; precio: unknown }> {
  const info = await get(`/acts/${actor}`, token);
  const buildId = info?.taggedBuilds?.latest?.buildId;
  let esquema: Esquema = {};
  if (buildId) {
    const build = await get(`/actor-builds/${buildId}`, token);
    const crudo = build?.inputSchema ?? build?.actorDefinition?.input;
    esquema = typeof crudo === "string" ? JSON.parse(crudo) : (crudo ?? {});
  }
  return { esquema, precio: info?.pricingInfos?.at?.(-1) ?? null };
}

function slug(q: string) {
  return q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
}

/** Arma la entrada del actor a partir de su esquema: la búsqueda (por texto
 *  si el actor la acepta; si no, por URL del listado), el máximo de
 *  resultados, una sola página, Argentina, y el detalle de cada producto. */
export function armarEntrada(esquema: Esquema, q: string, max: number) {
  const entrada: Record<string, unknown> = {};
  const url = `https://listado.mercadolibre.com.ar/${slug(q)}`;
  const props = Object.entries(esquema.properties ?? {});
  const esTexto = (c: Campo) => c.type === "string" || c.type === "array";
  const campoBusqueda = props.find(([k, c]) => esTexto(c) && !c.enum && /search|quer|keyword|term|^q$/i.test(k));

  for (const [k, c] of props) {
    const n = k.toLowerCase();
    const arr = c.type === "array";
    const opciones = (c.enum ?? []).map(String);
    if (c.type === "integer" || c.type === "number") {
      // Nunca tocar precios, reseñas ni preguntas; páginas: una sola.
      if (/price|review|question|concurren|timeout|delay|retr/.test(n)) continue;
      let v: number | undefined;
      if (/page/.test(n)) v = 1;
      else if (/max|limit|count|results|items|products/.test(n)) v = max;
      if (v === undefined) continue;
      if (c.minimum !== undefined) v = Math.max(v, c.minimum);
      if (c.maximum !== undefined) v = Math.min(v, c.maximum);
      entrada[k] = v;
    } else if (campoBusqueda?.[0] === k) {
      entrada[k] = arr ? [q] : q;
    } else if (!campoBusqueda && /start_?urls|^urls$/.test(n)) {
      entrada[k] = c.editor === "stringList" ? [url] : [{ url }];
    } else if (/country|site|domain|market/.test(n)) {
      const ar = opciones.find((o) => /^(ar|mla|arg|argentina|mercadolibre\.com\.ar)$/i.test(o))
        ?? opciones.find((o) => /argentin|\.com\.ar|mla/i.test(o));
      if (ar) entrada[k] = arr ? [ar] : ar;
      else if (!opciones.length && c.type === "string") entrada[k] = "AR";
    } else if (/^mode$|type$/.test(n) && opciones.length) {
      const modo = opciones.find((o) => /search|keyword|query|listing/i.test(o));
      if (modo) entrada[k] = modo;
    } else if (c.type === "boolean" && /detail|pdp|full|description|seller|enrich/.test(n) && !/review|question/.test(n)) {
      entrada[k] = true;
    }
  }
  return entrada;
}

/** Resumen corto del esquema (tipo, opciones, mínimos) para poder revisarlo después. */
function resumenEsquema(esquema: Esquema) {
  return Object.fromEntries(Object.entries(esquema.properties ?? {}).map(([k, c]) => [k, {
    type: c.type, ...(c.enum ? { enum: c.enum.slice(0, 15) } : {}),
    ...(c.minimum !== undefined ? { min: c.minimum } : {}), ...(c.maximum !== undefined ? { max: c.maximum } : {}),
    ...(c.default !== undefined ? { default: c.default } : {}), ...(c.prefill !== undefined ? { prefill: c.prefill } : {}),
  }]));
}

export type ResultadoActor = {
  actor: string;
  runId?: string;
  ok: boolean;
  error?: string;
  entrada?: Record<string, unknown>;
  campos_del_esquema?: unknown;
  precio?: unknown;
  estado?: string;
  costo_usd?: number | null;
  cobros?: unknown;
  segundos?: number;
  cantidad?: number;
  items?: unknown[];
};

/** Corre el actor con tope de resultados y de gasto, espera a que termine
 *  (hasta `esperaSeg`) y trae los resultados. Nunca tira. */
export async function correrActor(actor: string, q: string, max: number, esperaSeg: number): Promise<ResultadoActor> {
  const token = apifyToken();
  if (!token) return { actor, ok: false, error: "Falta APIFY_TOKEN" };
  const t0 = Date.now();
  let entrada: Record<string, unknown> | undefined;
  let campos: unknown;
  let precio: unknown;
  try {
    const e = await esquemaDe(actor, token);
    precio = e.precio;
    campos = resumenEsquema(e.esquema);
    entrada = armarEntrada(e.esquema, q, max);

    const r = await fetch(
      `${API}/acts/${actor}/runs?token=${token}&maxItems=${max}&maxTotalChargeUsd=0.25&waitForFinish=60`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entrada), cache: "no-store" },
    );
    const cuerpo = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${r.status} ${cuerpo?.error?.message ?? ""}`.trim());
    let run = cuerpo.data;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status) && Date.now() - t0 < esperaSeg * 1000) {
      run = await get(`/actor-runs/${run.id}?waitForFinish=30`, token);
    }
    // Si no terminó en el tiempo de espera, se corta para que no siga gastando.
    if (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
      run = await fetch(`${API}/actor-runs/${run.id}/abort?token=${token}`, { method: "POST", cache: "no-store" })
        .then((x) => x.json()).then((x) => x.data ?? run).catch(() => run);
    }
    const items = run.defaultDatasetId
      ? await fetch(`${API}/datasets/${run.defaultDatasetId}/items?token=${token}&clean=true&limit=${max}`, { cache: "no-store" })
          .then((x) => x.json()).catch(() => [])
      : [];
    return {
      actor, runId: run.id, ok: run.status === "SUCCEEDED", estado: run.status, entrada, campos_del_esquema: campos, precio,
      costo_usd: run.usageTotalUsd ?? null, cobros: run.chargedEventCounts ?? null, segundos: Math.round((Date.now() - t0) / 1000),
      cantidad: Array.isArray(items) ? items.length : 0, items: Array.isArray(items) ? items : [],
    };
  } catch (e) {
    return { actor, ok: false, error: String(e), entrada, campos_del_esquema: campos, precio,
      segundos: Math.round((Date.now() - t0) / 1000) };
  }
}

/** Costo final de cada corrida, leído de Apify. Apify termina de asentar los
 *  cobros un rato después de que la corrida termina, así que el costo que se
 *  guarda al terminar puede quedar corto: éste es el que vale. */
export async function costosFinales(runIds: string[]) {
  const token = apifyToken();
  if (!token) return {};
  const pares = await Promise.all(runIds.map(async (id) => {
    try {
      const run = await get(`/actor-runs/${id}`, token);
      return [id, { estado: run.status as string, usd: (run.usageTotalUsd ?? null) as number | null, cobros: run.chargedEventCounts ?? null }] as const;
    } catch {
      return [id, null] as const;
    }
  }));
  return Object.fromEntries(pares.filter(([, v]) => v)) as Record<string, { estado: string; usd: number | null; cobros: unknown }>;
}
