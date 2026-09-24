import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, like } from "drizzle-orm";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { db } from "@/db";
import { meliPruebas } from "@/db/meli";
import { apifyToken, costosFinales, type ResultadoActor } from "@/lib/apify";
import { SUAVE } from "@/app/botones";
import { accionCorrerApify } from "./actions";
import { ACTORES, MAX } from "./config";
import BotonCorrer from "./BotonCorrer";

export const dynamic = "force-dynamic";
// La corrida (server action) espera a los actores: hasta ~4 minutos.
export const maxDuration = 300;

// Prueba comparativa de actores de Apify para Mercado Libre (interno, sólo
// Fer). Cargar la página NO corre nada: sólo muestra la última prueba (o la
// pedida) con el costo final que informa Apify. Correr es sólo con el botón.

export const metadata = {
  title: "Apify — Mercado Libre",
  robots: { index: false, follow: false },
};

type Final = { estado: string; usd: number | null; cobros: unknown };

function Resultado({ r, final }: { r: ResultadoActor; final?: Final }) {
  const primero = r.items?.[0];
  const usd = final?.usd ?? r.costo_usd;
  return (
    <details className="border border-[#E3E9F0] rounded-lg mb-2 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs flex flex-wrap gap-2 items-center">
        <span className={`font-bold rounded px-1.5 py-0.5 ${r.ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {r.ok ? `${r.cantidad} resultados` : final?.estado ?? r.estado ?? "error"}
        </span>
        <code>{r.actor}</code>
        <span className="text-[#5C6B76]">{r.segundos}s{usd != null && ` · USD ${usd.toFixed(3)}`}</span>
      </summary>
      <div className="px-3 pb-3 text-[11px]">
        {r.error && <p className="text-[#C03420] mb-2">{r.error}</p>}
        {final?.cobros != null && <p className="text-[#5C6B76] mb-2">Cobros: {JSON.stringify(final.cobros)}</p>}
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

export default async function Apify({ searchParams }: { searchParams: Promise<{ prueba?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  const hayToken = !!apifyToken();

  const filtro = and(eq(meliPruebas.organizacionId, sesion.org.id), like(meliPruebas.consulta, "apify:%"));
  const [prueba] = await db.select().from(meliPruebas)
    .where(sp.prueba ? and(filtro, eq(meliPruebas.id, Number(sp.prueba))) : filtro)
    .orderBy(desc(meliPruebas.id)).limit(1);

  const corriendo = !!prueba && !Array.isArray(prueba.resultados);
  const resultados = prueba && Array.isArray(prueba.resultados) ? (prueba.resultados as ResultadoActor[]) : [];
  const finales = await costosFinales(resultados.map((r) => r.runId).filter((x): x is string => !!x));
  const total = resultados.reduce((t, r) => t + ((r.runId ? finales[r.runId]?.usd : null) ?? r.costo_usd ?? 0), 0);
  const q = prueba?.consulta.replace(/^apify: /, "") ?? "";

  return (
    <main className="max-w-2xl mx-auto p-6">
      <Link href="/admin/meli" className={`inline-block mb-2 ${SUAVE}`}>← Mercado Libre</Link>
      <h1 className="text-lg font-bold mb-4">Apify — scrapers de Mercado Libre</h1>

      {!hayToken && (
        <p className="text-sm text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-4">Falta <code>APIFY_TOKEN</code> en Vercel.</p>
      )}

      <form action={accionCorrerApify} className="mb-6 grid gap-3">
        <div className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="ej: carpa indoor 80x80" required
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 flex-1 text-sm" />
          <BotonCorrer />
        </div>
        <fieldset className="grid gap-1 text-xs">
          {ACTORES.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" name="actor" value={a} defaultChecked />
              <code>{a}</code>
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-[#5C6B76]">
          {MAX} resultados por actor (devcake trae 48 como mínimo), tope de USD 0,25 por actor.
          Recargar la página no vuelve a correr nada.
        </p>
      </form>

      {prueba && (
        <p className="text-xs text-[#5C6B76] mb-2">
          Prueba #{prueba.id} · “{q}” · {prueba.ts.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
          {!corriendo && ` · costo final total USD ${total.toFixed(3)}`}
        </p>
      )}
      {corriendo && (
        <p className="text-sm bg-[#EEF3F8] rounded-lg px-3 py-2">Corriendo… recargá en un minuto.</p>
      )}
      {resultados.map((r) => <Resultado key={r.actor} r={r} final={r.runId ? finales[r.runId] : undefined} />)}
    </main>
  );
}
