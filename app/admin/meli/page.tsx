import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { db } from "@/db";
import { meliPruebas } from "@/db/meli";
import { credenciales, cuentaDe, tokenVigente, llamar, redirectUri, type Respuesta } from "@/lib/meli";
import { SUAVE, VERDE, PRIMARIO } from "@/app/botones";
import { leerPagina, conCostoFinal } from "@/lib/meli-pagina";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  if (cat) await paso(`/categories/${cat}`);
  const prods = await paso(`/products/search?status=active&site_id=MLA&q=${e}&limit=5`);
  // ¿Hasta dónde se puede recorrer el catálogo? (paginado profundo)
  // (offset máximo permitido: 100 → a lo sumo ~150 productos por búsqueda)
  await paso(`/products/search?status=active&site_id=MLA&q=${e}&limit=50&offset=100`);
  if (cat) {
    await paso(`/sites/MLA/search?category=${cat}&limit=5`);
  }

  // Ofertas de productos de catálogo: muchos no tienen ninguna activa ("No
  // winners found"), así que se recorren hasta juntar ofertas de 3 productos.
  const lista = await llamar(`/products/search?status=active&site_id=MLA&q=${e}&limit=30`, token);
  const productos = (sacar(lista.datos, ["results"]) as { id: string }[] | undefined) ?? [];
  const itemIds = new Set<string>();
  const vendedores = new Set<string>();
  let itemId = sacar(busqueda.datos, ["results", 0, "id"]) as string | undefined;
  let conOfertas = 0, sinOfertas = 0;
  for (const p of productos) {
    if (conOfertas >= 3) break;
    const items = await llamar(`/products/${p.id}/items?limit=20`, token);
    const res = (sacar(items.datos, ["results"]) as { item_id: string; seller_id: number }[] | undefined) ?? [];
    if (!res.length) { sinOfertas++; continue; }
    if (conOfertas === 0) await paso(`/products/${p.id}`);
    out.push(items);
    conOfertas++;
    for (const it of res) {
      itemIds.add(it.item_id);
      vendedores.add(String(it.seller_id));
    }
  }
  out.push({ ruta: "(resumen) productos de catálogo revisados", status: 200,
    datos: { revisados: conOfertas + sinOfertas, con_ofertas: conOfertas, sin_ofertas: sinOfertas } });
  itemId ??= [...itemIds][0];

  const ids = [...itemIds].slice(0, 5).join(",");
  if (ids) {
    await paso(`/items?ids=${ids}`);
    await paso(`/items?ids=${ids}&attributes=id,title,price,sold_quantity,available_quantity,date_created,permalink`);
    await paso(`/visits/items?ids=${ids}`);
  }
  if (itemId) {
    await paso(`/items/${itemId}`);
    await paso(`/items/${itemId}/description`);
    await paso(`/reviews/item/${itemId}`);
  }
  for (const v of [...vendedores].slice(0, 2)) await paso(`/users/${v}`);
  return out;
}

/** Lo que ML deja ver de publicaciones puntuales (propias o ajenas), para
 *  armar un seguimiento de competencia como el de Virtual Seller: precio,
 *  si está activa, quién más vende el mismo producto de catálogo. */
function leerPublicaciones(texto: string) {
  const items = new Set<string>(), productos = new Set<string>(), up = new Set<string>();
  for (const linea of texto.split(/[\s,]+/)) {
    const l = linea.trim().toUpperCase();
    if (!l) continue;
    const u = l.match(/MLAU-?(\d+)/);
    if (u) { up.add(`MLAU${u[1]}`); continue; }
    const p = l.match(/\/P\/MLA-?(\d+)/);
    if (p) { productos.add(`MLA${p[1]}`); continue; }
    const i = l.match(/MLA-?(\d+)/);
    if (i) items.add(`MLA${i[1]}`);
  }
  return { items: [...items].slice(0, 6), productos: [...productos].slice(0, 6), up: [...up].slice(0, 6) };
}

async function correrCompetencia(texto: string, token: string | null): Promise<Respuesta[]> {
  const { items, productos, up } = leerPublicaciones(texto);
  const out: Respuesta[] = [];
  const paso = async (ruta: string, conLlave = true) => {
    const r = await llamar(ruta, conLlave ? token : null);
    out.push({ ...r, ruta: conLlave ? ruta : `${ruta}  (sin llave)` });
    return r;
  };
  // Control: una publicación propia (ésa sí tiene que dar 200).
  const yo = await llamar("/users/me", token);
  const uid = sacar(yo.datos, ["id"]);
  const mias = await paso(`/users/${uid}/items/search?status=active&limit=3`);
  const propia = sacar(mias.datos, ["results", 0]) as string | undefined;
  if (propia) {
    await paso(`/items/${propia}?attributes=id,title,price,status,catalog_product_id,user_product_id`);
    await paso(`/items/${propia}/price_to_win?version=v2`);
  }
  for (const id of items) {
    const it = await paso(`/items/${id}`);
    await paso(`/items/${id}`, false);
    await paso(`/items/${id}?attributes=id,price,status,catalog_product_id`);
    await paso(`/items?ids=${id}&attributes=id,price,status`);
    await paso(`/items/${id}/prices`);
    await paso(`/items/${id}/sale_price?context=channel_marketplace`);
    await paso(`/items/${id}/price_to_win?version=v2`);
    await paso(`/visits/items?ids=${id}`);
    await paso(`/items/${id}/shipping_options?zip_code=1425`);
    await paso(`/reviews/item/${id}?limit=1`);
    const cat = sacar(it.datos, ["catalog_product_id"]) as string | undefined;
    if (cat) productos.push(cat);
  }
  for (const id of [...new Set(productos)]) {
    await paso(`/products/${id}`);
    await paso(`/products/${id}/items?limit=20`);
    await paso(`/products/${id}/items?limit=20`, false);
  }
  for (const id of up) {
    await paso(`/user-products/${id}`);
    await paso(`/user-products/${id}/items`);
  }
  return out;
}

