// Diagnóstico de Apify (Fer, 28/10: la búsqueda de precio de mercado devolvía vacías casi todas las búsquedas). La llama
// la base (pg_net) con ?clave= (tabla erp_llave) y la respuesta se lee de net._http_response. Sin llaves en la respuesta.
//   · ?accion=runs&ids=a,b,c: de cada corrida, estado, mensaje, entrada, cuántos resultados y el final del registro (sólo lee);
//   · ?accion=probar&q=texto: corre una búsqueda con la entrada de siempre y con la dirección del listado de Mercado Libre,
//     hasta 30 resultados cada una (unos centavos), y cuenta lo que trae cada forma;
//   · ?accion=tienda&q=mercado libre: las herramientas de la tienda de Apify que coinciden (nombre, usuarios, precio);
//   · ?accion=actor&actor=usuario~nombre&q=texto: corre esa herramienta con la entrada armada desde su esquema (hasta 20
//     resultados, tope US$ 0,25) y dice cuántos trajo, cuánto costó, el mensaje de estado y un ejemplo.

import { pool } from "@/db";
import { apifyToken, correrActor, correrConEntrada } from "@/lib/apify";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const API = "https://api.apify.com/v2";
const ACTOR = "scrapesage~mercadolibre-scraper";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const clave = q.get("clave");
  const ok = clave ? await pool.query("select 1 from erp_llave where id = 1 and clave = $1", [clave]) : null;
  if (!ok?.rowCount) return new Response("No", { status: 403 });
  const token = apifyToken();
  if (!token) return Response.json({ error: "Falta APIFY_TOKEN" });
  try {
    if (q.get("accion") === "runs") {
      const ids = (q.get("ids") ?? "").split(",").filter((x) => /^[A-Za-z0-9]{10,}$/.test(x)).slice(0, 10);
      return Response.json(await Promise.all(ids.map(async (id) => {
        const run = await fetch(`${API}/actor-runs/${id}?token=${token}`, { cache: "no-store" }).then((r) => r.json()).then((x) => x.data).catch((e) => ({ error: String(e) }));
        const entrada = run?.defaultKeyValueStoreId
          ? await fetch(`${API}/key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT?token=${token}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null) : null;
        const registro = await fetch(`${API}/logs/${id}?token=${token}`, { cache: "no-store" }).then((r) => r.text()).catch(() => "");
        return {
          id, estado: run?.status, mensaje: run?.statusMessage, inicio: run?.startedAt, fin: run?.finishedAt, costo: run?.usageTotalUsd,
          resultados: run?.stats?.resultCount ?? null, actor: run?.actId, version: run?.buildNumber, entrada,
          registro: registro.split("\n").filter(Boolean).slice(-40).join("\n").replace(/token=[^&\s]+/g, "token=…"),
        };
      })));
    }
    if (q.get("accion") === "probar") {
      const texto = (q.get("q") ?? "").slice(0, 80);
      const formas: [string, Record<string, unknown>][] = [
        ["searchQueries", { site: "MLA", searchQueries: [texto], maxItems: 30, maxPagesPerQuery: 1, includeProductDetails: false }],
        ["startUrls listado", { site: "MLA", startUrls: [{ url: `https://listado.mercadolibre.com.ar/${encodeURIComponent(texto.toLowerCase().replace(/\s+/g, "-"))}` }], maxItems: 30, maxPagesPerQuery: 1, includeProductDetails: false }],
      ];
      return Response.json(await Promise.all(formas.map(async ([nombre, entrada]) => {
        const c = await correrConEntrada(ACTOR, entrada, { max: 30, esperaSeg: 150, topeUsd: 0.2 });
        return { forma: nombre, runId: c.runId, estado: c.estado, error: c.error, costo: c.costoUsd, resultados: c.items.length,
          ejemplo: (c.items as Record<string, unknown>[]).slice(0, 3).map((x) => ({ titulo: x.title, precio: x.price, url: x.url })) };
      })));
    }
    if (q.get("accion") === "tienda") {
      const r = await fetch(`${API}/store?search=${encodeURIComponent(q.get("q") ?? "mercado libre")}&limit=40&token=${token}`, { cache: "no-store" }).then((x) => x.json());
      return Response.json((r?.data?.items ?? []).map((x: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        actor: `${x.username}~${x.name}`, titulo: x.title, usuarios: x.stats?.totalUsers, usuarios30: x.stats?.totalUsers30Days,
        modificado: x.modifiedAt, precio: x.currentPricingInfo ?? null,
      })));
    }
    if (q.get("accion") === "actor") {
      const actor = q.get("actor") ?? "";
      if (!/^[\w.-]+~[\w.-]+$/.test(actor)) return Response.json({ error: "actor inválido" });
      const r = await correrActor(actor, (q.get("q") ?? "").slice(0, 80), 20, 180);
      const run = r.runId ? await fetch(`${API}/actor-runs/${r.runId}?token=${token}`, { cache: "no-store" }).then((x) => x.json()).then((x) => x.data).catch(() => null) : null;
      const items = (r.items ?? []) as Record<string, unknown>[];
      return Response.json({ actor, ok: r.ok, error: r.error, estado: r.estado, mensaje: run?.statusMessage, costo: r.costo_usd, segundos: r.segundos,
        cantidad: r.cantidad, entrada: r.entrada, precio: r.precio, claves: items[0] ? Object.keys(items[0]).slice(0, 40) : [],
        ejemplo: items.slice(0, 3).map((x) => ({ titulo: x.title ?? x.name, precio: x.price ?? x.currentPrice, url: x.url ?? x.permalink ?? x.link })) });
    }
    if (q.get("accion") === "esquema") {
      // El esquema de entrada de una herramienta (para ver sus modos y campos).
      const actor = q.get("actor") ?? "";
      if (!/^[\w.-]+~[\w.-]+$/.test(actor)) return Response.json({ error: "actor inválido" });
      const info = await fetch(`${API}/acts/${actor}?token=${token}`, { cache: "no-store" }).then((x) => x.json()).then((x) => x.data);
      const build = info?.taggedBuilds?.latest?.buildId
        ? await fetch(`${API}/actor-builds/${info.taggedBuilds.latest.buildId}?token=${token}`, { cache: "no-store" }).then((x) => x.json()).then((x) => x.data) : null;
      const crudo = build?.inputSchema ?? build?.actorDefinition?.input;
      const esquema = typeof crudo === "string" ? JSON.parse(crudo) : crudo;
      return Response.json(Object.fromEntries(Object.entries((esquema?.properties ?? {}) as Record<string, Record<string, unknown>>).map(([k, c]) =>
        [k, { tipo: c.type, opciones: c.enum, defecto: c.default, ayuda: String(c.description ?? "").slice(0, 200) }])));
    }
    if (q.get("accion") === "correr") {
      // Una herramienta con la entrada exacta (JSON en ?entrada=), hasta 30 resultados y tope US$ 0,25.
      const actor = q.get("actor") ?? "";
      if (!/^[\w.-]+~[\w.-]+$/.test(actor)) return Response.json({ error: "actor inválido" });
      const t0 = Date.now();
      const c = await correrConEntrada(actor, JSON.parse(q.get("entrada") ?? "{}"), { max: 30, esperaSeg: 200, topeUsd: 0.25 });
      const items = c.items as Record<string, unknown>[];
      return Response.json({ actor, estado: c.estado, mensaje: c.mensaje, error: c.error, costo: c.costoUsd, cobros: c.cobros, segundos: Math.round((Date.now() - t0) / 1000),
        cantidad: items.length, ejemplo: items.slice(0, 2).map((x) => ({ titulo: x.title ?? x.name, precio: x.price, vendedor: x.sellerName ?? x.vendor_name, url: x.url ?? x.url_item })) });
    }
    return Response.json({ error: "accion: runs, probar, tienda, actor o correr" });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
