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

// ── Paso 0, segunda parte: la prueba REAL, sobre la campaña de prueba ─────────
// Con el clic de Fer y sólo sobre una campaña cuyo nombre empieza con «PRUEBA» (candado: nunca otra):
// cambia el presupuesto, el ROAS objetivo y el estado, y pausa y reactiva su anuncio. Después de cada
// cambio aceptado lee para ver si quedó y lo devuelve a como estaba. Al final relee y compara.

type Campana = { id?: number; name?: string; status?: string; budget?: number; daily_budget?: number; roas_target?: number };

async function pedirCon(token: string, metodo: string, ruta: string, cuerpo?: unknown): Promise<{ status: number; datos: unknown }> {
  try {
    const r = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { accept: "application/json", authorization: `Bearer ${token}`, "api-version": "2", ...(cuerpo !== undefined ? { "content-type": "application/json" } : {}) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined, cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    const texto = await r.text();
    try { return { status: r.status, datos: JSON.parse(texto) }; } catch { return { status: r.status, datos: texto.slice(0, 1500) }; }
  } catch (e) {
    return { status: 0, datos: String(e) };
  }
}

const motivoCorto = (r: { status: number; datos: unknown }) => {
  const t = typeof r.datos === "string" ? r.datos : JSON.stringify(r.datos ?? "");
  return /permission to write/i.test(t) ? "sin permiso de escritura" : /resource not found/i.test(t) ? "la ruta no existe" : t.slice(0, 160) || "sin cuerpo";
};

export async function probarCampanaReal(cuentaId: number, anunciante: string, campanaId: string): Promise<Respuesta[]> {
  const token = await tokenDeCuenta(cuentaId);
  if (!token) return [{ ruta: "(resumen) Publicidad: prueba real", status: 401, datos: "la cuenta está desconectada" }];
  const crudas: Respuesta[] = [];
  const resumen: { variante: string; status: number; resultado: string }[] = [];
  const paso = async (variante: string, metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await pedirCon(token, metodo, ruta, cuerpo);
    crudas.push({ ruta: `${variante} — ${metodo} ${ruta}${cuerpo !== undefined ? ` ${JSON.stringify(cuerpo)}` : ""}`, status: r.status, datos: r.datos });
    return r;
  };
  const anotar = (variante: string, status: number, resultado: string) => resumen.push({ variante, status, resultado });
  const fin = () => [{ ruta: "(resumen) Publicidad: prueba real sobre la campaña de prueba", status: 200, datos: resumen }, ...crudas];
  const leer = async (que: string) => (await paso(`Leer (${que})`, "GET", `/advertising/MLA/product_ads/campaigns/${campanaId}`)).datos as Campana;

  const antes = await leer("antes");
  if (!antes?.id || !/^PRUEBA/i.test(antes.name ?? "")) {
    anotar("Candado", 0, `La campaña ${campanaId} no se llama «PRUEBA…» (se llama «${antes?.name ?? "?"}»): no se toca.`);
    return fin();
  }
  anotar("Antes", 200, `«${antes.name}»: ${antes.status}, presupuesto ${antes.budget}, ROAS ${antes.roas_target}`);

  const rutas = [`/advertising/MLA/product_ads/campaigns/${campanaId}`, `/marketplace/advertising/MLA/product_ads/campaigns/${campanaId}`,
    `/advertising/product_ads/campaigns/${campanaId}`];
  // Un cambio por ruta (PUT y, si no, PATCH); en cuanto una lo acepta, se verifica, se devuelve y no se sigue probando.
  const probar = async (que: string, cambio: Record<string, unknown>, vuelta: Record<string, unknown>, quedo: (c: Campana) => boolean) => {
    for (const ruta of rutas) {
      for (const metodo of ["PUT", "PATCH"]) {
        const r = await paso(`${que}: cambiar`, metodo, ruta, cambio);
        if (r.status >= 200 && r.status < 300) {
          const leida = await leer(`después de ${que}`);
          const v = await paso(`${que}: devolver`, metodo, ruta, vuelta);
          anotar(`${que} (${metodo} ${ruta})`, r.status, `ACEPTADO; ${quedo(leida) ? "se ve el cambio al leer" : "al leer NO se ve el cambio"}; devolver: ${v.status}`);
          return;
        }
        anotar(`${que} (${metodo} ${ruta})`, r.status, motivoCorto(r));
      }
    }
  };
  const presupuesto = Number(antes.budget ?? antes.daily_budget ?? 1000);
  await probar("Presupuesto", { budget: presupuesto + 100 }, { budget: presupuesto }, (c) => Number(c.budget) === presupuesto + 100);
  const roas = Number(antes.roas_target ?? 4.76);
  const otroRoas = Math.round((roas >= 5 ? roas - 0.5 : roas + 0.5) * 100) / 100;
  await probar("ROAS objetivo", { roas_target: otroRoas }, { roas_target: roas }, (c) => Number(c.roas_target) === otroRoas);
  const estado = antes.status === "paused" ? "paused" : "active";
  await probar("Estado", { status: estado === "active" ? "paused" : "active" }, { status: estado }, (c) => c.status !== estado);

  // El anuncio de la campaña: pausarlo y volverlo a como estaba.
  const ads = await paso("Leer anuncios", "GET", `/advertising/MLA/advertisers/${anunciante}/product_ads/ads/search?limit=5&filters[campaign_id]=${campanaId}`);
  const item = ((ads.datos as { results?: { item_id: string; status?: string }[] })?.results ?? [])[0];
  if (item) {
    let hecho = false;
    for (const ruta of [`/advertising/MLA/product_ads/ads/${item.item_id}`, `/marketplace/advertising/MLA/product_ads/ads/${item.item_id}`, `/advertising/product_ads/items/${item.item_id}`]) {
      const r = await paso("Anuncio: pausar", "PUT", ruta, { status: "paused" });
      if (r.status >= 200 && r.status < 300) {
        const v = await paso("Anuncio: devolver", "PUT", ruta, { status: item.status ?? "active" });
        anotar(`Anuncio ${item.item_id} (PUT ${ruta})`, r.status, `ACEPTADO; devolver: ${v.status}`);
        hecho = true;
        break;
      }
      anotar(`Anuncio ${item.item_id} (PUT ${ruta})`, r.status, motivoCorto(r));
    }
    if (!hecho) anotar("Anuncio", 0, "ninguna ruta aceptó pausar el anuncio");
  }

  const despues = await leer("al final");
  const igual = despues?.status === antes.status && Number(despues?.budget) === Number(antes.budget) && Number(despues?.roas_target) === Number(antes.roas_target);
  anotar("Al final", 200, `${igual ? "quedó IGUAL que al principio" : "QUEDÓ DISTINTA"}: ${despues?.status}, presupuesto ${despues?.budget}, ROAS ${despues?.roas_target}`);
  return fin();
}
