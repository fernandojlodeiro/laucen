// «Crear los planes que faltan» (Fer, 8/10): desde la vista previa de Precios
// en ML, en UNA cuenta, las publicaciones de planes de cuotas que le tocan a
// cada producto según Precios en ML › Planes de cuotas (grupo, desde la
// Clásica con envío gratis) y que esa cuenta todavía no tiene. Cada alta copia
// la publicación común que el producto ya tiene en esa misma cuenta (título,
// fotos, atributos, garantía, descripción; si ahí sólo está en catálogo, la de otra
// cuenta en el «Orden para copiar»), se comprueba con ML
// (/items/validate: no publica nada) y queda en un lote "Preparado, falta tu
// clic": nada sale a ML sin «Mandar a Mercado Libre» (AGENTS.md).

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type CambioMl, type PedidoMl } from "@/lib/mercadolibre/cola";
import { catalogoParaAlta } from "@/lib/mercadolibre/catalogo-marca";
import { armarCuerpoCopia, comprobarAlta, modeloDeLaucen, paqueteDeLaucen, type ItemGuardado } from "@/lib/mercadolibre/copiar";
import { calcularCanal } from "@/lib/precios-ml/datos";
import { filtrarCalculo, type FiltroPrecios } from "@/lib/precios-ml/preparar";
import { DESCUENTO_MINIMO_ML, PLAN_INFO, descuentoVisible } from "@/lib/precios-ml/motor";

export type ResultadoFaltantes = { loteId: number | null; altas: number; rechazos: string[]; sinOrigen: string[]; sinTiempo: number;
  /** Con tope («Crear 40»): cuántas quedaron para la próxima tanda. */
  quedan?: number };

/** La clave en la cola de un alta de plan (la misma que «Publicar en todas las cuentas»: no se duplican). */
const claveAlta = (sku: string, plan: string) => `esquema:${sku}:${plan}`;

