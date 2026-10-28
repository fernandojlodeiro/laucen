// Diagnóstico de Apify (Fer, 28/10: la búsqueda de precio de mercado devolvía vacías casi todas las búsquedas). La llama
// la base (pg_net) con ?clave= (tabla erp_llave) y la respuesta se lee de net._http_response. Sin llaves en la respuesta.
//   · ?accion=runs&ids=a,b,c: de cada corrida, estado, mensaje, entrada, cuántos resultados y el final del registro (sólo lee);
//   · ?accion=probar&q=texto: corre una búsqueda con la entrada de siempre y con la dirección del listado de Mercado Libre,
//     hasta 30 resultados cada una (unos centavos), y cuenta lo que trae cada forma.

import { pool } from "@/db";
import { apifyToken, correrConEntrada } from "@/lib/apify";

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
    return Response.json({ error: "accion: runs o probar" });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
