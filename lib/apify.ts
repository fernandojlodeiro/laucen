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

type Campo = { type?: string; enum?: unknown[]; default?: unknown; prefill?: unknown; editor?: string };
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

/** Arma la entrada del actor a partir de su esquema: la búsqueda, el máximo
 *  de resultados, Argentina, y el modo de detalle si lo tiene. */
export function armarEntrada(esquema: Esquema, q: string, max: number) {
  const entrada: Record<string, unknown> = {};
  const url = `https://listado.mercadolibre.com.ar/${slug(q)}`;
  for (const [k, c] of Object.entries(esquema.properties ?? {})) {
    const n = k.toLowerCase();
    const arr = c.type === "array";
    if (/start_?urls|^urls$/.test(n)) {
      entrada[k] = c.editor === "stringList" ? [url] : [{ url }];
    } else if (/search|query|keyword|term|^q$/.test(n)) {
      entrada[k] = arr ? [q] : q;
    } else if (c.type === "integer" && /max|limit|count|results|items/.test(n)) {
      entrada[k] = max;
    } else if (/country|site|domain|market/.test(n)) {
      const opciones = (c.enum ?? []).map(String);
      const ar = opciones.find((o) => /^(ar|mla|arg|argentina|mercadolibre\.com\.ar)$/i.test(o))
        ?? opciones.find((o) => /argentin|\.com\.ar|mla/i.test(o));
      if (ar) entrada[k] = arr ? [ar] : ar;
      else if (!opciones.length && c.type === "string") entrada[k] = "AR";
    } else if (c.type === "boolean" && /detail|pdp|full|description|seller/.test(n)) {
      entrada[k] = true;
    }
  }
  return entrada;
}

export type ResultadoActor = {
  actor: string;
  ok: boolean;
  error?: string;
  entrada?: Record<string, unknown>;
  campos_del_esquema?: string[];
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
  let campos: string[] | undefined;
  let precio: unknown;
  try {
    const e = await esquemaDe(actor, token);
    precio = e.precio;
    campos = Object.keys(e.esquema.properties ?? {});
    entrada = armarEntrada(e.esquema, q, max);

    const r = await fetch(
      `${API}/acts/${actor}/runs?token=${token}&maxItems=${max}&maxTotalChargeUsd=0.5&waitForFinish=60`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entrada), cache: "no-store" },
    );
    const cuerpo = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${r.status} ${cuerpo?.error?.message ?? ""}`.trim());
    let run = cuerpo.data;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status) && Date.now() - t0 < esperaSeg * 1000) {
      run = await get(`/actor-runs/${run.id}?waitForFinish=30`, token);
    }
    const items = run.defaultDatasetId
      ? await fetch(`${API}/datasets/${run.defaultDatasetId}/items?token=${token}&clean=true&limit=${max}`, { cache: "no-store" })
          .then((x) => x.json()).catch(() => [])
      : [];
    return {
      actor, ok: run.status === "SUCCEEDED", estado: run.status, entrada, campos_del_esquema: campos, precio,
      costo_usd: run.usageTotalUsd ?? null, cobros: run.chargedEventCounts ?? null, segundos: Math.round((Date.now() - t0) / 1000),
      cantidad: Array.isArray(items) ? items.length : 0, items: Array.isArray(items) ? items : [],
    };
  } catch (e) {
    return { actor, ok: false, error: String(e), entrada, campos_del_esquema: campos, precio,
      segundos: Math.round((Date.now() - t0) / 1000) };
  }
}
