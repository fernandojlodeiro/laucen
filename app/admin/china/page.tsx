import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, like } from "drizzle-orm";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { db } from "@/db";
import { meliPruebas } from "@/db/meli";
import { apifyToken, costosFinales } from "@/lib/apify";
import { hayClaude, traducirTitulos } from "@/lib/china/traducir";
import { SUAVE } from "@/app/botones";
import { accionCorrerChina, accionProbarFoto, accionTraducir, type PruebaChina } from "./actions";
import FotoCampo from "./FotoCampo";
import { ACTORES, MAX, TOPE_USD } from "./config";
import Botones from "./Botones";

export const dynamic = "force-dynamic";
// La corrida espera a los actores: hasta ~4 minutos.
export const maxDuration = 300;

// Banco de pruebas de China (interno, sólo Fer): corre varios actores de
// Apify de 1688 y Alibaba con la misma búsqueda para comparar qué trae cada
// uno. Cargar la página NO corre nada; correr es sólo con el botón.

export const metadata = { title: "China — pruebas", robots: { index: false, follow: false } };

type Corrida = PruebaChina["corridas"][number];
type Final = { estado: string; usd: number | null; cobros: unknown };

/** Busca en un resultado crudo el primer campo que parezca título, precio,
 *  foto o link: cada actor los nombra distinto. */
function campo(item: unknown, patron: RegExp, profundidad = 0): string | null {
  if (!item || typeof item !== "object" || profundidad > 2) return null;
  for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
    if (patron.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v);
    if (patron.test(k) && Array.isArray(v) && (typeof v[0] === "string" || typeof v[0] === "number")) return String(v[0]);
  }
  for (const v of Object.values(item as Record<string, unknown>)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = campo(v, patron, profundidad + 1);
      if (r) return r;
    }
  }
  return null;
}

/** Precio legible: cada actor lo trae distinto (texto, número, {min,max},
 *  priceMin/priceMax). */
function precioDe(it: unknown): string | null {
  if (!it || typeof it !== "object") return null;
  const o = it as Record<string, unknown>;
  const mon = typeof o.currency === "string" ? o.currency : "";
  if (typeof o.priceText === "string" && o.priceText) return `${o.priceText}${mon && !o.priceText.includes("$") ? ` ${mon}` : ""}`;
  const p = o.price;
  if (typeof p === "string" && p) return p;
  if (p && typeof p === "object") {
    const q = p as Record<string, unknown>;
    const m = typeof q.currency === "string" ? q.currency : mon;
    if (q.min != null) return `${q.min}${q.max != null && q.max !== q.min ? `–${q.max}` : ""} ${m}`.trim();
  }
  if (o.priceMin != null) return `${o.priceMin}${o.priceMax != null && o.priceMax !== o.priceMin ? `–${o.priceMax}` : ""} ${mon}`.trim();
  if (typeof p === "number") return `${p} ${mon}`.trim();
  return campo(it, /price/i);
}

function minimoDe(it: unknown): string | null {
  if (!it || typeof it !== "object") return null;
  const o = it as Record<string, unknown>;
  if (typeof o.moqText === "string") return o.moqText.replace(/^Min\. order:\s*/i, "");
  if (o.moq != null && typeof o.moq !== "object") return String(o.moq);
  return null;
}

/** El título original (en chino, si el actor trae los dos). */
function tituloDe(it: unknown) {
  return campo(it, /^(title|subject|name|product_?title|productName|offerTitle|titleCn)$/i) ?? campo(it, /title|subject|name/i);
}

/** Algunos actores de búsqueda por foto devuelven un registro por foto con
 *  los productos adentro (`results`): se aplanan para mostrarlos y traducirlos. */
function productos(items: unknown[] = []): unknown[] {
  return items.flatMap((it) => {
    const r = (it as { results?: unknown })?.results;
    return Array.isArray(r) ? r : [it];
  });
}

