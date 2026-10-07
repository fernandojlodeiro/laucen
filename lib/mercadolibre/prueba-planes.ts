// Prueba de planes de cuotas en las cuentas de ML (Fer, 7/10; bitácora "Planes
// de cuotas de ML"). ML muestra al comprador cuotas que no coinciden con el plan
// por dentro (en .BAIRES la Premium 3x se ve "6 cuotas" y la 12x "18 cuotas") y
// eso depende del vendedor. Para saber qué muestra cada cuenta, en cada una de
// las otras cuatro se publica UNA notebook distinta con los cinco planes:
// Clásica, Premium (6 cuotas, sin marca), Premium 3x, 9x y 12x. Con lo que se ve en ML se arma
// después el esquema definitivo.
//
// Cada alta copia nuestra publicación común (no de catálogo) de .BAIRES del mismo
// SKU (título, fotos, atributos, garantía, descripción) y la comprueba con ML
// (validate, no publica nada). Todas salen al tachado del modelo (uno solo para
// sus planes); después, al entrar en campaña, cada una baja a su precio.
// Cada plan es una publicación propia con POST /items: la Clásica, gold_special;
// las de cuotas, gold_pro con la marca del plan en tags ("3x_campaign",
// "12x_campaign"; así lo activa ML, documentación "Campañas con cuotas para
// Marketplace"). ML las junta solo en el mismo producto (user product) y
// comparten el stock. Colgarlas de /user-products/{up}/items daba 500 siempre
// (lote 19, 7/10). Cada alta va en su propia fila de la cola: si una falla, las
// otras salen igual y ninguna se duplica. Nada sale sin el clic de Fer: queda un
// lote por cuenta "Preparado, falta tu clic".

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type PedidoMl } from "@/lib/mercadolibre/cola";
import { armarCuerpoCopia, comprobarAlta, modeloDeLaucen, type ItemGuardado } from "@/lib/mercadolibre/copiar";
import { comisionesMl } from "@/lib/precios-ml/datos";
import { comisionesDe, PLAN_INFO, type Comisiones } from "@/lib/precios-ml/motor";

export type PlanPrueba = "clasica" | "premium" | "3x_campaign" | "9x_campaign" | "12x_campaign";
/** Los cinco planes (Fer, 7/10: para ver cómo aparece cada uno en cada tienda). */
export const PLANES_PRUEBA: PlanPrueba[] = ["clasica", "premium", "3x_campaign", "9x_campaign", "12x_campaign"];
/** Descuento que se ve sobre el tachado en la Clásica (esquema de Fer, 7/10): el tachado = Clásica ÷ (1 − 45 %). */
export const DESCUENTO_CLASICA = 45;
/** Margen extra de cada plan sobre lo que deja la Clásica (esquema de Fer, 7/10). */
export const MARGEN_PLAN: Record<PlanPrueba, number> = { clasica: 0, premium: 2, "3x_campaign": 2, "9x_campaign": 4, "12x_campaign": 4 };

/** Qué se crea en cada cuenta (Fer, 7/10, después de la prueba): quedan tres planes,
 *  Clásica, Premium 3x (el comprador la ve «6 cuotas») y Premium 12x (en .BAIRES se
 *  ve «18 cuotas»), y los 7 modelos van en las 5 cuentas (Fer, 7/10 a la tarde: "los
 *  7 modelos en todos los canales de Meli con sus 3 precios de cuotas"). .BAIRES gana
 *  todas las Clásicas y todas las 12x; la 3x se reparte entre las otras cuentas (eso lo
 *  deciden las reglas de Precios en ML, no esta lista). `clasica`: el piso de la Clásica
 *  (competencia × 90 % en las Asus, × 80 % en la HP; las versiones con más memoria, la
 *  competencia + $ 145.000 por 4 GB más); todas salen al tachado del modelo y después, al
 *  entrar en campaña, bajan a su precio. `origen`: nuestra publicación de .BAIRES que se
 *  copia. Las versiones con más memoria son kits en Laucen (equipo + 1 memoria SKU03498)
 *  y copian la de 8 GB cambiándole el nombre, la memoria y la descripción.
 *  `sinGtin`: el código de barras de la publicación de origen está mal (Fer, 7/10: el
 *  193905481088 no es ni de la S532 ni de la G3): se publica sin código, con el motivo
 *  "no tiene código registrado" (el valor exacto se lee de la categoría en ML: con el
 *  texto solo, ML lo descarta y pide el GTIN). Los kits llevan el código del equipo:
 *  en Notebooks ML lo exige (7/10, 64 altas rechazadas sin él). */