export async function prepararPlanesFaltantes(org: string, canalId: number, filtro: FiltroPrecios, usuario: string | null, hasta = Date.now() + 240_000, limite?: number | null): Promise<ResultadoFaltantes> {
  const calculo = await calcularCanal(org, canalId);
  const c = calculo.canal;
  const cuenta = await cuentaDelCanal(org, canalId);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp(`${c.nombre}: la cuenta de Mercado Libre no está conectada.`);
  const propuestas = filtrarCalculo(calculo, filtro).filter((p) => p.propuesta.faltan.length);
  const res: ResultadoFaltantes = { loteId: null, altas: 0, rechazos: [], sinOrigen: [], sinTiempo: 0 };
  if (!propuestas.length) return res;

  // Lo que ya está en la cola (preparado, esperando o recién mandado) no se vuelve a armar.
  const enCola = new Set((await consulta<{ item_id: string }>(`
    select item_id from ml_cola where organizacion_id = $1 and canal_id = $2 and tipo = 'crear' and item_id like 'esquema:%'
       and (estado in ('preparado', 'pendiente', 'enviando') or (estado = 'ok' and enviado_ts > now() - interval '2 hours'))`, [org, canalId])).map((x) => x.item_id));

  const altas: CambioMl[] = [];
  for (const { info, propuesta } of propuestas) {
    const faltan = propuesta.faltan.filter((f) => !enCola.has(claveAlta(info.sku, f.plan)));
    if (!faltan.length) continue;
    // En tandas (Fer, 10/10: «Crear 40»): lo que pasa del tope queda para la próxima.
    if (limite && altas.length >= limite) { res.quedan = (res.quedan ?? 0) + faltan.length; continue; }
    if (Date.now() > hasta) { res.sinTiempo += faltan.length; continue; }
    // La publicación de origen: la común activa (no de catálogo, sin variaciones) de este SKU en esta cuenta, Clásica antes
    // que otra (las pausadas no se usan). Si en esta cuenta sólo está en el catálogo, la de otra cuenta, en el orden de
    // «Orden para copiar» (Configuración › Canales; Fer, 10/10).
    const o = await una<{ item_id: string; canal_id: number; ml: ItemGuardado | null }>(`
      select m.item_id, m.canal_id::int, m.datos_externos -> 'ml' ml from meli_item m join canal c on c.id = m.canal_id
       where m.organizacion_id = $1 and m.sku = $3 and m.estado = 'active' and m.datos_externos -> 'ml' is not null and c.tipo = 'mercadolibre'
         and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) = false
         and coalesce(jsonb_array_length(case when jsonb_typeof(m.datos_externos -> 'ml' -> 'variations') = 'array' then m.datos_externos -> 'ml' -> 'variations' end), 0) = 0
       order by (m.canal_id = $2) desc, coalesce((c.config ->> 'orden_copia')::int, 99), (m.tipo = 'gold_special') desc, m.vendidos desc nulls last, m.item_id limit 1`, [org, canalId, info.sku]);
    if (!o?.ml) { res.sinOrigen.push(info.sku); continue; }
    const cuentaOrigen = o.canal_id === canalId ? cuenta : await cuentaDelCanal(org, o.canal_id);
    const d = cuentaOrigen?.estado === "activa" ? await ml<{ plain_text?: string }>(cuentaOrigen, "GET", `/items/${o.item_id}/description`) : { status: 0, datos: {} as { plain_text?: string } };
    const texto = d.status === 200 ? d.datos.plain_text?.trim() ?? "" : "";
    const modelo = await modeloDeLaucen(org, info.sku);
    const stock = Math.max(1, Number(info.stock ?? 0));
    for (const f of faltan) {
      if (Date.now() > hasta) { res.sinTiempo++; continue; }
      // El catálogo según su marca (catalogo-marca.ts): el de una marca vetada no se publica; una página de otra marca, sin catálogo.
      const cat = f.catalogProductId ? await catalogoParaAlta(cuenta, f.catalogProductId) : null;
      if (cat?.decision === "no_publicar") { res.rechazos.push(`${info.sku} ${PLAN_INFO[f.plan].nombre}: está en el catálogo ${f.catalogProductId} de ${cat.marca}, marca ajena`); continue; }
      const catalogo = cat?.decision === "entra" ? f.catalogProductId : null;
      // Con descuento en el esquema se publica al tachado (uno por modelo) y la campaña la baja a su precio.
      const publicar = propuesta.tachadoPct > 0 && propuesta.tachado != null && descuentoVisible(propuesta.tachado, f.precio) >= DESCUENTO_MINIMO_ML ? propuesta.tachado : f.precio;
      const tag = PLAN_INFO[f.plan].tag;
      const item: ItemGuardado = { ...o.ml, price: publicar, available_quantity: stock, listing_type_id: "gold_pro",
        sale_terms: (o.ml.sale_terms ?? []).filter((t) => t.id !== "INSTALLMENTS_CAMPAIGN") };
      const r = await comprobarAlta(cuenta, (x) => {
        const cuerpo = armarCuerpoCopia(item, info.sku, { variarTitulo: false, rotarFotos: false }, { modelo, ...x });
        return tag ? { ...cuerpo, tags: [tag] } : cuerpo;
      }, { paquetes: [await paqueteDeLaucen(org, info.sku)] });
      if (!r.ok) { res.rechazos.push(`${info.sku} ${PLAN_INFO[f.plan].nombre}: ${r.motivo}`); continue; }
      const pedidos: PedidoMl[] = [{ metodo: "POST", ruta: "/items", cuerpo: r.cuerpo }];
      if (texto) pedidos.push({ metodo: "POST", ruta: "/items/{id}/description", cuerpo: { plain_text: texto }, seguirSiFalla: true });
      if (catalogo) pedidos.push({ metodo: "POST", ruta: "/items/catalog_listings", cuerpo: { item_id: "{id}", catalog_product_id: catalogo }, seguirSiFalla: true });
      const conCampana = publicar !== f.precio ? ` (con campaña $ ${f.precio.toLocaleString("es-AR")})` : "";
      altas.push({
        canalId, itemId: claveAlta(info.sku, f.plan), tipo: "crear", antes: { estado: "no existe en esta cuenta" },
        payload: {
          descripcion: `Alta en ${c.nombre}: ${info.sku} ${PLAN_INFO[f.plan].nombre} $ ${publicar.toLocaleString("es-AR")}${conCampana}; copia de ${o.item_id}${catalogo ? `, y entra al catálogo ${catalogo}` : ""}`,
          origen: { canal: o.canal_id, item_id: o.item_id }, pedidos,
        },
      });
    }
  }
  if (altas.length) {
    res.loteId = await encolarLoteConBoton(org, canalId, altas, `Planes de cuotas que faltan en ${c.nombre} (${altas.length})`, usuario);
    res.altas = altas.length;
  }
  return res;
}

export function textoFaltantes(r: ResultadoFaltantes, cuenta: string): string {
  const partes: string[] = [];
  if (r.loteId) partes.push(`Quedó el lote ${r.loteId} con ${r.altas} publicaci${r.altas === 1 ? "ón" : "ones"} nueva${r.altas === 1 ? "" : "s"} en ${cuenta}, esperando tu clic en Configuración › Cola de Mercado Libre, pestaña «Lotes preparados».`);
  else if (!r.rechazos.length && !r.sinOrigen.length && !r.sinTiempo) partes.push(`No falta ninguna publicación de planes en ${cuenta} (o ya están en la cola).`);
  if (r.sinOrigen.length) partes.push(`Sin publicación común en esta cuenta para copiar (${r.sinOrigen.length}): ${r.sinOrigen.slice(0, 10).join(", ")}${r.sinOrigen.length > 10 ? "…" : ""}.`);
  if (r.rechazos.length) partes.push(`ML no las acepta (${r.rechazos.length}): ${r.rechazos.slice(0, 5).join("; ")}${r.rechazos.length > 5 ? "…" : ""}.`);
  if (r.quedan) partes.push(`Quedan ${r.quedan} para la próxima tanda.`);
  if (r.sinTiempo) partes.push(`Faltaron ${r.sinTiempo} por tiempo: apretá el botón de nuevo y se arman las que faltan (las ya armadas no se repiten).`);
  return partes.join(" ");
}
