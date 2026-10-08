// «Publicar en todas las cuentas» (Fer, 8/10): desde la ficha del producto,
// todas las publicaciones que le tocan en las cuentas de Mercado Libre de una
// vez: en cada cuenta la Clásica y cada plan de cuotas que corresponda por su
// precio. Pestaña "Todas las cuentas" de /catalogo/productos/[id]/publicar-ml.
//
//   · Qué planes: los que Precios en ML tiene activos en esa cuenta y cuya
//     Clásica llega a su «Desde una Clásica de» (por montos: un producto barato
//     sale sólo con la Clásica, o con la Clásica y el plan que le llegue).
//   · Quién gana (ajuste_pct del producto): .BAIRES gana la Clásica y la de 12
//     cuotas; la de 3 cuotas (el comprador la ve «6 cuotas») se reparte sola a
//     la cuenta que menos ganó hasta ahora. Las demás van 3 % más caras. Si el
//     producto ya tiene ganador elegido para un plan, se respeta.
//   · Copia la publicación común que ya tenga en alguna cuenta (título, fotos,
//     atributos, garantía, descripción): hace falta una primera publicación.
//   · Con producto de catálogo conocido, cada alta pide también entrar al
//     catálogo (POST /items/catalog_listings; si ML no la deja, el alta queda igual).
//   · Nada sale sin el clic de Fer: un lote preparado por cuenta.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type CambioMl, type PedidoMl } from "@/lib/mercadolibre/cola";
import { armarCuerpoCopia, comprobarAlta, modeloDeLaucen, type ItemGuardado } from "@/lib/mercadolibre/copiar";
import { planDe } from "@/lib/mercadolibre/prueba-planes";
import { canalesMl, comisionesMl, familiasDe, reglasCanal, type CanalMl } from "@/lib/precios-ml/datos";
import {
  cadenaFamilias, comisionesDe, descuentoVisible, proponer, DESCUENTO_MINIMO_ML, PLAN_INFO, PLANES,
  type Plan, type PlanOClasica, type ReglasCanal,
} from "@/lib/precios-ml/motor";

/** Cuánto más cara va la cuenta que no gana un precio (Fer, 7/10). */
export const AJUSTE_NO_GANA = 3;
/** La cuenta que gana la Clásica y la de 12 cuotas (Fer, 7/10). */
const esPrincipal = (c: { nombre: string }) => /BAIRES/i.test(c.nombre);
/** Los planes que reparte este botón; los demás heredan lo que diga Precios en ML. */
const PLAN_REPARTIDO: Plan = "3x_campaign";
const PLAN_PRINCIPAL: Plan = "12x_campaign";

export type FilaTodas = {
  canal: number; cuenta: string; plan: PlanOClasica; nombre: string;
  /** Lo que paga el comprador (con campaña, si hay tachado) y el precio con que se publica. */
  venta: number | null; publicar: number | null;
  gana: boolean; existe: string | null; crear: boolean; motivo: string | null;
};
export type Origen = { itemId: string; canal: number; cuenta: string; titulo: string; permalink: string | null; categoria: string | null; tipo: string };
export type PlanTodas = {
  variacion: { id: number; sku: string; titulo: string; codigoBarras: string | null };
  variaciones: { id: number; sku: string }[];
  origen: Origen | null;
  catalogo: string | null;
  tachadoPct: number;
  ganador: Record<"clasica" | Plan, number | null>;
  /** Cuántos productos gana ya cada cuenta en la de 3 cuotas (para el reparto). */
  ganadas3x: Record<number, number>;
  filas: FilaTodas[];
  avisos: string[];
};

const nombrePlan = (p: PlanOClasica) => (p === "clasica" ? "Clásica" : PLAN_INFO[p].nombre);

/** Las reglas del canal con el «¿gana?» de este producto ya puesto (para la vista previa, antes de grabarlo). */
function conAjustes(r: ReglasCanal, productoId: number, ajustes: Partial<Record<PlanOClasica, number>>): ReglasCanal {
  const tachado = r.tachado.map((f) => ({ ...f }));
  const planes = r.planes.map((f) => ({ ...f }));
  if (ajustes.clasica !== undefined) {
    const f = tachado.find((x) => x.nivel === "producto" && x.producto_id === productoId);
    if (f) f.ajuste_pct = ajustes.clasica;
    else tachado.push({ nivel: "producto", familia_id: null, producto_id: productoId, tachado_pct: null, ajuste_pct: ajustes.clasica });
  }
  for (const p of PLANES) {
    if (ajustes[p] === undefined) continue;
    const f = planes.find((x) => x.plan === p && x.nivel === "producto" && x.producto_id === productoId);
    if (f) f.ajuste_pct = ajustes[p];
    else planes.push({ plan: p, nivel: "producto", familia_id: null, producto_id: productoId, activo: null, precio_minimo: null, margen_pct: null, cuotas_visibles: null, ajuste_pct: ajustes[p] });
  }
  return { ...r, tachado, planes };
}

