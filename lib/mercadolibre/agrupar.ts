// Planes de cuotas agrupados en un mismo producto de Mercado Libre (Fer, 22/10).
//
// En ML cada «producto de usuario» (user_product_id) tiene su propio stock; dentro de una
// cuenta, la Clásica, la Premium y los planes de cuotas comparten stock (y código de Full)
// sólo si están en el mismo producto. ML suma una publicación nueva a un producto que ya
// existe cuando es copia EXACTA de una de ese producto en la misma cuenta (lote 140, 22/10):
// el mismo family_name, las mismas fotos y atributos, sus sale_terms (garantía, factura), la
// tienda oficial y los canales. Con el título mezclado por plan (pauta del 10/10) o sin la
// tienda oficial / los sale_terms, ML le abría otro producto y cada plan tenía stock propio
// (y un comprador podía llevarse más de lo que hay).
//
//   · cuerpoAgrupado: el cuerpo de POST /items para sumar un plan al producto de la
//     publicación «madre» de la cuenta (lo usan publicar-todas.ts y precios-ml/faltantes.ts).
//   · madreDe: la publicación común de la cuenta cuyo producto junta más ventas.
//   · prepararAgrupar: rehace los planes que quedaron en otro producto y no tienen ventas
//     (Configuración › Canales, cuenta de ML): un lote con las altas agrupadas que espera
//     el clic de Fer. prepararCierreAgrupados: otro lote que cierra y elimina las viejas
//     cuando su plan ya está en el producto de la madre.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal, type CuentaMl } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type CambioMl, type PedidoMl } from "@/lib/mercadolibre/cola";
import { comprobarAlta, type ItemGuardado } from "@/lib/mercadolibre/copiar";
import { planDe, type PlanPrueba } from "@/lib/mercadolibre/prueba-planes";

export type ItemMadre = ItemGuardado & { official_store_id?: number | null };

/** Lo que no se copia: lo calcula ML (PACKAGE_*) o no se puede mandar. */
const NO_COPIAR = (id: string) => /^PACKAGE_/.test(id) || id === "IS_TOM_BRAND";

const nombrePlan: Record<PlanPrueba, string> = { clasica: "Clásica", premium: "Premium", "3x_campaign": "Premium 3x", "9x_campaign": "Premium 9x", "12x_campaign": "Premium 12x" };

/** El cuerpo de POST /items para un plan, copia exacta de la madre de la misma cuenta, así ML lo
 *  suma a su producto. `sacar`: atributos que ML no deja mandar (los ignora igual). Pura. */
export function cuerpoAgrupado(madre: ItemMadre, plan: PlanPrueba, precio: number, cantidad: number, sacar: string[] = []): Record<string, unknown> {
  const atributos = (madre.attributes ?? [])
    .filter((a) => !NO_COPIAR(a.id) && !sacar.includes(a.id)
      && ((a.value_id != null && a.value_id !== "-1") || (a.value_name != null && a.value_name.trim() !== "")))
    .map((a) => ({ id: a.id, ...(a.value_id && a.value_id !== "-1" ? { value_id: a.value_id } : {}), ...(a.value_name != null ? { value_name: a.value_name } : {}) }));
  const condiciones = (madre.sale_terms ?? []).filter((t) => t.id !== "INSTALLMENTS_CAMPAIGN" && (t.value_id || t.value_name))
    .map((t) => ({ id: t.id, ...(t.value_id ? { value_id: t.value_id } : { value_name: t.value_name }) }));
  const fotos = (madre.pictures ?? []).map((f) => f.secure_url ?? f.url).filter((u): u is string => !!u);
  const tag = plan === "clasica" || plan === "premium" ? null : plan;
  return {
    family_name: (madre.family_name ?? madre.title ?? "").trim(),
    category_id: madre.category_id,
    price: precio,
    currency_id: madre.currency_id ?? "ARS",
    available_quantity: Math.max(1, cantidad),
    buying_mode: madre.buying_mode ?? "buy_it_now",
    condition: madre.condition ?? "new",
    listing_type_id: plan === "clasica" ? "gold_special" : "gold_pro",
    channels: madre.channels?.length ? madre.channels : ["marketplace"],
    ...(madre.official_store_id ? { official_store_id: madre.official_store_id } : {}),
    pictures: fotos.map((source) => ({ source })),
    attributes: atributos,
    shipping: { mode: "me2" },
    ...(condiciones.length ? { sale_terms: condiciones } : {}),
    ...(madre.video_id ? { video_id: madre.video_id } : {}),
    ...(tag ? { tags: [tag] } : {}),
  };
}

