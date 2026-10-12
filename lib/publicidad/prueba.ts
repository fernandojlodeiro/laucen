// Publicidad (Product Ads), Paso 0 de la orden 596: ¿la API deja ESCRIBIR?
// El manual público sólo documenta lectura. Con el clic de Fer (/admin/meli,
// sección 7) se prueban los verbos razonables (OPTIONS, PUT, PATCH, DELETE y
// POST) sobre las rutas que andan para leer, contra una campaña, un anuncio y
// un grupo que NO EXISTEN (ids inventados) y con un cuerpo inválido: no puede
// cambiar nada. Lo que interesa es la respuesta: "No static resource" = la
// ruta no existe; 405 = existe pero no con ese verbo; 403 = falta permiso
// (scope) de la app; 404 de la campaña o 400 de validación = la ruta de
// escritura existe.

import { API, tokenDeCuenta, type Respuesta } from "@/lib/meli";

const NO_EXISTE = "999999999999";
const ITEM_NO_EXISTE = "MLA999999999999";
const CUERPO = { status: "prueba_laucen_invalida" };

async function pedir(token: string, metodo: string, ruta: string, version: string): Promise<{ status: number; allow: string | null; datos: unknown }> {
  const conCuerpo = metodo === "PUT" || metodo === "PATCH" || metodo === "POST";
  try {
    const r = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { accept: "application/json", authorization: `Bearer ${token}`, "api-version": version,
        ...(conCuerpo ? { "content-type": "application/json" } : {}) },
      body: conCuerpo ? JSON.stringify(CUERPO) : undefined,
      cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    const texto = await r.text();
    let datos: unknown = texto.slice(0, 1500);
    try { datos = JSON.parse(texto); } catch { /* queda el texto */ }
    return { status: r.status, allow: r.headers.get("allow"), datos };
  } catch (e) {
    return { status: 0, allow: null, datos: String(e) };
  }
}

/** Qué dice la respuesta, en criollo (para el resumen). */
export function queDice(status: number, datos: unknown): string {
  const t = typeof datos === "string" ? datos : JSON.stringify(datos ?? "");
  if (/No static resource|resource not found/i.test(t)) return "la ruta no existe";
  if (/permission to write/i.test(t)) return "la ruta existe: la app no tiene permiso de escritura";
  if (status === 405) return "la ruta existe, pero no con este verbo";
  if (status === 403) return "falta permiso (scope de la app o de la cuenta)";
  if (status === 401) return "la llave no sirve";
  if (status === 404) return "la ruta existe: no encuentra la campaña/anuncio (es inventado)";
  if (status === 400 || status === 422) return "la ruta existe: rechaza el cuerpo (validación)";
  if (status >= 200 && status < 300) return "contestó bien";
  return status ? `contestó ${status}` : "sin respuesta";
}

/** Corre la prueba con una cuenta (meli_cuenta.id) y su anunciante. Devuelve el
 *  resumen primero y después cada respuesta cruda (formato de meli_pruebas). */
export async function probarEscrituraPublicidad(cuentaId: number, anunciante: string): Promise<Respuesta[]> {
  const token = await tokenDeCuenta(cuentaId);
  if (!token) return [{ ruta: "(resumen) Publicidad: prueba de escritura", status: 401, datos: "la cuenta está desconectada" }];
  const rutas = [
    `/advertising/MLA/product_ads/campaigns/${NO_EXISTE}`,
    `/advertising/MLA/advertisers/${anunciante}/product_ads/campaigns/${NO_EXISTE}`,
    `/advertising/product_ads/campaigns/${NO_EXISTE}`,
    `/marketplace/advertising/MLA/product_ads/campaigns/${NO_EXISTE}`,
    `/marketplace/advertising/MLA/advertisers/${anunciante}/product_ads/campaigns/${NO_EXISTE}`,
    `/advertising/MLA/product_ads/ads/${ITEM_NO_EXISTE}`,
    `/advertising/MLA/advertisers/${anunciante}/product_ads/ads/${ITEM_NO_EXISTE}`,
    `/advertising/product_ads/items/${ITEM_NO_EXISTE}`,
    `/marketplace/advertising/MLA/product_ads/ads/${ITEM_NO_EXISTE}`,
    `/advertising/MLA/advertisers/${anunciante}/product_ads/ad_groups/${NO_EXISTE}`,
  ];
  const plan: [string, string, string][] = [];
  for (const ruta of rutas) {
    for (const m of ["OPTIONS", "PUT", "PATCH", "DELETE"]) plan.push([m, ruta, "2"]);
    plan.push(["PUT", ruta, "1"]);
  }
  // Crear: sólo con cuerpo inválido (sin nombre ni presupuesto, estado inventado), para ver si la ruta existe.
  for (const ruta of [`/advertising/MLA/advertisers/${anunciante}/product_ads/campaigns`, `/advertising/product_ads/campaigns`,
    `/marketplace/advertising/MLA/advertisers/${anunciante}/product_ads/campaigns`, `/advertising/MLA/advertisers/${anunciante}/product_ads/ads`]) {
    plan.push(["OPTIONS", ruta, "2"], ["POST", ruta, "2"]);
  }
  const crudas: Respuesta[] = [];
  const resumen: { variante: string; status: number; resultado: string }[] = [];
  for (const [m, ruta, v] of plan) {
    const r = await pedir(token, m, ruta, v);
    const variante = `${m} ${ruta} (Api-Version ${v})`;
    resumen.push({ variante, status: r.status, resultado: `${queDice(r.status, r.datos)}${r.allow ? ` · Allow: ${r.allow}` : ""}` });
    crudas.push({ ruta: variante, status: r.status, datos: { allow: r.allow, respuesta: r.datos } });
  }
  return [{ ruta: "(resumen) Publicidad: ¿la API deja escribir?", status: 200, datos: resumen }, ...crudas];
}