/** Lo que se va a hacer: por cuenta y plan, el precio, quién gana y si ya existe. */
export async function planTodas(org: string, productoId: number, variacionId?: number | null): Promise<PlanTodas> {
  const variaciones = await consulta<{ id: number; sku: string; titulo: string; codigo_barras: string | null; familia_id: number | null }>(`
    select v.id::int, v.sku, titulo_variacion(v.id) titulo, v.codigo_barras, p.familia_id::int
      from variacion v join producto p on p.id = v.producto_id
     where v.organizacion_id = $1 and v.producto_id = $2 and coalesce(v.estado, 'activa') <> 'archivada'
     order by v.es_default desc nulls last, v.orden nulls last, v.id`, [org, productoId]);
  if (!variaciones.length) throw new ErrorErp("El producto no tiene variaciones.");
  const v = variaciones.find((x) => x.id === variacionId) ?? variaciones[0];
  const avisos: string[] = [];

  // La publicación de origen: la común (no de catálogo) de este SKU, activa antes que pausada, Clásica antes que otra, la más vendida.
  const o = await una<Origen & { variaciones: number }>(`
    select m.item_id "itemId", m.canal_id::int canal, c.nombre cuenta, m.titulo, m.permalink, m.categoria, m.tipo,
           coalesce(jsonb_array_length(case when jsonb_typeof(m.datos_externos -> 'ml' -> 'variations') = 'array' then m.datos_externos -> 'ml' -> 'variations' end), 0) variaciones
      from meli_item m join canal c on c.id = m.canal_id
     where m.organizacion_id = $1 and m.sku = $2 and m.estado in ('active', 'paused') and m.datos_externos -> 'ml' is not null
       and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) = false
     order by (m.estado = 'active') desc, (m.tipo = 'gold_special') desc, m.vendidos desc nulls last, m.item_id
     limit 1`, [org, v.sku]);
  if (o && o.variaciones > 0) avisos.push(`La publicación de origen (${o.itemId}) tiene variaciones en ML: este botón copia publicaciones de un solo producto. Publicalo con «Tus publicaciones».`);
  const origen = o && o.variaciones === 0 ? { itemId: o.itemId, canal: o.canal, cuenta: o.cuenta, titulo: o.titulo, permalink: o.permalink, categoria: o.categoria, tipo: o.tipo } : null;

  // El producto de catálogo: el de alguna publicación nuestra del SKU, o el encontrado por código de barras.
  const catalogo = (await una<{ p: string | null }>(`
    select coalesce(
      (select x.datos_externos -> 'ml' ->> 'catalog_product_id' from meli_item x
        where x.organizacion_id = $1 and x.sku = $2 and x.datos_externos -> 'ml' ->> 'catalog_product_id' is not null
        group by 1 order by count(*) desc limit 1),
      (select producto from ml_catalogo_sku where organizacion_id = $1 and sku = $2)) p`, [org, v.sku]))?.p ?? null;

  const canales = (await canalesMl(org)).sort((a, b) => Number(esPrincipal(b)) - Number(esPrincipal(a)) || a.nombre.localeCompare(b.nombre));
  if (!canales.length) throw new ErrorErp("No hay cuentas de Mercado Libre en Laucen.");

  // Quién gana: lo que ya tenga elegido el producto se respeta; si no, la regla de Fer.
  const elegidos = await consulta<{ canal: number; plan: string }>(`
    select canal_id::int canal, 'clasica' plan from ml_regla_precio where organizacion_id = $1 and nivel = 'producto' and producto_id = $2 and ajuste_pct = 0
    union all
    select canal_id::int, plan from ml_plan_config where organizacion_id = $1 and nivel = 'producto' and producto_id = $2 and ajuste_pct = 0`, [org, productoId]);
  const ganadas = await consulta<{ canal: number; n: number }>(`
    select canal_id::int canal, count(*)::int n from ml_plan_config
     where organizacion_id = $1 and nivel = 'producto' and plan = $2 and ajuste_pct = 0 and producto_id <> $3 group by 1`, [org, PLAN_REPARTIDO, productoId]);
  const ganadas3x: Record<number, number> = Object.fromEntries(canales.map((c) => [c.id, ganadas.find((g) => g.canal === c.id)?.n ?? 0]));
  const principal = canales.find(esPrincipal) ?? canales[0];
  const elegido = (p: string) => elegidos.find((e) => e.plan === p && canales.some((c) => c.id === e.canal))?.canal ?? null;
  const otras = canales.filter((c) => c.id !== principal.id);
  const repartida = [...(otras.length ? otras : canales)].sort((a, b) => ganadas3x[a.id] - ganadas3x[b.id] || a.id - b.id)[0];
  const ganador = Object.fromEntries(["clasica", ...PLANES].map((p) => [p, elegido(p)])) as Record<"clasica" | Plan, number | null>;
  ganador.clasica ??= principal.id;
  ganador[PLAN_PRINCIPAL] ??= principal.id;
  ganador[PLAN_REPARTIDO] ??= repartida.id;

  // Lo que ya existe (activo, o en la cola esperando salir) en cada cuenta.
  const items = await consulta<{ canal: number; item_id: string; tipo: string; tags: unknown; terms: unknown }>(`
    select canal_id::int canal, item_id, tipo, datos_externos -> 'ml' -> 'tags' tags, datos_externos -> 'ml' -> 'sale_terms' terms
      from meli_item where organizacion_id = $1 and sku = $2 and estado = 'active'
       and coalesce((datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) = false`, [org, v.sku]);
  const enCola = await consulta<{ canal: number; item_id: string }>(`
    select canal_id::int canal, item_id from ml_cola where organizacion_id = $1 and tipo = 'crear' and item_id like $2
       and (estado in ('preparado', 'pendiente', 'enviando') or (estado = 'ok' and enviado_ts > now() - interval '2 hours'))`, [org, `esquema:${v.sku}:%`]);

  const [com, familias] = await Promise.all([comisionesMl(), familiasDe(org)]);
  const cadena = cadenaFamilias(v.familia_id, familias.padres);
  const cat = origen?.categoria ?? cadena.map((x) => familias.categoria.get(x)).find(Boolean) ?? null;
  const comisiones = comisionesDe(cat ? com.porCategoria.get(cat) : null, com.general).valores;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  const filas: FilaTodas[] = [];
  let tachadoPct = 0;
  for (const c of canales) {
    const ajustes = Object.fromEntries((["clasica", PLAN_PRINCIPAL, PLAN_REPARTIDO] as const).map((p) => [p, ganador[p] === c.id ? 0 : AJUSTE_NO_GANA]));
    const reglas = conAjustes(await reglasCanal(org, c), productoId, ajustes);
    const lista = c.listaId ? (await una<{ l: number | null }>("select lista_ars::float8 l from precio_de($1, $2, $3, $4::date)", [org, v.id, c.listaId, hoy]))?.l ?? null : null;
    const pr = proponer({ variacionId: v.id, productoId, lugar: { productoId, familias: cadena }, clasica: lista, stock: null, comisiones, comisionEstimada: false, pubs: [] }, reglas);
    tachadoPct = Math.max(tachadoPct, pr.tachadoPct);
    const ya = (p: PlanOClasica) => items.find((i) => i.canal === c.id && planDe(i.tipo, i.tags, i.terms) === p)?.item_id
      ?? (enCola.some((x) => x.canal === c.id && x.item_id === `esquema:${v.sku}:${p}`) ? "en la cola" : null);
    const conTachado = (venta: number | null) => (venta != null && pr.tachadoPct > 0 && pr.tachado != null && descuentoVisible(pr.tachado, venta) >= DESCUENTO_MINIMO_ML ? pr.tachado : venta);
    const fila = (plan: PlanOClasica, venta: number | null, motivo: string | null): FilaTodas => {
      const existe = ya(plan);
      return { canal: c.id, cuenta: c.nombre, plan, nombre: nombrePlan(plan), venta, publicar: conTachado(venta), gana: ganador[plan as "clasica" | Plan] === c.id || (ganador[plan as "clasica" | Plan] == null),
        existe, crear: !existe && !motivo && venta != null, motivo: motivo ?? (venta == null ? "sin precio en la lista de la cuenta" : null) };
    };
    filas.push(fila("clasica", pr.clasica, c.listaId ? null : "la cuenta no tiene lista de precios"));
    for (const p of pr.planes) {
      if (!p.activo) continue;
      filas.push(fila(p.plan, p.precio, p.habilitado ? null : `la Clásica no llega al mínimo del plan (${(p.precioMinimo ?? 0).toLocaleString("es-AR")})`));
    }
    if (!pr.planes.some((p) => p.activo)) avisos.push(`${c.nombre}: no tiene ningún plan de cuotas activo en Precios en ML: sólo la Clásica.`);
  }
  if (!origen) avisos.push("Este producto no tiene todavía ninguna publicación común en Mercado Libre para copiar: publicalo primero en una cuenta («Nueva desde Laucen» o «Catálogo de Mercado Libre») y volvé.");
  return {
    variacion: { id: v.id, sku: v.sku, titulo: v.titulo, codigoBarras: v.codigo_barras },
    variaciones: variaciones.map((x) => ({ id: x.id, sku: x.sku })),
    origen, catalogo, tachadoPct, ganador, ganadas3x, filas, avisos: [...new Set(avisos)],
  };
}