/** La publicación común (no de catálogo, sin variaciones) de esa cuenta cuyo producto de ML junta
 *  más ventas: la «madre» que copian los planes para quedar en su producto. */
export async function madreDe(org: string, canal: number, sku: string): Promise<{ itemId: string; up: string | null; ml: ItemMadre } | null> {
  const r = await una<{ item_id: string; up: string | null; ml: ItemMadre }>(`
    with x as (
      select m.item_id, m.datos_externos -> 'ml' ml, m.datos_externos -> 'ml' ->> 'user_product_id' up, coalesce(m.vendidos, 0) vendidos, m.estado
        from meli_item m
       where m.organizacion_id = $1 and m.canal_id = $2 and m.sku = $3 and m.estado in ('active', 'paused')
         and m.datos_externos -> 'ml' is not null and m.variation_id = ''
         and not coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false)
         and coalesce(m.logistica, '') <> 'fulfillment')
    select item_id, up, ml from x
     order by sum(vendidos) over (partition by up) desc, (estado = 'active') desc, vendidos desc, item_id limit 1`, [org, canal, sku]);
  return r ? { itemId: r.item_id, up: r.up, ml: r.ml } : null;
}

/** Comprueba con ML (validate, no publica nada) el plan agrupado. Sólo saca lo que ML no deja mandar:
 *  completar otros datos lo haría distinto de la madre y ML le abriría otro producto. */
export async function comprobarAgrupado(cuenta: CuentaMl, madre: ItemMadre, plan: PlanPrueba, precio: number, cantidad: number) {
  return comprobarAlta(cuenta, (x) => cuerpoAgrupado(madre, plan, precio, cantidad, x.sacar));
}

type Pub = { id: number; item_id: string; up: string; catalogo: boolean; tipo: string | null; tags: unknown; terms: unknown; precio: number | null; vendidos: number; catalogo_prod: string | null };
type Grupo = { variacion: number; sku: string; madre: string; madreUp: string; disp: number; pubs: Pub[] };

/** Los productos de la cuenta con algún plan en otro producto de ML que el de la madre, sin ventas en ese producto. */
async function gruposSeparados(org: string, canal: number): Promise<Grupo[]> {
  const filas = await consulta<Pub & { variacion: number; sku: string; madre_up: string; disp: number }>(`
    with x as (
      select p.id::int, p.variacion_id::int variacion, v.sku, p.id_externo item_id, p.datos_externos ->> 'user_product_id' up,
             coalesce((p.datos_externos ->> 'catalogo')::boolean, false) catalogo, mi.tipo, mi.datos_externos -> 'ml' -> 'tags' tags,
             mi.datos_externos -> 'ml' -> 'sale_terms' terms, mi.precio::float8 precio, coalesce(mi.vendidos, 0)::int vendidos,
             mi.datos_externos -> 'ml' ->> 'catalog_product_id' catalogo_prod,
             greatest(stock_disponible_canal(p.organizacion_id, p.variacion_id, p.canal_id), 0)::int disp
        from publicacion p join variacion v on v.id = p.variacion_id
        join meli_item mi on mi.canal_id = p.canal_id and mi.item_id = p.id_externo and mi.variation_id = ''
       where p.organizacion_id = $1 and p.canal_id = $2 and p.estado in ('activa', 'pausada') and p.variacion_externa is null
         and coalesce(p.datos_externos ->> 'logistica', '') <> 'fulfillment' and p.datos_externos ->> 'user_product_id' is not null),
    ups as (
      select variacion, up, sum(vendidos) v,
             row_number() over (partition by variacion order by bool_or(not catalogo) desc, sum(vendidos) desc, min(id)) rk
        from x group by variacion, up)
    select x.*, (select u2.up from ups u2 where u2.variacion = x.variacion and u2.rk = 1) madre_up
      from x join ups u using (variacion, up)
     where u.rk = 1 or u.v = 0
     order by x.variacion, x.id`, [org, canal]);
  const porVar = new Map<number, typeof filas>();
  for (const f of filas) porVar.set(f.variacion, [...(porVar.get(f.variacion) ?? []), f]);
  const grupos: Grupo[] = [];
  for (const [v, fs] of porVar) {
    if (!fs.some((f) => f.up !== f.madre_up)) continue;
    const madre = fs.filter((f) => f.up === f.madre_up && !f.catalogo).sort((a, b) => b.vendidos - a.vendidos)[0];
    if (!madre) continue;
    grupos.push({ variacion: v, sku: fs[0].sku, madre: madre.item_id, madreUp: fs[0].madre_up, disp: fs[0].disp, pubs: fs });
  }
  return grupos;
}

