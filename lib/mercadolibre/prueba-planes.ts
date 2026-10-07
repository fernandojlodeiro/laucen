// Prueba de planes de cuotas en las cuentas de ML (Fer, 7/10; bitácora "Planes
// de cuotas de ML"). ML muestra al comprador cuotas que no coinciden con el plan
// por dentro (en .BAIRES la Premium 3x se ve "6 cuotas" y la 12x "18 cuotas") y
// eso depende del vendedor. Para saber qué muestra cada cuenta, en cada una de
// las otras cuatro se publica UNA notebook distinta con los tres planes que más
// convienen: Clásica, Premium 3x y Premium 12x. Con lo que se ve en ML se arma
// después el esquema definitivo.
//
// Cada alta copia nuestra publicación común (no de catálogo) de .BAIRES del mismo
// SKU (título, fotos, atributos, garantía, descripción) y la comprueba con ML
// (validate, no publica nada). Todas salen al tachado del modelo (uno solo para
// sus planes); después, al entrar en campaña, cada una baja a su precio. La Clásica se crea con POST /items y las de cuotas
// se cuelgan de su producto de ML (POST /user-products/{up}/items, comparten el
// stock), todo en un mismo pedido de la cola. Nada sale sin el clic de Fer:
// queda un lote por cuenta "Preparado, falta tu clic".

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type PedidoMl } from "@/lib/mercadolibre/cola";
import { armarCuerpoCopia, comprobarAlta, modeloDeLaucen, type ItemGuardado } from "@/lib/mercadolibre/copiar";
import { comisionesMl } from "@/lib/precios-ml/datos";
import { comisionesDe, PLAN_INFO, type Comisiones } from "@/lib/precios-ml/motor";

export type PlanPrueba = "clasica" | "3x_campaign" | "12x_campaign";
export const PLANES_PRUEBA: PlanPrueba[] = ["clasica", "3x_campaign", "12x_campaign"];
/** Descuento que se ve sobre el tachado en la Clásica (esquema de Fer, 7/10): el tachado = Clásica ÷ (1 − 45 %). */
export const DESCUENTO_CLASICA = 45;
/** Margen extra de cada plan sobre lo que deja la Clásica (esquema de Fer, 7/10). */
export const MARGEN_PLAN: Record<PlanPrueba, number> = { clasica: 0, "3x_campaign": 2, "12x_campaign": 4 };

/** Qué notebook va en cada cuenta y de qué publicación se copia. `clasica`: el precio
 *  de la Clásica (el piso del esquema: competencia × 90 % en las Asus, × 80 % en la HP;
 *  la G3, al precio que tiene hoy en .BAIRES). */
export const PRUEBA: { cuenta: string; sku: string; origen: string; clasica: number }[] = [
  { cuenta: "ML PUNTO", sku: "F412DA-NH77", origen: "MLA1471328469", clasica: 962_999 },
  { cuenta: "DEIROLAB SA", sku: "S532FA-SB77", origen: "MLA1707952619", clasica: 1_256_226 },
  { cuenta: "DEIROLAB SAS", sku: "15-EF0022NR", origen: "MLA1706473885", clasica: 949_240 },
  { cuenta: "TIENDAVIRTUAL S", sku: "G3-3500", origen: "MLA3064301590", clasica: 2_339_999 },
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
    for (const plan of PLANES_PRUEBA) {
      const ya = items.find((i) => planDe(i.tipo, i.tags, i.terms) === plan);
      filas.push({ canal, cuenta: p.cuenta, sku: p.sku, origen: p.origen, plan, tachado: tachadoPrueba(p.clasica), precio: precioPrueba(p.clasica, plan, valores), comision: valores[plan], existe: ya?.item_id ?? null, stock });
    }
  }
  return { filas, estimada };
}