type ModeloEsquema = { sku: string; origen: string; clasica: number; titulo?: string; ram?: string; sinGtin?: boolean; gtin?: string };
const F412: ModeloEsquema = { sku: "F412DA-NH77", origen: "MLA1471328469", clasica: 962_999,
  // El nombre de la de origen tiene 108 letras y ML acepta hasta 60.
  titulo: "Notebook Asus Vivobook F412DA Ryzen 7 3700U 8gb 512gb Ssd 14" };
// UPC de la S532 que encontró Cowork (7/10, ficha de catálogo de eBay; falta confirmarlo con una caja antes de mandar los lotes).
const S532: ModeloEsquema = { sku: "S532FA-SB77", origen: "MLA1707952619", clasica: 1_256_226, gtin: "192876286241" };
const HP15: ModeloEsquema = { sku: "15-EF0022NR", origen: "MLA1706473885", clasica: 949_240 };
// UPC de la caja de la G3 (Fer, 7/10). El que tenía la publicación (193905481088) es de una HP 14-dk.
const G3: ModeloEsquema = { sku: "G3-3500", origen: "MLA3064301590", clasica: 2_339_999, gtin: "196105257545" };
export const MODELOS_ESQUEMA: ModeloEsquema[] = [
  S532,
  { ...S532, sku: "S532FA-SB77-12GB", clasica: 1_386_726, ram: "12", titulo: "Notebook Asus Vivobook I7-8565u 12gb 512gb Ssd 15.6 Fhd" },
  F412,
  { ...F412, sku: "F412DA-NH77-12GB", clasica: 1_093_499, ram: "12", titulo: "Notebook Asus Vivobook F412DA Ryzen 7 12gb 512gb Ssd 14" },
  HP15,
  { ...HP15, sku: "15-EF0022NR-16GB", clasica: 1_181_240, ram: "16", titulo: "Notebook Hp Amd Ryzen 7 3700u 16gb Ram 256gb Ssd Windows" },
  G3,
];
const CUENTAS_ESQUEMA = ["ML .BAIRES", "ML PUNTO", "DEIROLAB SA", "DEIROLAB SAS", "TIENDAVIRTUAL S"];
const PLANES_ESQUEMA: PlanPrueba[] = ["clasica", "3x_campaign", "12x_campaign"];
export const PRUEBA: (ModeloEsquema & { cuenta: string; planes: PlanPrueba[] })[] =
  MODELOS_ESQUEMA.flatMap((m) => CUENTAS_ESQUEMA.map((cuenta) => ({ cuenta, ...m, planes: PLANES_ESQUEMA })));

/** "8gb" → "12gb" en un texto (respeta cómo estaba escrito: "8 GB", "8gb", "8GB"). */
export const cambiarMemoria = (texto: string, ram: string) => texto.replace(/\b8(\s?)(gb)\b/gi, (_m, esp: string, gb: string) => `${ram}${esp}${gb}`);

/** El tachado del modelo (uno solo para todos sus planes): con la campaña, la Clásica muestra 45 % de descuento. */
export const tachadoPrueba = (clasica: number) => Math.round(clasica / (1 - DESCUENTO_CLASICA / 100));

/** Precio del plan con la campaña: deja, después de su comisión, lo mismo que la Clásica más el margen. */
export function precioPrueba(clasica: number, plan: PlanPrueba, c: Comisiones): number {
  if (plan === "clasica") return Math.round(clasica);
  return Math.round(((clasica * (1 - c.clasica / 100)) / (1 - c[plan] / 100)) * (1 + MARGEN_PLAN[plan] / 100));
}

