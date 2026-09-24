import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { db } from "@/db";
import { meliPruebas } from "@/db/meli";
import { apifyToken, correrActor, type ResultadoActor } from "@/lib/apify";
import { SUAVE, PRIMARIO } from "@/app/botones";

export const dynamic = "force-dynamic";
// Los actores tardan de segundos a un par de minutos; corren en paralelo.
export const maxDuration = 300;

// Prueba comparativa de actores de Apify para Mercado Libre (interno, sólo
// Fer): la misma búsqueda en varios actores, 20 resultados cada uno, con tope
// de gasto de USD 0,50 por actor. Cada corrida queda en `meli_pruebas`.

export const metadata = {
  title: "Apify — Mercado Libre",
  robots: { index: false, follow: false },
};

const ACTORES = [
  "devcake/mercadolibre-scraper",
  "scrapesage/mercadolibre-scraper",
  "parsebird/mercadolibre-scraper",
  "karamelo/mercado-libre-listings-scraper",
];
const MAX = 20;

function Resultado({ r }: { r: ResultadoActor }) {
  const primero = r.items?.[0];
  return (
    <details className="border border-[#E3E9F0] rounded-lg mb-2 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs flex flex-wrap gap-2 items-center">
        <span className={`font-bold rounded px-1.5 py-0.5 ${r.ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {r.ok ? `${r.cantidad} resultados` : r.estado ?? "error"}
        </span>
        <code>{r.actor}</code>
        <span className="text-[#5C6B76]">
          {r.segundos}s{r.costo_usd != null && ` · USD ${r.costo_usd.toFixed(4)}`}
        </span>
      </summary>
      <div className="px-3 pb-3 text-[11px]">
        {r.error && <p className="text-[#C03420] mb-2">{r.error}</p>}
        <p className="text-[#5C6B76]">Entrada que se armó:</p>
        <pre className="overflow-x-auto mb-2">{JSON.stringify(r.entrada, null, 2)}</pre>
        {primero !== undefined && (
          <>
            <p className="text-[#5C6B76]">Primer resultado:</p>
            <pre className="overflow-x-auto max-h-96">{JSON.stringify(primero, null, 2).slice(0, 6000)}</pre>
          </>
        )}
      </div>
    </details>
  );
}

export default async function Apify({ searchParams }: {
  searchParams: Promise<{ q?: string; actor?: string | string[] }>;
}) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const elegidos = sp.actor ? [sp.actor].flat() : ACTORES;
  const hayToken = !!apifyToken();

  let resultados: ResultadoActor[] = [];
  if (q && hayToken && elegidos.length) {
    resultados = await Promise.all(elegidos.map((a) => correrActor(a.replace("/", "~"), q, MAX, 240)));
    await db.insert(meliPruebas).values({ organizacionId: sesion.org.id, consulta: `apify: ${q}`, resultados });
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <Link href="/admin/meli" className={`inline-block mb-2 ${SUAVE}`}>← Mercado Libre</Link>
      <h1 className="text-lg font-bold mb-4">Apify — scrapers de Mercado Libre</h1>

      {!hayToken && (
        <p className="text-sm text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-4">
          Falta <code>APIFY_TOKEN</code> en Vercel.
        </p>
      )}

      <form className="mb-6 grid gap-3">
        <div className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="ej: carpa indoor 80x80"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 flex-1 text-sm" />
          <button className={PRIMARIO}>Correr</button>
        </div>
        <fieldset className="grid gap-1 text-xs">
          {ACTORES.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" name="actor" value={a} defaultChecked={elegidos.includes(a)} />
              <code>{a}</code>
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-[#5C6B76]">
          {MAX} resultados por actor, tope de USD 0,25 por actor. Corren en paralelo: puede tardar hasta 4 minutos.
        </p>
      </form>

      {resultados.map((r) => <Resultado key={r.actor} r={r} />)}
    </main>
  );
}
