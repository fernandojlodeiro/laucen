import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { db } from "@/db";
import { meliPruebas } from "@/db/meli";
import { credenciales, cuentaDe, tokenVigente, llamar, redirectUri, type Respuesta } from "@/lib/meli";
import { SUAVE, VERDE, PRIMARIO } from "@/app/botones";

export const dynamic = "force-dynamic";

// Banco de pruebas de la API de Mercado Libre (interno, sólo Fer): conecta la
// aplicación de ML y, para una búsqueda de texto, corre cada consulta que
// interesa y muestra qué devuelve. Cada corrida queda en `meli_pruebas`.

export const metadata = {
  title: "Mercado Libre",
  robots: { index: false, follow: false },
};

const ERRORES: Record<string, string> = {
  credenciales: "Faltan MELI_APP_ID y MELI_CLIENT_SECRET en Vercel.",
  vuelta: "La vuelta de Mercado Libre no coincidió con el pedido. Probá conectar de nuevo.",
  sesion: "Se perdió la sesión en el medio. Entrá de nuevo y reconectá.",
  canje: "Mercado Libre no aceptó el código.",
};

/** El primer valor que encuentre en `obj` siguiendo alguno de los caminos. */
function sacar(obj: unknown, ...caminos: (string | number)[][]): unknown {
  for (const camino of caminos) {
    let v: unknown = obj;
    for (const k of camino) v = v && typeof v === "object" ? (v as Record<string | number, unknown>)[k] : undefined;
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

async function correrPruebas(q: string, token: string | null): Promise<Respuesta[]> {
  const e = encodeURIComponent(q);
  const out: Respuesta[] = [];
  const paso = async (ruta: string, conLlave = true) => {
    const r = await llamar(ruta, conLlave ? token : null);
    out.push({ ...r, ruta: conLlave ? ruta : `${ruta}  (sin llave)` });
    return r;
  };

  await paso(`/sites/MLA/search?q=${e}&limit=5`, false);
  await paso("/users/me");
  const busqueda = await paso(`/sites/MLA/search?q=${e}&limit=5`);
  const disc = await paso(`/sites/MLA/domain_discovery/search?q=${e}&limit=1`);
  const cat = sacar(disc.datos, [0, "category_id"]) as string | undefined;
  await paso("/trends/MLA");
  if (cat) {
    await paso(`/trends/MLA/${cat}`);
    await paso(`/highlights/MLA/category/${cat}`);
  }
  const prods = await paso(`/products/search?status=active&site_id=MLA&q=${e}&limit=5`);
  const productoId = sacar(prods.datos, ["results", 0, "id"]) as string | undefined;
  let itemId = sacar(busqueda.datos, ["results", 0, "id"]) as string | undefined;
  if (productoId) {
    await paso(`/products/${productoId}`);
    const items = await paso(`/products/${productoId}/items?limit=5`);
    itemId ??= sacar(items.datos, ["results", 0, "item_id"]) as string | undefined;
  }
  if (itemId) {
    const item = await paso(`/items/${itemId}`);
    await paso(`/items/${itemId}/description`);
    await paso(`/reviews/item/${itemId}`);
    const vendedor = sacar(item.datos, ["seller_id"]);
    if (vendedor) await paso(`/users/${vendedor}`);
  }
  return out;
}

function Resultado({ r }: { r: Respuesta }) {
  const ok = r.status >= 200 && r.status < 300;
  const texto = typeof r.datos === "string" ? r.datos : JSON.stringify(r.datos, null, 2);
  return (
    <details className="border border-[#E3E9F0] rounded-lg mb-2 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs flex gap-2 items-center">
        <span className={`font-bold rounded px-1.5 py-0.5 ${ok ? "bg-[#EEF7F1] text-[#1F6E4A]" : "bg-[#FDF1EF] text-[#C03420]"}`}>
          {r.status || "sin respuesta"}
        </span>
        <code className="break-all">{r.ruta}</code>
      </summary>
      <pre className="text-[11px] px-3 pb-3 overflow-x-auto max-h-96">{texto.slice(0, 8000)}{texto.length > 8000 ? "\n…" : ""}</pre>
    </details>
  );
}

export default async function Meli({ searchParams }: {
  searchParams: Promise<{ q?: string; ok?: string; error?: string; detalle?: string }>;
}) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const hayCredenciales = !!credenciales();
  const cuenta = await cuentaDe(sesion.org.id);
  const q = sp.q?.trim() ?? "";

  let resultados: Respuesta[] = [];
  let problemaLlave = "";
  if (q) {
    let token: string | null = null;
    try {
      token = await tokenVigente(sesion.org.id);
    } catch (e) {
      problemaLlave = `No se pudo renovar la llave: ${String(e)}`;
    }
    resultados = await correrPruebas(q, token);
    await db.insert(meliPruebas).values({ organizacionId: sesion.org.id, consulta: q, resultados });
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-lg font-bold mb-4">Mercado Libre — qué trae la API</h1>

      {sp.ok && <p className="text-sm text-[#1F6E4A] bg-[#EEF7F1] rounded-lg px-3 py-2 mb-4">Cuenta conectada.</p>}
      {sp.error && (
        <p className="text-sm text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-4">
          {ERRORES[sp.error] ?? "No se pudo conectar."} {sp.detalle && <span className="block text-xs mt-1">{sp.detalle}</span>}
        </p>
      )}

      <section className="border border-[#E3E9F0] rounded-lg p-4 mb-6 bg-white text-sm">
        <h2 className="font-bold mb-2">1. Conexión</h2>
        {!hayCredenciales ? (
          <p className="text-[#C03420]">Faltan <code>MELI_APP_ID</code> y <code>MELI_CLIENT_SECRET</code> en Vercel.</p>
        ) : cuenta ? (
          <p className="mb-2">Conectada como <b>{cuenta.meliNickname ?? cuenta.meliUserId}</b>.</p>
        ) : (
          <p className="mb-2">Todavía no hay cuenta conectada.</p>
        )}
        <p className="text-xs text-[#5C6B76] mb-3">
          En la aplicación de Mercado Libre, la URL de redirección tiene que ser exactamente:{" "}
          <code className="break-all">{redirectUri(origen)}</code>
        </p>
        {hayCredenciales && (
          <a href="/admin/meli/conectar" className={`${cuenta ? SUAVE : VERDE} inline-block`}>
            {cuenta ? "Reconectar" : "Conectar con Mercado Libre"}
          </a>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-sm mb-2">2. Probar una búsqueda</h2>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="ej: auriculares bluetooth"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 flex-1 text-sm" />
          <button className={PRIMARIO}>Probar</button>
        </form>
      </section>

      {problemaLlave && <p className="text-xs text-[#C03420] mb-2">{problemaLlave}</p>}
      {resultados.map((r, i) => <Resultado key={i} r={r} />)}
    </main>
  );
}