/** Graba en Precios en ML quién gana cada precio de este producto en cada cuenta (sólo el ajuste; lo demás queda como estaba). */
async function grabarGanadores(org: string, productoId: number, canales: CanalMl[], ganador: PlanTodas["ganador"]) {
  for (const c of canales) {
    const aj = (p: "clasica" | Plan) => (ganador[p] === c.id ? 0 : AJUSTE_NO_GANA);
    await consulta(`
      insert into ml_regla_precio (organizacion_id, canal_id, nivel, producto_id, tachado_pct, ajuste_pct) values ($1, $2, 'producto', $3, null, $4)
      on conflict (canal_id, nivel, coalesce(familia_id, 0), coalesce(producto_id, 0)) do update set ajuste_pct = excluded.ajuste_pct, actualizado_ts = now()`,
      [org, c.id, productoId, aj("clasica")]);
    for (const p of [PLAN_PRINCIPAL, PLAN_REPARTIDO]) {
      await consulta(`
        insert into ml_plan_config (organizacion_id, canal_id, plan, nivel, producto_id, ajuste_pct) values ($1, $2, $3, 'producto', $4, $5)
        on conflict (canal_id, plan, nivel, coalesce(familia_id, 0), coalesce(producto_id, 0)) do update set ajuste_pct = excluded.ajuste_pct, actualizado_ts = now()`,
        [org, c.id, p, productoId, aj(p)]);
    }
  }
}

