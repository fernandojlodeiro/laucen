// Prueba de búsqueda en Mercado Libre "como Virtual Seller" (Fer, 10/10):
// VS muestra los resultados con los filtros y cantidades del buscador oficial
// de la API (/sites/MLA/search). A nuestra aplicación esa búsqueda le dio 403
// (bitácora #105). Antes de armar el seguimiento de competencia se prueban
// todas las variantes razonables, con cada cuenta conectada, y la página
// pública del listado. Sólo lee; queda guardado en meli_pruebas.

import { API, tokenDeCuenta, type Respuesta } from "@/lib/meli";
import { cuentasDe } from "@/lib/mercadolibre/api";

const NAVEGADOR = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "accept-language": "es-AR,es;q=0.9",
};

async function pedir(url: string, cab: Record<string, string> = {}): Promise<{ status: number; datos: unknown }> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json", ...cab }, cache: "no-store", redirect: "follow" });
    const texto = await r.text();
    try { return { status: r.status, datos: JSON.parse(texto) }; } catch { return { status: r.status, datos: texto }; }
  } catch (e) {
    return { status: 0, datos: String(e) };
  }
}

/** Cuántos resultados trajo (para el resumen). */
function cuantos(d: unknown): string {
  if (d && typeof d === "object") {
    const o = d as { paging?: { total?: number }; results?: unknown[]; message?: string; error?: string };
    if (o.paging?.total != null) return `${o.paging.total} en total, ${o.results?.length ?? 0} traídos`;
    if (Array.isArray(o.results)) return `${o.results.length} traídos`;
    if (Array.isArray(d)) return `${d.length} traídos`;
    if (o.message || o.error) return String(o.message ?? o.error).slice(0, 80);
  }
  if (typeof d === "string") return d.includes("ui-search-result") ? "página con resultados" : d.slice(0, 80).replace(/\s+/g, " ");
  return "";
}

export async function probarBusquedas(org: string, q: string): Promise<Respuesta[]> {
  const e = encodeURIComponent(q);
  const cuentas = (await cuentasDe(org)).filter((c) => c.estado === "activa");
  const filas: Respuesta[] = [];
  const resumen: { variante: string; status: number; resultado: string }[] = [];
  const paso = async (variante: string, url: string, cab: Record<string, string> = {}) => {
    const r = await pedir(url, cab);
    resumen.push({ variante, status: r.status, resultado: cuantos(r.datos) });
    filas.push({ ruta: `${variante} — ${url.replace(/access_token=[^&]+/, "access_token=…")}`, status: r.status, datos: r.datos });
    return r;
  };

  await paso("Búsqueda por texto, sin cuenta", `${API}/sites/MLA/search?q=${e}&limit=5`);
  await paso("Búsqueda por texto, sin cuenta, como navegador", `${API}/sites/MLA/search?q=${e}&limit=5`, NAVEGADOR);
  let token: string | null = null, uid: number | null = null;
  for (const c of cuentas) {
    const t = await tokenDeCuenta(c.id).catch(() => null);
    if (!t) continue;
    token ??= t; uid ??= c.meliUserId;
    await paso(`Búsqueda por texto, con la cuenta ${c.nickname ?? c.meliUserId}`, `${API}/sites/MLA/search?q=${e}&limit=5`, { authorization: `Bearer ${t}` });
  }
  if (token) {
    const llave = { authorization: `Bearer ${token}` };
    await paso("Búsqueda por texto, llave en la dirección", `${API}/sites/MLA/search?q=${e}&limit=5&access_token=${token}`);
    await paso("Búsqueda por texto, con cuenta y como navegador", `${API}/sites/MLA/search?q=${e}&limit=5`, { ...llave, ...NAVEGADOR });
    await paso("Búsqueda por texto, con caller.id", `${API}/sites/MLA/search?q=${e}&limit=5&caller.id=${uid}`, llave);
    await paso("Búsqueda por vendedor (nuestra cuenta)", `${API}/sites/MLA/search?seller_id=${uid}&limit=5`, llave);
    await paso("Búsqueda por apodo de un competidor (TODOMICRO)", `${API}/sites/MLA/search?nickname=TODOMICRO&limit=5`, llave);
    const disc = await pedir(`${API}/sites/MLA/domain_discovery/search?q=${e}&limit=1`, llave);
    const cat = Array.isArray(disc.datos) ? (disc.datos[0] as { category_id?: string } | undefined)?.category_id : undefined;
    if (cat) {
      await paso(`Búsqueda por texto dentro de la categoría ${cat}`, `${API}/sites/MLA/search?category=${cat}&q=${e}&limit=5`, llave);
      await paso(`Más vendidos de la categoría ${cat}`, `${API}/highlights/MLA/category/${cat}`, llave);
    }
    await paso("Control: nuestras publicaciones por texto", `${API}/users/${uid}/items/search?q=${e}&limit=5`, llave);
    await paso("Control: catálogo por texto", `${API}/products/search?status=active&site_id=MLA&q=${e}&limit=5`, llave);
  }
  await paso("Página pública del listado (sin API)", `https://listado.mercadolibre.com.ar/${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}`,
    { ...NAVEGADOR, accept: "text/html" });

  // El resumen arriba de todo: qué variante anduvo.
  return [{ ruta: "(resumen) ¿Qué búsqueda anda?", status: resumen.some((r) => r.status === 200 && !r.variante.startsWith("Control")) ? 200 : 403, datos: resumen },
    ...filas];
}
