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
 *  ve «18 cuotas»). .BAIRES gana todas las Clásicas y todas las 12x; la 3x se reparte
 *  entre las otras cuentas (planilla «Cómo queda (3 planes)»). Acá van las que faltan
 *  en las cuentas de cada modelo. `clasica`: el piso de la Clásica (competencia × 90 %
 *  en las Asus, × 80 % en la HP); todas salen al tachado del modelo y después, al
 *  entrar en campaña, bajan a su precio. `origen`: nuestra común de .BAIRES. */
const F412 = { sku: "F412DA-NH77", origen: "MLA1471328469", clasica: 962_999,
  // El nombre de la de origen tiene 108 letras y ML acepta hasta 60.
  titulo: "Notebook Asus Vivobook F412DA Ryzen 7 3700U 8gb 512gb Ssd 14" };
const S532 = { sku: "S532FA-SB77", origen: "MLA1707952619", clasica: 1_256_226 };
const HP15 = { sku: "15-EF0022NR", origen: "MLA1706473885", clasica: 949_240 };
const CUOTAS: PlanPrueba[] = ["3x_campaign", "12x_campaign"];
export const PRUEBA: { cuenta: string; sku: string; origen: string; clasica: number; titulo?: string; planes: PlanPrueba[] }[] = [
  { cuenta: "ML .BAIRES", ...S532, planes: CUOTAS },
  { cuenta: "ML .BAIRES", ...F412, planes: CUOTAS },
  { cuenta: "ML .BAIRES", ...HP15, planes: CUOTAS },
  { cuenta: "ML PUNTO", ...S532, planes: CUOTAS },
  { cuenta: "ML PUNTO", ...HP15, planes: CUOTAS },
  { cuenta: "TIENDAVIRTUAL S", ...F412, planes: ["clasica", ...CUOTAS] },
];

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
    const items = canal ? await consulta<{ item_id: string; tipo: string; tags: unknown; terms: unknown }>(`
      select item_id, tipo, datos_externos -> 'ml' -> 'tags' tags, datos_externos -> 'ml' -> 'sale_terms' terms
        from meli_item where organizacion_id = $1 and canal_id = $2 and sku = $3 and estado in ('active', 'paused')`, [org, canal, p.sku]) : [];
    const stock = canal ? Number((await una<{ d: number }>(
      "select stock_disponible_canal($1, v.id, $2)::int d from variacion v where v.organizacion_id = $1 and v.sku = $3", [org, canal, p.sku]))?.d ?? 0) : 0;
    for (const plan of p.planes) {
      const ya = items.find((i) => planDe(i.tipo, i.tags, i.terms) === plan);
      filas.push({ canal, cuenta: p.cuenta, sku: p.sku, origen: p.origen, plan, tachado: tachadoPrueba(p.clasica), precio: precioPrueba(p.clasica, plan, valores), comision: valores[plan], existe: ya?.item_id ?? null, stock });
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

export type ResultadoPrueba = { lotes: { cuenta: string; loteId: number; altas: number }[]; rechazos: { cuenta: string; motivo: string }[]; avisos: string[] };

/** Arma (sin mandar) un lote por cuenta con las altas que faltan. */
export async function prepararPrueba(org: string, usuarioId: string): Promise<ResultadoPrueba> {
  const { filas } = await propuestaPrueba(org);
  const res: ResultadoPrueba = { lotes: [], rechazos: [], avisos: [] };
  for (const p of PRUEBA) {
    const deEsta = filas.filter((f) => f.cuenta === p.cuenta && f.sku === p.sku);
    const rech = (motivo: string) => res.rechazos.push({ cuenta: `${p.cuenta} ${p.sku}`, motivo });
    const canal = deEsta[0]?.canal;
    if (!canal) { rech("no está la cuenta en Laucen"); continue; }
    const faltan = deEsta.filter((f) => !f.existe);
    if (!faltan.length) { rech("ya tiene todos sus planes"); continue; }
    const pendiente = await una<{ id: number }>(`
      select id::int from ml_cola where organizacion_id = $1 and canal_id = $2 and tipo = 'crear' and item_id like $3
         and estado in ('preparado', 'pendiente', 'enviando')`, [org, canal, `esquema:${p.sku}%`]);
    if (pendiente) { rech("ya hay un lote esperando en la cola"); continue; }
    const cuenta = await cuentaDelCanal(org, canal);
    if (!cuenta || cuenta.estado !== "activa") { rech("la cuenta de Mercado Libre no está conectada"); continue; }

    const g = await una<{ ml: ItemGuardado | null; canal_id: number }>(
      "select datos_externos -> 'ml' ml, canal_id::int from meli_item where organizacion_id = $1 and item_id = $2 limit 1", [org, p.origen]);
    if (!g?.ml) { rech(`Laucen no tiene los datos de ${p.origen}: traé las publicaciones de nuevo`); continue; }
    const stock = Math.max(1, deEsta[0].stock);
    const modelo = await modeloDeLaucen(org, p.sku);
    const nombres: string[] = [];

    // La descripción se lee de ML con la cuenta de la publicación copiada.
    const cOrigen = await cuentaDelCanal(org, g.canal_id);
    const d = cOrigen?.estado === "activa" ? await ml<{ plain_text?: string }>(cOrigen, "GET", `/items/${p.origen}/description`) : null;
    const texto = d?.status === 200 ? d.datos.plain_text?.trim() : "";
    const altas: Parameters<typeof encolarLoteConBoton>[2] = [];
    for (const f of faltan) {
      const tipo = f.plan === "clasica" ? "gold_special" : "gold_pro";
      // Sin las condiciones de cuotas de la de origen: el plan lo marca el tag.
      const item: ItemGuardado = { ...g.ml, ...(p.titulo ? { family_name: p.titulo, title: p.titulo } : {}), price: f.tachado, available_quantity: stock, listing_type_id: tipo,
        sale_terms: (g.ml.sale_terms ?? []).filter((t) => t.id !== "INSTALLMENTS_CAMPAIGN") };
      // La Premium común (6 cuotas) va sin marca de plan.
      const tag = PLAN_INFO[f.plan].tag;
      const tags = tag ? [tag] : null;
      const c = await comprobarAlta(cuenta, (x) => {
        const cuerpo = armarCuerpoCopia(item, p.sku, { variarTitulo: false, rotarFotos: false }, { modelo, ...x });
        return tags ? { ...cuerpo, tags } : cuerpo;
      });
      const nombre = f.plan === "clasica" ? "Clásica" : f.plan === "premium" ? "Premium común" : `Premium ${PLAN_INFO[f.plan].corto}`;
      if (!c.ok) { rech(`Mercado Libre no acepta la ${nombre}: ${c.motivo}`); continue; }
      if (c.avisos) res.avisos.push(`${p.cuenta} (${nombre}): ${c.avisos}`);
      const pedidos: PedidoMl[] = [{ metodo: "POST", ruta: "/items", cuerpo: c.cuerpo }];
      if (texto) pedidos.push({ metodo: "POST", ruta: "/items/{id}/description", cuerpo: { plain_text: texto }, seguirSiFalla: true });
      altas.push({
        canalId: canal, itemId: `esquema:${p.sku}:${f.plan}`, tipo: "crear",
        antes: { estado: "no existe en esta cuenta" },
        payload: { descripcion: `Alta en ${p.cuenta}: ${p.sku} ${nombre} $ ${f.tachado.toLocaleString("es-AR")} (con campaña $ ${f.precio.toLocaleString("es-AR")}; copia de ${p.origen})`, origen: { canal: g.canal_id, item_id: p.origen }, pedidos },
      });
      nombres.push(nombre);
    }
    if (!altas.length) continue;
    const loteId = await encolarLoteConBoton(org, canal, altas, `Altas del esquema de notebooks: ${p.sku} en ${p.cuenta} (${nombres.join(", ")})`, usuarioId);
    res.lotes.push({ cuenta: `${p.cuenta} ${p.sku}`, loteId, altas: nombres.length });
  }
  if (!res.lotes.length && !res.rechazos.length) throw new ErrorErp("No hay nada para crear.");
  return res;
}

export function textoResultadoPrueba(r: ResultadoPrueba): string {
  const partes: string[] = [];
  if (r.lotes.length) partes.push(`Quedaron ${r.lotes.length} lote${r.lotes.length === 1 ? "" : "s"} esperando tu clic en Configuración › Cola de Mercado Libre, pestaña «Lotes preparados» (${r.lotes.map((l) => `lote ${l.loteId}: ${l.cuenta}, ${l.altas}`).join("; ")}).`);
  if (r.rechazos.length) partes.push(`No se preparó: ${r.rechazos.map((x) => `${x.cuenta} (${x.motivo})`).join("; ")}.`);
  if (r.avisos.length) partes.push(`Avisos de ML: ${r.avisos.join(" · ")}`);
  return partes.join(" ");
}