const plan = (p: Pick<Pub, "tipo" | "tags" | "terms">) => planDe(p.tipo ?? "", p.tags, p.terms);

export type ResultadoAgrupar = { productos: number; altas: number; loteId: number | null; rechazos: string[]; quedan: number };

/** Las altas agrupadas de los planes que quedaron en otro producto (sin ventas): cada plan que todavía no está en
 *  el producto de la madre se crea copiando la madre, al precio de la publicación vieja, en su misma campaña y,
 *  si la vieja tenía gemela de catálogo, también en el catálogo. Un lote que espera el clic de Fer. */
export async function prepararAgrupar(org: string, canal: number, usuarioId: string | null, opts: { max?: number; hasta?: number } = {}): Promise<ResultadoAgrupar> {
  const hasta = opts.hasta ?? Date.now() + 240_000;
  const cuenta = await cuentaDelCanal(org, canal);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("La cuenta de Mercado Libre no está conectada.");
  const nombre = (await una<{ nombre: string }>("select nombre from canal where id = $1", [canal]))?.nombre ?? "la cuenta";
  // Lo que ya espera en la cola (de una vuelta anterior) no se repite.
  const enCola = new Set((await consulta<{ item_id: string }>(
    "select item_id from ml_cola where organizacion_id = $1 and canal_id = $2 and tipo = 'crear' and item_id like 'agrupar:%' and estado in ('preparado', 'pendiente', 'enviando', 'ok')",
    [org, canal])).map((r) => r.item_id));
  const grupos = await gruposSeparados(org, canal);
  const res: ResultadoAgrupar = { productos: 0, altas: 0, loteId: null, rechazos: [], quedan: 0 };
  const altas: CambioMl[] = [];
  const max = opts.max ?? 20;
  for (const g of grupos) {
    const enMadre = new Set(g.pubs.filter((p) => p.up === g.madreUp && !p.catalogo).map(plan));
    const viejas = g.pubs.filter((p) => p.up !== g.madreUp && !p.catalogo && !enMadre.has(plan(p)) && !enCola.has(`agrupar:${g.sku}:${plan(p)}`));
    if (!viejas.length) continue;
    if (res.productos >= max || Date.now() > hasta) { res.quedan++; continue; }
    const m = await una<{ ml: ItemMadre }>("select datos_externos -> 'ml' ml from meli_item where canal_id = $1 and item_id = $2 and variation_id = ''", [canal, g.madre]);
    if (!m?.ml) { res.rechazos.push(`${g.sku}: Laucen no tiene los datos de la madre ${g.madre}`); continue; }
    const desc = await ml<{ plain_text?: string }>(cuenta, "GET", `/items/${g.madre}/description`);
    const texto = desc.status === 200 ? (desc.datos.plain_text ?? "").trim() : "";
    res.productos++;
    const hechos = new Set<PlanPrueba>();
    for (const v of viejas) {
      const pl = plan(v);
      if (!pl || hechos.has(pl)) continue;
      hechos.add(pl);
      const precio = v.precio ?? m.ml.price ?? 0;
      if (!(precio > 0)) { res.rechazos.push(`${g.sku} ${nombrePlan[pl]}: sin precio`); continue; }
      const r = await comprobarAgrupado(cuenta, m.ml, pl, precio, g.disp);
      if (!r.ok) { res.rechazos.push(`${g.sku} ${nombrePlan[pl]}: ${r.motivo}`); continue; }
      const pedidos: PedidoMl[] = [{ metodo: "POST", ruta: "/items", cuerpo: r.cuerpo }];
      if (texto) pedidos.push({ metodo: "POST", ruta: "/items/{id}/description", cuerpo: { plain_text: texto }, seguirSiFalla: true });
      // La gemela de catálogo de la vieja (mismo producto de ML): la nueva también compite ahí.
      const gemela = g.pubs.find((p) => p.up === v.up && p.catalogo && p.catalogo_prod)?.catalogo_prod ?? null;
      if (gemela) pedidos.push({ metodo: "POST", ruta: "/items/catalog_listings", cuerpo: { item_id: "{id}", catalog_product_id: gemela }, seguirSiFalla: true });
      // La campaña en que está la vieja, al mismo precio (así el comprador no paga el tachado).
      const camp = await una<{ promocion_id: string; tipo: string; precio: number }>(`
        select promocion_id, tipo, precio::float8 precio from ml_promo_item
         where canal_id = $1 and item_id = $2 and estado = 'started' and precio > 0 and (hasta is null or hasta > now())
         order by precio limit 1`, [canal, v.item_id]);
      if (camp && camp.precio < precio) {
        pedidos.push({ metodo: "POST", ruta: "/seller-promotions/items/{id}?app_version=v2", seguirSiFalla: true,
          cuerpo: { promotion_id: camp.promocion_id, promotion_type: camp.tipo, deal_price: camp.precio } });
      }
      altas.push({
        canalId: canal, itemId: `agrupar:${g.sku}:${pl}`, tipo: "crear", antes: { estado: `${nombrePlan[pl]} en otro producto (${v.item_id})` },
        payload: {
          descripcion: `Alta en ${nombre}: ${g.sku} ${nombrePlan[pl]} $ ${precio.toLocaleString("es-AR")}${camp && camp.precio < precio ? ` (con campaña $ ${camp.precio.toLocaleString("es-AR")})` : ""}; copia exacta de ${g.madre} para quedar en su mismo producto (reemplaza a ${v.item_id})${gemela ? `, y entra al catálogo ${gemela}` : ""}`,
          origen: { canal, item_id: g.madre }, reemplaza: v.item_id, pedidos,
        },
      });
    }
  }
  if (altas.length) {
    res.loteId = await encolarLoteConBoton(org, canal, altas, `Agrupar planes de cuotas en ${nombre}: ${res.productos} productos (${altas.length} altas)`, usuarioId);
    res.altas = altas.length;
  }
  return res;
}