/** El plan de una publicación guardada (tags o sale_terms INSTALLMENTS_CAMPAIGN). */
function planDe(tipo: string, tags: unknown, terms: unknown): PlanPrueba | "premium" | "9x_campaign" | null {
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
    const deEsta = filas.filter((f) => f.cuenta === p.cuenta);
    const rech = (motivo: string) => res.rechazos.push({ cuenta: p.cuenta, motivo });
    const canal = deEsta[0]?.canal;
    if (!canal) { rech("no está la cuenta en Laucen"); continue; }
    const faltan = deEsta.filter((f) => !f.existe);
    if (!faltan.length) { rech("ya tiene los tres planes"); continue; }
    const pendiente = await una<{ id: number }>(`
      select id::int from ml_cola where organizacion_id = $1 and canal_id = $2 and tipo = 'crear' and item_id = $3
         and estado in ('preparado', 'pendiente', 'enviando')`, [org, canal, `prueba:${p.sku}`]);
    if (pendiente) { rech("ya hay un lote de esta prueba esperando en la cola"); continue; }
    const cuenta = await cuentaDelCanal(org, canal);
    if (!cuenta || cuenta.estado !== "activa") { rech("la cuenta de Mercado Libre no está conectada"); continue; }

    const g = await una<{ ml: ItemGuardado | null; canal_id: number }>(
      "select datos_externos -> 'ml' ml, canal_id::int from meli_item where organizacion_id = $1 and item_id = $2 limit 1", [org, p.origen]);
    if (!g?.ml) { rech(`Laucen no tiene los datos de ${p.origen}: traé las publicaciones de nuevo`); continue; }
    const stock = Math.max(1, deEsta[0].stock);
    const modelo = await modeloDeLaucen(org, p.sku);
    const pedidos: PedidoMl[] = [];
    const nombres: string[] = [];

    const clasica = deEsta.find((f) => f.plan === "clasica")!;
    let up: string | null = null;
    if (clasica.existe) {
      // La cuenta ya tiene la Clásica: los planes se cuelgan de su producto de ML.
      up = (await una<{ up: string | null }>("select datos_externos -> 'ml' ->> 'user_product_id' up from meli_item where organizacion_id = $1 and item_id = $2 limit 1",
        [org, clasica.existe]))?.up ?? null;
      if (!up) { rech(`no se sabe el producto de ML de ${clasica.existe}: traé las publicaciones de nuevo`); continue; }
    } else {
      const item: ItemGuardado = { ...g.ml, price: clasica.tachado, available_quantity: stock, listing_type_id: "gold_special" };
      const c = await comprobarAlta(cuenta, (x) => armarCuerpoCopia(item, p.sku, { variarTitulo: false, rotarFotos: false }, { modelo, ...x }));
      if (!c.ok) { rech(`Mercado Libre no acepta la Clásica: ${c.motivo}`); continue; }
      if (c.avisos) res.avisos.push(`${p.cuenta}: ${c.avisos}`);
      pedidos.push({ metodo: "POST", ruta: "/items", cuerpo: c.cuerpo });
      // La descripción se lee de ML con la cuenta de la publicación copiada.
      const cOrigen = await cuentaDelCanal(org, g.canal_id);
      const d = cOrigen?.estado === "activa" ? await ml<{ plain_text?: string }>(cOrigen, "GET", `/items/${p.origen}/description`) : null;
      const texto = d?.status === 200 ? d.datos.plain_text?.trim() : "";
      if (texto) pedidos.push({ metodo: "POST", ruta: "/items/{id}/description", cuerpo: { plain_text: texto }, seguirSiFalla: true });
      nombres.push(`Clásica $ ${clasica.tachado.toLocaleString("es-AR")} (con campaña $ ${clasica.precio.toLocaleString("es-AR")})`);
    }
    for (const f of faltan.filter((x) => x.plan !== "clasica")) {
      pedidos.push({
        metodo: "POST", ruta: `/user-products/${up ?? "{up}"}/items`, seguirSiFalla: true,
        cuerpo: { price: f.tachado, currency_id: "ARS", listing_type_id: "gold_pro", tags: [PLAN_INFO[f.plan].tag] },
      });
      nombres.push(`${f.plan} $ ${f.tachado.toLocaleString("es-AR")} (con campaña $ ${f.precio.toLocaleString("es-AR")})`);
    }
    const loteId = await encolarLoteConBoton(org, canal, [{
      canalId: canal, itemId: `prueba:${p.sku}`, tipo: "crear",
      antes: { estado: "no existe en esta cuenta" },
      payload: { descripcion: `Prueba de planes en ${p.cuenta}: ${p.sku} — ${nombres.join(", ")} (copia de ${p.origen})`, origen: { canal: g.canal_id, item_id: p.origen }, pedidos },
    }], `Prueba de planes de cuotas: ${p.sku} en ${p.cuenta}`, usuarioId);
    res.lotes.push({ cuenta: p.cuenta, loteId, altas: nombres.length });
  }
  if (!res.lotes.length && !res.rechazos.length) throw new ErrorErp("No hay nada para crear.");
  return res;
}

export function textoResultadoPrueba(r: ResultadoPrueba): string {
  const partes: string[] = [];
  if (r.lotes.length) partes.push(`Quedaron ${r.lotes.length} lote${r.lotes.length === 1 ? "" : "s"} esperando tu clic en la Cola de Mercado Libre (${r.lotes.map((l) => `${l.cuenta}: ${l.altas}`).join(", ")}).`);
  if (r.rechazos.length) partes.push(`No se preparó: ${r.rechazos.map((x) => `${x.cuenta} (${x.motivo})`).join("; ")}.`);
  if (r.avisos.length) partes.push(`Avisos de ML: ${r.avisos.join(" · ")}`);
  return partes.join(" ");
}