export type ResultadoTodas = { lotes: { cuenta: string; loteId: number; altas: number }[]; rechazos: string[]; avisos: string[]; sinTiempo: number };

/** «Preparar»: graba quién gana y deja un lote por cuenta con las altas que faltan (comprobadas con ML). */
export async function prepararTodas(org: string, productoId: number, variacionId: number | null, usuarioId: string, hasta = Date.now() + 240_000): Promise<ResultadoTodas> {
  const plan = await planTodas(org, productoId, variacionId);
  if (!plan.origen) throw new ErrorErp("No hay ninguna publicación común de este producto para copiar: publicalo primero en una cuenta.");
  const canales = await canalesMl(org);
  await grabarGanadores(org, productoId, canales, plan.ganador);
  const res: ResultadoTodas = { lotes: [], rechazos: [], avisos: [], sinTiempo: 0 };
  const crear = plan.filas.filter((f) => f.crear);
  if (!crear.length) throw new ErrorErp("No falta ninguna publicación: ya están todas (o en la cola).");

  const o = plan.origen;
  const g = await una<{ ml: ItemGuardado | null }>("select datos_externos -> 'ml' ml from meli_item where organizacion_id = $1 and item_id = $2 limit 1", [org, o.itemId]);
  if (!g?.ml) throw new ErrorErp(`Laucen no tiene los datos de ${o.itemId}: traé las publicaciones de nuevo.`);
  const cOrigen = await cuentaDelCanal(org, o.canal);
  const d = cOrigen?.estado === "activa" ? await ml<{ plain_text?: string }>(cOrigen, "GET", `/items/${o.itemId}/description`) : null;
  const texto = d?.status === 200 ? d.datos.plain_text?.trim() ?? "" : "";
  const sku = plan.variacion.sku;
  const modelo = await modeloDeLaucen(org, sku);
  // El código de barras: el de la publicación de origen o, si no tiene, el de Laucen.
  const atributos = [...(g.ml.attributes ?? [])];
  const gtin = plan.variacion.codigoBarras?.replace(/[^0-9]/g, "") || null;
  if (gtin && !atributos.some((a) => a.id === "GTIN")) atributos.push({ id: "GTIN", value_name: gtin });

  for (const c of canales) {
    const deEsta = crear.filter((f) => f.canal === c.id);
    if (!deEsta.length) continue;
    if (Date.now() > hasta) { res.sinTiempo += deEsta.length; continue; }
    const cuenta = await cuentaDelCanal(org, c.id);
    if (!cuenta || cuenta.estado !== "activa") { res.rechazos.push(`${c.nombre}: la cuenta de Mercado Libre no está conectada`); continue; }
    const stock = Math.max(1, Number((await una<{ d: number }>("select stock_disponible_canal($1, $2, $3)::int d", [org, plan.variacion.id, c.id]))?.d ?? 0));
    const altas: CambioMl[] = [];
    for (const f of deEsta) {
      if (Date.now() > hasta) { res.sinTiempo++; continue; }
      const tag = f.plan === "clasica" ? null : PLAN_INFO[f.plan].tag;
      const item: ItemGuardado = { ...g.ml, attributes: atributos, price: f.publicar!, available_quantity: stock,
        listing_type_id: f.plan === "clasica" ? "gold_special" : "gold_pro", sale_terms: (g.ml.sale_terms ?? []).filter((t) => t.id !== "INSTALLMENTS_CAMPAIGN") };
      const r = await comprobarAlta(cuenta, (x) => {
        const cuerpo = armarCuerpoCopia(item, sku, { variarTitulo: false, rotarFotos: false }, { modelo, ...x });
        return tag ? { ...cuerpo, tags: [tag] } : cuerpo;
      });
      if (!r.ok) { res.rechazos.push(`${c.nombre} ${f.nombre}: ${r.motivo}`); continue; }
      if (r.avisos) res.avisos.push(`${c.nombre} ${f.nombre}: ${r.avisos}`);
      const pedidos: PedidoMl[] = [{ metodo: "POST", ruta: "/items", cuerpo: r.cuerpo }];
      if (texto) pedidos.push({ metodo: "POST", ruta: "/items/{id}/description", cuerpo: { plain_text: texto }, seguirSiFalla: true });
      // Que compita también en el catálogo (si ML no la deja, el alta queda igual).
      if (plan.catalogo) pedidos.push({ metodo: "POST", ruta: "/items/catalog_listings", cuerpo: { item_id: "{id}", catalog_product_id: plan.catalogo }, seguirSiFalla: true });
      const precio = f.publicar !== f.venta && f.venta != null ? ` (con campaña $ ${f.venta.toLocaleString("es-AR")})` : "";
      altas.push({
        canalId: c.id, itemId: `esquema:${sku}:${f.plan}`, tipo: "crear", antes: { estado: "no existe en esta cuenta" },
        payload: {
          descripcion: `Alta en ${c.nombre}: ${sku} ${f.nombre} $ ${f.publicar!.toLocaleString("es-AR")}${precio}${f.gana ? "" : ` (no gana: +${AJUSTE_NO_GANA} %)`}; copia de ${o.itemId}${plan.catalogo ? `, y entra al catálogo ${plan.catalogo}` : ""}`,
          origen: { canal: o.canal, item_id: o.itemId }, pedidos,
        },
      });
    }
    if (!altas.length) continue;
    const loteId = await encolarLoteConBoton(org, c.id, altas, `Publicar ${sku} en ${c.nombre} (${altas.length})`, usuarioId);
    res.lotes.push({ cuenta: c.nombre, loteId, altas: altas.length });
  }
  if (!res.lotes.length && !res.rechazos.length && !res.sinTiempo) throw new ErrorErp("No hay nada para crear.");
  return res;
}

export function textoResultadoTodas(r: ResultadoTodas): string {
  const partes: string[] = [];
  if (r.lotes.length) partes.push(`Quedaron ${r.lotes.length} lote${r.lotes.length === 1 ? "" : "s"} esperando tu clic en Configuración › Cola de Mercado Libre, pestaña «Lotes preparados» (${r.lotes.map((l) => `lote ${l.loteId}: ${l.cuenta}, ${l.altas}`).join("; ")}).`);
  if (r.rechazos.length) partes.push(`No se preparó: ${r.rechazos.join("; ")}.`);
  if (r.avisos.length) partes.push(`Avisos de ML: ${r.avisos.join(" · ")}`);
  if (r.sinTiempo) partes.push(`No llegué a preparar ${r.sinTiempo} (se acabó el tiempo): apretá el botón de nuevo y se preparan las que faltan.`);
  return partes.join(" ");
}