/** Lee con Apify la página de hasta 2 publicaciones (a la vez) y deja el costo de cada lectura. */
async function correrPaginas(texto: string): Promise<Respuesta[]> {
  const urls = [...new Set(texto.split(/\s+/).filter((l) => /^https?:\/\/\S*mercadolibre\.com\.ar\//i.test(l)))].slice(0, 2);
  if (!urls.length) return [{ ruta: "(páginas)", status: 0, datos: "Pegá links de Mercado Libre (https://…mercadolibre.com.ar/…)." }];
  const lecturas = await conCostoFinal((await Promise.all(urls.map(leerPagina))).flat());
  return lecturas.map((l) => ({
    ruta: `Apify ${l.intento} · ${l.url} · USD ${l.costoUsd ?? "?"} · ${l.segundos} s`,
    status: l.datos ? 200 : 0,
    datos: l.datos ?? l.error ?? "sin resultado",
  }));
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
  searchParams: Promise<{ q?: string; pubs?: string; paginas?: string; ok?: string; error?: string; detalle?: string }>;
}) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const hayCredenciales = !!credenciales();
  const cuenta = await cuentaDe(sesion.org.id);
  const q = sp.q?.trim() ?? "";
  const pubs = sp.pubs?.trim() ?? "";
  const paginas = sp.paginas?.trim() ?? "";

  let resultados: Respuesta[] = [];
  let problemaLlave = "";
  if (paginas) {
    resultados = await correrPaginas(paginas);
    await db.insert(meliPruebas).values({ organizacionId: sesion.org.id, consulta: `apify-pagina: ${paginas.slice(0, 1000)}`, resultados });
  } else if (q || pubs) {
    let token: string | null = null;
    try {
      token = await tokenVigente(sesion.org.id);
    } catch (e) {
      problemaLlave = `No se pudo renovar la llave: ${String(e)}`;
    }
    resultados = pubs ? await correrCompetencia(pubs, token) : await correrPruebas(q, token);
    await db.insert(meliPruebas).values({
      organizacionId: sesion.org.id, consulta: pubs ? `competencia: ${pubs.slice(0, 300)}` : q, resultados });
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <Link href="/panel" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
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

      <section className="border border-[#E3E9F0] rounded-lg p-4 mb-6 bg-white text-sm">
        <h2 className="font-bold mb-1">3. Scrapers de Apify</h2>
        <p className="text-xs text-[#5C6B76] mb-3">Lo que la API no da (ventas, stock, publicaciones fuera de catálogo), leyendo las páginas.</p>
        <Link href="/admin/meli/apify" className={`${SUAVE} inline-block`}>Probar con Apify →</Link>
      </section>

      <section className="border border-[#E3E9F0] rounded-lg p-4 mb-6 bg-white text-sm">
        <h2 className="font-bold mb-1">4. Seguimiento de competencia</h2>
        <p className="text-xs text-[#5C6B76] mb-3">
          Pegá publicaciones (links o códigos MLA…), una por renglón: una tuya y las de la competencia.
          Se prueba qué deja ver la API de cada una (precio, si está activa, otros vendedores del mismo producto).
        </p>
        <form>
          <textarea name="pubs" defaultValue={pubs} rows={4}
            placeholder={"https://articulo.mercadolibre.com.ar/MLA-123456789-…\nhttps://www.mercadolibre.com.ar/…/p/MLA12345678"}
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full text-sm mb-2" />
          <button className={PRIMARIO}>Probar</button>
        </form>
      </section>

      <section className="border border-[#E3E9F0] rounded-lg p-4 mb-6 bg-white text-sm">
        <h2 className="font-bold mb-1">5. Leer la página con Apify</h2>
        <p className="text-xs text-[#5C6B76] mb-3">
          Para las publicaciones comunes ajenas, que la API no deja ver. Pegá hasta 2 links, uno por renglón:
          trae precio, vendedor, vendidos, disponibles y si está pausada, con el costo de cada lectura. Tarda uno o dos minutos.
        </p>
        <form>
          <textarea name="paginas" defaultValue={paginas} rows={3}
            placeholder={"https://www.mercadolibre.com.ar/…/up/MLAU…"}
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full text-sm mb-2" />
          <button className={PRIMARIO}>Leer</button>
        </form>
      </section>

      {problemaLlave && <p className="text-xs text-[#C03420] mb-2">{problemaLlave}</p>}
      {resultados.map((r, i) => <Resultado key={i} r={r} />)}
    </main>
  );
}