function Vistazo({ items: crudos, es }: { items: unknown[]; es?: string[] }) {
  const items = productos(crudos);
  const filas = items.map((it, i) => ({
    titulo: es?.[i] || tituloDe(it),
    original: es?.[i] ? tituloDe(it) : null,
    precio: precioDe(it),
    minimo: minimoDe(it),
    foto: campo(it, /^(image|img|imageUrl|image_url|mainImage|main_image|thumbnail|pic|picUrl|images)$/i),
    url: campo(it, /^(url|link|detailUrl|productUrl|product_url|offerUrl|href)$/i),
  }));
  return (
    <table className="w-full text-[11px] mb-2">
      <thead className="text-left text-[#5C6B76]">
        <tr><th></th><th className="py-1">Producto</th><th className="py-1 px-2">Precio</th><th className="py-1">Pedido mín.</th></tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-t border-[#E3E9F0] align-top">
            <td className="py-1 pr-2 w-16">
              {f.foto && /^(https?:)?\/\//.test(f.foto) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.foto.startsWith("//") ? `https:${f.foto}` : f.foto} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-16 h-16 object-cover rounded" />
              )}
            </td>
            <td className="py-1 pr-2">
              {f.url ? <a href={f.url.startsWith("//") ? `https:${f.url}` : f.url} target="_blank" rel="noreferrer" className="text-[#16577F] underline">{f.titulo ?? "(sin título)"}</a> : f.titulo ?? "(sin título)"}
              {f.original && <span className="block text-[#9AA7B3]">{f.original}</span>}
            </td>
            <td className="py-1 px-2 whitespace-nowrap">{f.precio ?? "—"}</td>
            <td className="py-1 whitespace-nowrap">{f.minimo ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Resultado({ r, final }: { r: Corrida; final?: Final }) {
  const usd = final?.usd ?? r.costo_usd;
  return (
    <details className="border border-[#E3E9F0] rounded-lg mb-2 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs flex flex-wrap gap-2 items-center">
        <span className={`font-bold rounded px-1.5 py-0.5 ${r.ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {r.ok ? `${productos(r.items).length} resultados` : final?.estado ?? r.estado ?? "error"}
        </span>
        <span className="rounded px-1.5 py-0.5 bg-[#EEF3F8]">{r.plataforma === "1688" ? "1688" : "Alibaba"} · {r.tipo === "imagen" ? "por foto" : "por texto"}</span>
        <code>{r.actor}</code>
        <span className="text-[#5C6B76]">{r.segundos != null && `${r.segundos}s`}{usd != null && ` · USD ${usd.toFixed(3)}`}</span>
      </summary>
      <div className="px-3 pb-3 text-[11px]">
        {r.error && <p className="text-[#C03420] mb-2">{r.error}</p>}
        {r.busqueda && r.tipo === "texto" && <p className="text-[#5C6B76] mb-2">Buscó: “{r.busqueda}”</p>}
        {!!r.items?.length && <Vistazo items={r.items} es={r.titulos_es} />}
        {final?.cobros != null && <p className="text-[#5C6B76] mb-2">Cobros: {JSON.stringify(final.cobros)}</p>}
        <p className="text-[#5C6B76]">Entrada que se armó:</p>
        <pre className="overflow-x-auto mb-2">{JSON.stringify(r.entrada, null, 2)}</pre>
        {r.items?.[0] !== undefined && (
          <>
            <p className="text-[#5C6B76]">Primer resultado, crudo:</p>
            <pre className="overflow-x-auto max-h-96">{JSON.stringify(r.items[0], null, 2).slice(0, 6000)}</pre>
          </>
        )}
        {!r.ok && r.campos_del_esquema != null && (
          <>
            <p className="text-[#5C6B76]">Campos que pide el actor:</p>
            <pre className="overflow-x-auto max-h-64">{JSON.stringify(r.campos_del_esquema, null, 2)}</pre>
          </>
        )}
      </div>
    </details>
  );
}

type SP = { prueba?: string; texto?: string; en?: string; zh?: string; imagen?: string; tr?: string; motivo?: string; fotook?: string; fotodet?: string };

export default async function China({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  const claude = hayClaude();

  const filtro = and(eq(meliPruebas.organizacionId, sesion.org.id), like(meliPruebas.consulta, "china:%"));
  const [prueba] = await db.select().from(meliPruebas)
    .where(sp.prueba ? and(filtro, eq(meliPruebas.id, Number(sp.prueba))) : filtro)
    .orderBy(desc(meliPruebas.id)).limit(1);
  const datos = prueba && (prueba.resultados as { corridas?: unknown }).corridas ? (prueba.resultados as PruebaChina) : null;
  const corriendo = !!prueba && !datos;
  const corridas = datos?.corridas ?? [];

  // Títulos en castellano: se traducen con Claude la primera vez que se mira
  // la prueba y quedan guardados junto a los resultados.
  if (claude && prueba && datos) {
    const faltan = corridas.filter((r) => r.items?.length && !r.titulos_es?.length);
    if (faltan.length) {
      await Promise.all(faltan.map(async (r) => {
        const es = await traducirTitulos(productos(r.items).map((it) => tituloDe(it) ?? ""));
        if (es) r.titulos_es = es;
      }));
      if (faltan.some((r) => r.titulos_es?.length)) {
        await db.update(meliPruebas).set({ resultados: datos }).where(eq(meliPruebas.id, prueba.id));
      }
    }
  }
  const finales = await costosFinales(corridas.map((r) => r.runId).filter((x): x is string => !!x));
  const total = corridas.reduce((t, r) => t + ((r.runId ? finales[r.runId]?.usd : null) ?? r.costo_usd ?? 0), 0);

  // Lo que se precarga en el formulario: lo recién traducido o la última prueba.
  const vieneDeTraducir = sp.texto !== undefined || sp.en !== undefined || sp.fotook !== undefined;
  const val = vieneDeTraducir
    ? { texto: sp.texto ?? "", en: sp.en ?? "", zh: sp.zh ?? "", imagen: sp.imagen ?? "" }
    : { texto: datos?.texto ?? "", en: datos?.en ?? "", zh: datos?.zh ?? "", imagen: datos?.imagen ?? "" };
  const input = "border border-[#E3E9F0] rounded-lg px-3 py-2 text-sm w-full";

  return (
    <main className="max-w-3xl mx-auto p-6">
      <Link href="/panel" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
      <h1 className="text-lg font-bold mb-1">China — pruebas</h1>
      <p className="text-xs text-[#5C6B76] mb-4">
        Corre varios scrapers de Apify de 1688 y Alibaba con la misma búsqueda, para ver cuál trae mejores datos.
        Vos escribís en castellano y Claude lo traduce: Alibaba es el sitio de exportación (está en inglés) y 1688 es el
        mercado interno chino (sólo entiende chino), así que a cada uno se le busca en su idioma.
      </p>

      {!apifyToken() && (
        <p className="text-sm text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-4">Falta <code>APIFY_TOKEN</code> en Vercel.</p>
      )}
      {!claude && (
        <p className="text-sm bg-[#FFF7E6] text-[#8A5A00] rounded-lg px-3 py-2 mb-4">
          Falta <code>ANTHROPIC_API_KEY</code> en Vercel: hasta que esté, la traducción se escribe a mano en los campos de inglés y chino.
        </p>
      )}
      {sp.tr === "fallo" && (
        <p className="text-sm text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-4">Claude no pudo traducir{sp.motivo ? `: ${sp.motivo}` : " ahora"}. Probá de nuevo o escribí la traducción a mano.</p>
      )}

      <form action={accionCorrerChina} className="mb-6 grid gap-3">
        <label className="grid gap-1 text-xs">
          Qué buscar (en castellano)
          <input name="texto" defaultValue={val.texto} placeholder="ej: maceta autorriego plástico 20 cm" className={input} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs">
            Inglés, para Alibaba (se completa solo; tocalo sólo para corregir)
            <input name="en" defaultValue={val.en} placeholder={claude ? "vacío = lo traduce Claude" : "ej: self watering plastic pot 20cm"} className={input} />
          </label>
          <label className="grid gap-1 text-xs">
            Chino, para 1688 (se completa solo; tocalo sólo para corregir)
            <input name="zh" defaultValue={val.zh} placeholder={claude ? "vacío = lo traduce Claude" : "ej: 自动吸水花盆 塑料 20cm"} className={input} />
          </label>
        </div>
        <FotoCampo link={val.imagen} clase={input} />
        {sp.fotook !== undefined && (
          <div className={`text-xs rounded-lg px-3 py-2 flex gap-3 items-start ${sp.fotook === "1" ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
            {sp.fotook === "1" && val.imagen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={val.imagen} alt="" referrerPolicy="no-referrer" className="w-20 h-20 object-cover rounded" />
            )}
            <div>
              <b>{sp.fotook === "1" ? "La foto llega bien." : "La foto no llega:"}</b> {sp.fotodet}
              {val.imagen && <span className="block break-all text-[#5C6B76] mt-1">Link que reciben los buscadores: {val.imagen}</span>}
            </div>
          </div>
        )}
        <fieldset className="grid gap-1 text-xs">
          <legend className="mb-1">Actores</legend>
          {ACTORES.map((a) => (
            <label key={a.id} className="flex items-center gap-2">
              <input type="checkbox" name="actor" value={a.id} defaultChecked={a.tipo === "texto"} />
              <span className="rounded px-1.5 py-0.5 bg-[#EEF3F8]">{a.plataforma === "1688" ? "1688" : "Alibaba"} · {a.tipo === "imagen" ? "foto" : "texto"}</span>
              <code>{a.id}</code>
            </label>
          ))}
          <label className="grid gap-1 mt-1">
            Otro actor (usuario/nombre, opcional)
            <input name="otro" placeholder="ej: songd/1688-search-scraper" className={input} />
          </label>
        </fieldset>
        <Botones traducir={accionTraducir} probarFoto={accionProbarFoto} puedeTraducir={claude} />
        <p className="text-[11px] text-[#5C6B76]">
          {MAX} resultados por actor, tope de USD {TOPE_USD.toFixed(2).replace(".", ",")} por actor. Los de foto vienen destildados:
          tildalos si cargaste una foto. Recargar la página no vuelve a correr nada.
        </p>
      </form>

      {prueba && (
        <p className="text-xs text-[#5C6B76] mb-2">
          Prueba #{prueba.id} · {prueba.ts.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
          {datos && ` · EN “${datos.en || "—"}” · ZH “${datos.zh || "—"}”${datos.traducidoPor ? ` (${datos.traducidoPor})` : ""}`}
          {!corriendo && ` · costo final total USD ${total.toFixed(3)}`}
        </p>
      )}
      {corriendo && <p className="text-sm bg-[#EEF3F8] rounded-lg px-3 py-2">Corriendo… recargá en un minuto.</p>}
      {corridas.map((r) => <Resultado key={r.actor} r={r} final={r.runId ? finales[r.runId] : undefined} />)}
    </main>
  );
}