export type FilaPrueba = {
  canal: number | null; cuenta: string; sku: string; origen: string; plan: PlanPrueba;
  /** Se publica al tachado (sin campaña); al entrar en campaña baja a `precio`. */
  tachado: number; precio: number; comision: number;
  /** La publicación que la cuenta ya tiene en ese plan (activa o pausada), si hay. */
  existe: string | null; stock: number;
};

/** Lo que se va a crear: por cuenta y plan, el precio y si ya existe. */
export async function propuestaPrueba(org: string): Promise<{ filas: FilaPrueba[]; estimada: boolean }> {
  const com = await comisionesMl();
  const cat = await una<{ categoria: string | null }>("select categoria from meli_item where organizacion_id = $1 and item_id = $2 limit 1", [org, PRUEBA[0].origen]);
  const { valores, estimada } = comisionesDe(com.porCategoria.get(cat?.categoria ?? "MLA1652"), com.general);
  const canales = new Map((await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre' and estado <> 'archivado'", [org])).map((c) => [c.nombre, c.id]));
  const filas: FilaPrueba[] = [];
  for (const p of PRUEBA) {
    const canal = canales.get(p.cuenta) ?? null;
    // Cuenta sólo lo activo: una pausada vieja no vende (Fer, 7/10: "que queden publicados").
    const items = canal ? await consulta<{ item_id: string; tipo: string; tags: unknown; terms: unknown }>(`
      select item_id, tipo, datos_externos -> 'ml' -> 'tags' tags, datos_externos -> 'ml' -> 'sale_terms' terms
        from meli_item where organizacion_id = $1 and canal_id = $2 and sku = $3 and estado = 'active'`, [org, canal, p.sku]) : [];
    // Lo que ya está en la cola esperando salir (o recién creado, antes de que Laucen lo lea) tampoco se vuelve a preparar.
    const enCola = canal ? new Set((await consulta<{ item_id: string }>(`
      select item_id from ml_cola where organizacion_id = $1 and canal_id = $2 and tipo = 'crear' and item_id like $3
         and (estado in ('preparado', 'pendiente', 'enviando') or (estado = 'ok' and enviado_ts > now() - interval '2 hours'))`,
      [org, canal, `esquema:${p.sku}:%`])).map((x) => x.item_id)) : new Set<string>();
    const stock = canal ? Number((await una<{ d: number }>(
      "select stock_disponible_canal($1, v.id, $2)::int d from variacion v where v.organizacion_id = $1 and v.sku = $3", [org, canal, p.sku]))?.d ?? 0) : 0;
    for (const plan of p.planes) {
      const ya = items.find((i) => planDe(i.tipo, i.tags, i.terms) === plan)?.item_id ?? (enCola.has(`esquema:${p.sku}:${plan}`) ? "en la cola" : null);
      filas.push({ canal, cuenta: p.cuenta, sku: p.sku, origen: p.origen, plan, tachado: tachadoPrueba(p.clasica), precio: precioPrueba(p.clasica, plan, valores), comision: valores[plan], existe: ya, stock });
    }
  }
  return { filas, estimada };
}

/** El plan de una publicación guardada (tags o sale_terms INSTALLMENTS_CAMPAIGN). */
function planDe(tipo: string, tags: unknown, terms: unknown): PlanPrueba | null {
  if (tipo === "gold_special") return "clasica";
  if (tipo !== "gold_pro") return null;
  const t = new Set([...(Array.isArray(tags) ? tags.map(String) : []),
    ...(Array.isArray(terms) ? terms.filter((x) => x?.id === "INSTALLMENTS_CAMPAIGN").map((x) => String(x.value_name)) : [])]);
  for (const p of ["12x_campaign", "9x_campaign", "3x_campaign"] as const) if (t.has(p)) return p;
  return "premium";
}

export type ResultadoPrueba = { lotes: { cuenta: string; loteId: number; altas: number }[]; rechazos: { cuenta: string; motivo: string }[]; avisos: string[]; sinTiempo?: number };

/** Arma (sin mandar) un lote por cuenta con las altas que faltan. Comprueba cada alta con
 *  ML (validate) y corta antes de que se acabe el tiempo de la tarea (`hasta`): lo que no
 *  llegó a preparar queda para apretar de nuevo (lo ya preparado no se repite). */
export async function prepararPrueba(org: string, usuarioId: string, hasta = Date.now() + 240_000): Promise<ResultadoPrueba> {
  const { filas } = await propuestaPrueba(org);
  const res: ResultadoPrueba = { lotes: [], rechazos: [], avisos: [] };
  const porCuenta = new Map<number, { cuenta: string; altas: Parameters<typeof encolarLoteConBoton>[2]; nombres: string[] }>();
  const origenes = new Map<string, { ml: ItemGuardado; canal: number; texto: string } | null>();
  const motivosGtin = new Map<string, { id: string; name: string } | null>();
  let sinTiempo = 0;
  for (const p of PRUEBA) {
    const deEsta = filas.filter((f) => f.cuenta === p.cuenta && f.sku === p.sku);
    const rech = (motivo: string) => res.rechazos.push({ cuenta: `${p.cuenta} ${p.sku}`, motivo });
    const canal = deEsta[0]?.canal;
    const faltan = deEsta.filter((f) => !f.existe);
    if (!faltan.length) continue;
    if (!canal) { rech("no está la cuenta en Laucen"); continue; }
    if (Date.now() > hasta) { sinTiempo += faltan.length; continue; }
    const cuenta = await cuentaDelCanal(org, canal);
    if (!cuenta || cuenta.estado !== "activa") { rech("la cuenta de Mercado Libre no está conectada"); continue; }

    if (!origenes.has(p.origen)) {
      const g = await una<{ ml: ItemGuardado | null; canal_id: number }>(
        "select datos_externos -> 'ml' ml, canal_id::int from meli_item where organizacion_id = $1 and item_id = $2 limit 1", [org, p.origen]);
      // La descripción se lee de ML con la cuenta de la publicación copiada.
      const cOrigen = g?.ml ? await cuentaDelCanal(org, g.canal_id) : null;
      const d = cOrigen?.estado === "activa" ? await ml<{ plain_text?: string }>(cOrigen, "GET", `/items/${p.origen}/description`) : null;
      origenes.set(p.origen, g?.ml ? { ml: g.ml, canal: g.canal_id, texto: d?.status === 200 ? d.datos.plain_text?.trim() ?? "" : "" } : null);
    }
    const o = origenes.get(p.origen);
    if (!o) { rech(`Laucen no tiene los datos de ${p.origen}: traé las publicaciones de nuevo`); continue; }
    const stock = Math.max(1, deEsta[0].stock);
    const modelo = await modeloDeLaucen(org, p.sku);
    const texto = p.ram ? cambiarMemoria(o.texto, p.ram) : o.texto;
    // La memoria (versiones con más) y el código de barras (si el de origen está mal o no es de fábrica).
    const atributos = (o.ml.attributes ?? [])
      .filter((a) => !((p.sinGtin || p.gtin) && (a.id === "GTIN" || a.id === "EMPTY_GTIN_REASON")))
      .map((a) => (p.ram && a.id === "RAM_MEMORY_MODULE_TOTAL_CAPACITY" ? { id: a.id, value_name: `${p.ram} GB` } : a));
    if (p.gtin) atributos.push({ id: "GTIN", value_name: p.gtin });
    if (p.sinGtin) {
      const cat = o.ml.category_id ?? "";
      if (!motivosGtin.has(cat)) {
        const r = await ml<{ id: string; values?: { id: string; name: string }[] }[]>(cuenta, "GET", `/categories/${cat}/attributes`);
        const v = r.status === 200 && Array.isArray(r.datos) ? r.datos.find((a) => a.id === "EMPTY_GTIN_REASON")?.values?.find((x) => /no tiene c[oó]digo/i.test(x.name)) : undefined;
        motivosGtin.set(cat, v ?? null);
      }
      const motivo = motivosGtin.get(cat);
      if (!motivo) { rech("la categoría no acepta publicar sin código de barras: hace falta el código (UPC) de la caja"); continue; }
      atributos.push({ id: "EMPTY_GTIN_REASON", value_id: motivo.id, value_name: motivo.name });
    }
    const lote = porCuenta.get(canal) ?? { cuenta: p.cuenta, altas: [], nombres: [] };
    porCuenta.set(canal, lote);
    for (const f of faltan) {
      if (Date.now() > hasta) { sinTiempo++; continue; }
      const tipo = f.plan === "clasica" ? "gold_special" : "gold_pro";
      // Sin las condiciones de cuotas de la de origen: el plan lo marca el tag.
      const item: ItemGuardado = { ...o.ml, ...(p.titulo ? { family_name: p.titulo, title: p.titulo } : {}), attributes: atributos, price: f.tachado,
        available_quantity: stock, listing_type_id: tipo, sale_terms: (o.ml.sale_terms ?? []).filter((t) => t.id !== "INSTALLMENTS_CAMPAIGN") };
      // La Premium común (6 cuotas) va sin marca de plan.
      const tag = PLAN_INFO[f.plan].tag;
      const tags = tag ? [tag] : null;
      const c = await comprobarAlta(cuenta, (x) => {
        const cuerpo = armarCuerpoCopia(item, p.sku, { variarTitulo: false, rotarFotos: false }, { modelo, ...x });
        return tags ? { ...cuerpo, tags } : cuerpo;
      });
      const nombre = f.plan === "clasica" ? "Clásica" : f.plan === "premium" ? "Premium común" : `Premium ${PLAN_INFO[f.plan].corto}`;
      if (!c.ok) { rech(`Mercado Libre no acepta la ${nombre}: ${c.motivo}`); continue; }
      if (c.avisos) res.avisos.push(`${p.cuenta} ${p.sku} (${nombre}): ${c.avisos}`);
      const pedidos: PedidoMl[] = [{ metodo: "POST", ruta: "/items", cuerpo: c.cuerpo }];
      if (texto) pedidos.push({ metodo: "POST", ruta: "/items/{id}/description", cuerpo: { plain_text: texto }, seguirSiFalla: true });
      lote.altas.push({
        canalId: canal, itemId: `esquema:${p.sku}:${f.plan}`, tipo: "crear",
        antes: { estado: "no existe en esta cuenta" },
        payload: { descripcion: `Alta en ${p.cuenta}: ${p.sku} ${nombre} $ ${f.tachado.toLocaleString("es-AR")} (con campaña $ ${f.precio.toLocaleString("es-AR")}; copia de ${p.origen})`, origen: { canal: o.canal, item_id: p.origen }, pedidos },
      });
      lote.nombres.push(`${p.sku} ${nombre}`);
    }
  }
  for (const [canal, l] of porCuenta) {
    if (!l.altas.length) continue;
    const loteId = await encolarLoteConBoton(org, canal, l.altas, `Altas del esquema de notebooks en ${l.cuenta} (${l.altas.length})`, usuarioId);
    res.lotes.push({ cuenta: l.cuenta, loteId, altas: l.altas.length });
  }
  res.sinTiempo = sinTiempo;
  if (!res.lotes.length && !res.rechazos.length && !sinTiempo) throw new ErrorErp("No hay nada para crear.");
  return res;
}

export function textoResultadoPrueba(r: ResultadoPrueba): string {
  const partes: string[] = [];
  if (r.lotes.length) partes.push(`Quedaron ${r.lotes.length} lote${r.lotes.length === 1 ? "" : "s"} esperando tu clic en Configuración › Cola de Mercado Libre, pestaña «Lotes preparados» (${r.lotes.map((l) => `lote ${l.loteId}: ${l.cuenta}, ${l.altas}`).join("; ")}).`);
  if (r.rechazos.length) partes.push(`No se preparó: ${r.rechazos.map((x) => `${x.cuenta} (${x.motivo})`).join("; ")}.`);
  if (r.avisos.length) partes.push(`Avisos de ML: ${r.avisos.join(" · ")}`);
  if (r.sinTiempo) partes.push(`No llegué a preparar ${r.sinTiempo} (se acabó el tiempo): apretá el botón de nuevo y se preparan las que faltan.`);
  return partes.join(" ");
}