export type ResultadoCierre = { cerrar: number; loteId: number | null };

/** El cierre de las viejas: cada publicación (y su gemela de catálogo) que está en otro producto que el de la madre,
 *  sin ventas, cuyo plan ya está en el producto de la madre. Un lote que espera el clic de Fer. */
export async function prepararCierreAgrupados(org: string, canal: number, usuarioId: string | null): Promise<ResultadoCierre> {
  const nombre = (await una<{ nombre: string }>("select nombre from canal where id = $1", [canal]))?.nombre ?? "la cuenta";
  const grupos = await gruposSeparados(org, canal);
  const cambios: CambioMl[] = [];
  for (const g of grupos) {
    const enMadre = new Set(g.pubs.filter((p) => p.up === g.madreUp && !p.catalogo).map(plan));
    const ups = new Set(g.pubs.filter((p) => p.up !== g.madreUp && !p.catalogo && enMadre.has(plan(p))).map((p) => p.up));
    for (const p of g.pubs.filter((x) => ups.has(x.up))) {
      cambios.push({
        canalId: canal, itemId: p.item_id, variationId: null, publicacionId: p.id, tipo: "otro", antes: { estado: "en otro producto de ML, sin ventas" },
        payload: {
          descripcion: `Eliminar en ${nombre}: ${g.sku} ${p.catalogo ? "gemela de catálogo" : nombrePlan[plan(p) ?? "premium"]} ${p.item_id} (su plan ya está en el producto de ${g.madre}, que comparte el stock)`,
          pedidos: [
            { metodo: "PUT", ruta: `/items/${p.item_id}`, cuerpo: { status: "closed" }, seguirSiFalla: true },
            { metodo: "PUT", ruta: `/items/${p.item_id}`, cuerpo: { deleted: "true" } },
          ],
        },
        efecto: { publicacion: { id: p.id, estado: "cerrada" } },
      });
    }
  }
  if (!cambios.length) return { cerrar: 0, loteId: null };
  const loteId = await encolarLoteConBoton(org, canal, cambios, `Eliminar en ${nombre} los planes viejos ya agrupados (${cambios.length})`, usuarioId);
  return { cerrar: cambios.length, loteId };
}
