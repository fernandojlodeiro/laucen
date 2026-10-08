// Precios en Mercado Libre: de la propuesta (motor.ts) a la cola de ML
// (lib/mercadolibre/cola.ts). AGENTS.md → "Cambios en Mercado Libre: siempre
// por un clic de Fer":
//   · "Preparar cambios" arma LOTES preparados (encolarLoteConBoton): nada sale
//     hasta que Fer aprieta "Mandar a Mercado Libre" en la cola.
//   · Lo automático (sincronizarPreciosMl con origen 'automatico') corre sólo
//     en los canales con el interruptor "Sincronizar precios" prendido, y
//     nunca crea publicaciones (eso siempre va por lote).

import { coincideBusqueda } from "@/lib/busqueda";
import { consulta, una } from "@/lib/erp/base";
import { encolar, encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { calcularCanal, canalesMl, type Calculo } from "@/lib/precios-ml/datos";
import { asegurarCampanaPropia } from "@/lib/precios-ml/campana-propia";
import { CON_PRECIO, PLAN_INFO, pedidoCrear, pedidosPrecio, pedidoVolumen, queCambia, cadenaFamilias, type PropuestaPub } from "@/lib/precios-ml/motor";

export type FiltroPrecios = { familia?: number | null; q?: string | null; comienza?: boolean };

/** ¿La variación entra en el filtro de la pantalla? (categoría con sus
 *  subcategorías, y búsqueda por SKU, título, publicación o número interno). */
export function filtrarCalculo(c: Calculo, f: FiltroPrecios): Calculo["propuestas"] {
  const q = f.q?.trim() ?? "";
  return c.propuestas.filter(({ info, propuesta }) => {
    if (f.familia && !cadenaFamilias(info.familiaId, c.familias.padres).includes(f.familia)) return false;
    // La regla de búsqueda de todo el panel (lib/busqueda.ts).
    return coincideBusqueda([String(info.variacionId), String(info.productoId), info.sku, info.titulo, ...propuesta.pubs.map((p) => p.pub.itemId)], q, f.comienza !== false);
  });
}

/** Los cambios de la cola que salen de las propuestas, por tipo. */
export function cambiosDe(canalId: number, propuestas: Calculo["propuestas"]) {
  const precios: CambioMl[] = [], volumen: CambioMl[] = [], crear: CambioMl[] = [];
  const base = (pa: PropuestaPub) => ({ canalId, itemId: pa.pub.itemId, variationId: pa.pub.variationId, publicacionId: pa.pub.publicacionId });
  for (const { info, propuesta } of propuestas) {
    for (const pa of propuesta.pubs) {
      const pedidos = pedidosPrecio(pa);
      if (pedidos.length) {
        precios.push({
          ...base(pa), tipo: pa.cambiaPrecio ? "precio" : "campana",
          payload: {
            ...(pa.cambiaPrecio ? { precio: pa.lista } : {}), venta: pa.venta, rol: pa.rol, plan: pa.pub.plan,
            descripcion: queCambia({ ...pa, cambiaVolumen: false }), pedidos,
          },
          antes: { precio: pa.pub.precioListaMl },
        });
      }
      if (pa.cambiaVolumen && pa.volumen.length) {
        volumen.push({
          ...base(pa), tipo: "descuento",
          payload: {
            escalones: pa.volumen.map((x) => ({ cantidad: x.cantidad, precio: x.precio })),
            descripcion: `Descuento por volumen: ${pa.volumen.map((x) => `${x.cantidad}+ u. $ ${x.precio.toLocaleString("es-AR")} (−${x.pct.toLocaleString("es-AR")} %)`).join(", ")}`,
            pedidos: [pedidoVolumen(pa)],
          },
          antes: pa.pub.volumenMl ? { escalones: pa.pub.volumenMl } : null,
        });
      }
    }
    for (const f of propuesta.faltan) {
      const pedido = pedidoCrear(f);
      if (!pedido) continue;
      crear.push({
        canalId, itemId: "", variationId: null, publicacionId: null, tipo: "crear",
        payload: {
          plan: f.plan, precio: f.precio, variacion_id: info.variacionId, sku: info.sku,
          descripcion: `Publicación nueva ${PLAN_INFO[f.plan].nombre} de ${info.sku} a $ ${f.precio.toLocaleString("es-AR")}`,
          pedidos: [pedido],
        },
      });
    }
  }
  return { precios, volumen, crear };
}

/** Graba el plan destacado elegido de cada variación (lo verifica la lectura periódica). */
async function grabarDestacados(org: string, canalId: number, propuestas: Calculo["propuestas"]) {
  const filas = propuestas.filter((p) => p.propuesta.destacado).map((p) => ({
    variacion_id: p.info.variacionId, plan: p.propuesta.destacado!.plan, item_id: p.propuesta.destacado!.itemId, precio: p.propuesta.destacado!.precio,
  }));
  if (!filas.length) return;
  await consulta(`
    insert into ml_plan_destacado (organizacion_id, canal_id, variacion_id, plan, item_id, precio)
    select $1, $2, x.variacion_id, x.plan, x.item_id, x.precio from jsonb_to_recordset($3::jsonb) x(variacion_id bigint, plan text, item_id text, precio numeric)
    on conflict (canal_id, variacion_id) do update set plan = excluded.plan, item_id = excluded.item_id, precio = excluded.precio, elegido_ts = now(),
      gana = case when ml_plan_destacado.item_id = excluded.item_id then ml_plan_destacado.gana end,
      alerta = case when ml_plan_destacado.item_id = excluded.item_id then ml_plan_destacado.alerta end`,
    [org, canalId, JSON.stringify(filas)]);
}

export type LotePreparado = { id: number; descripcion: string; cambios: number };

/** "Preparar cambios": arma los lotes (precios y campañas, volumen,
 *  publicaciones nuevas) del canal con el filtro de la pantalla. Nada sale a
 *  ML hasta el clic en "Mandar a Mercado Libre". */
export async function prepararCambios(org: string, canalId: number, filtro: FiltroPrecios, usuario: string | null,
  que: { precios?: boolean; volumen?: boolean; crear?: boolean } = { precios: true, volumen: true, crear: true }): Promise<LotePreparado[]> {
  const calculo = await calcularCanal(org, canalId);
  const propuestas = filtrarCalculo(calculo, filtro);
  const { precios, volumen, crear } = cambiosDe(canalId, propuestas);
  const nombre = calculo.canal.nombre;
  const alcance = filtro.familia ? ` (${calculo.familias.nombre.get(filtro.familia) ?? "categoría"})` : filtro.q ? ` («${filtro.q}»)` : "";
  const lotes: LotePreparado[] = [];
  const armar = async (cambios: CambioMl[], titulo: string) => {
    if (!cambios.length) return;
    const descripcion = `${titulo} · ${nombre}${alcance} · ${cambios.length} publicaci${cambios.length === 1 ? "ón" : "ones"}`;
    lotes.push({ id: await encolarLoteConBoton(org, canalId, cambios, descripcion, usuario), descripcion, cambios: cambios.length });
  };
  if (que.precios !== false) await armar(precios, "Precios y campañas");
  if (que.volumen !== false) await armar(volumen, "Descuento por volumen");
  if (que.crear !== false) await armar(crear, "Publicaciones nuevas de planes de cuotas");
  await grabarDestacados(org, canalId, propuestas);
  return lotes;
}

export type ResultadoAuto = { canales: number; revisadas: number; encoladas: number };

/** El modo automático: recalcula y ENCOLA (origen 'automatico') sólo en los
 *  canales con "Sincronizar precios" prendido. Sin publicaciones nuevas. */
export async function sincronizarPreciosMl(org: string, opts: { canal?: number; variaciones?: number[] | null } = {}): Promise<ResultadoAuto> {
  const res: ResultadoAuto = { canales: 0, revisadas: 0, encoladas: 0 };
  const canales = (await canalesMl(org)).filter((c) => c.sincronizarPrecios && (!opts.canal || c.id === opts.canal));
  for (const c of canales) {
    const cuenta = await una("select 1 from meli_cuenta where organizacion_id = $1 and canal_id = $2 and estado = 'activa'", [org, c.id]);
    if (!cuenta) continue;
    res.canales++;
    // La campaña propia (Fer, 8/10): si la cuenta ya tiene una, se renueva sola unos días antes de vencer.
    const conPropia = await una("select 1 from canal where id = $1 and config ? 'campana_propia'", [c.id]);
    if (conPropia) await asegurarCampanaPropia(org, c.id).catch((e) => console.error("[precios ml] campaña propia", c.nombre, e));
    const calculo = await calcularCanal(org, c.id, { variaciones: opts.variaciones });
    res.revisadas += calculo.propuestas.length;
    const { precios, volumen } = cambiosDe(c.id, calculo.propuestas);
    if (precios.length || volumen.length) {
      const r = await encolar(org, [...precios, ...volumen], { origen: "automatico" });
      res.encoladas += r.encoladas + r.reemplazadas;
    }
    await grabarDestacados(org, c.id, calculo.propuestas);
  }
  return res;
}

/** ¿Algún canal de la organización sincroniza precios solo? */
export async function haySincronizacionPrecios(org?: string): Promise<string[]> {
  const r = await consulta<{ organizacion_id: string }>(`
    select distinct organizacion_id from canal where tipo = 'mercadolibre' and estado = 'activo'
       and coalesce((config ->> 'sincronizar_precios')::boolean, false) and ($1::text is null or organizacion_id = $1)`, [org ?? null]);
  return r.map((x) => x.organizacion_id);
}

/** Lo automático de cada vuelta del barrido: los precios que cambiaron
 *  (eventos precio_cambiado, que nadie más consume) y una pasada entera por
 *  noche (los productos en dólares cambian con el tipo de cambio, el stock
 *  cambia los escalones de volumen). Sólo organizaciones con el interruptor. */
export async function vueltaAutomatica(ahora = new Date()): Promise<Record<string, ResultadoAuto>> {
  const informe: Record<string, ResultadoAuto> = {};
  for (const org of await haySincronizacionPrecios()) {
    const ev = await consulta<{ variacion_id: number }>(`
      with ev as (
        update evento set procesado_ts = now(), procesado_por = 'precios_ml'
         where organizacion_id = $1 and tipo = 'precio_cambiado' and procesado_ts is null
        returning (payload ->> 'variacion_id')::int variacion_id)
      select distinct variacion_id from ev where variacion_id is not null`, [org]);
    const hora = Number(ahora.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", hourCycle: "h23" }));
    const hoy = ahora.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    let noche = false;
    if (hora >= 2 && hora <= 4) {
      const r = await consulta(`
        update canal set config = config || jsonb_build_object('precios_ultima_pasada', $2::text)
         where organizacion_id = $1 and tipo = 'mercadolibre' and coalesce((config ->> 'sincronizar_precios')::boolean, false)
           and coalesce(config ->> 'precios_ultima_pasada', '') <> $2 returning id`, [org, hoy]);
      noche = r.length > 0;
    }
    // Las publicaciones a las que ML les ofreció una campaña con precio desde la vuelta anterior
    // (una publicación nueva, o una campaña nueva): se recalculan para que entren sin esperar a la noche.
    let ofrecidas: { variacion_id: number }[] = [];
    if (!noche) {
      const marcas = await consulta<{ id: number; previa: string | null }>(`
        select id::int, config ->> 'precios_campanas_ts' previa from canal
         where organizacion_id = $1 and tipo = 'mercadolibre' and coalesce((config ->> 'sincronizar_precios')::boolean, false)`, [org]);
      const ahoraTs = new Date().toISOString();
      ofrecidas = await consulta<{ variacion_id: number }>(`
        select distinct pu.variacion_id::int variacion_id
          from jsonb_to_recordset($2::jsonb) x(id bigint, previa timestamptz)
          join ml_promo_item p on p.canal_id = x.id
          join meli_item m on m.canal_id = p.canal_id and m.item_id = p.item_id and m.estado = 'active'
          join publicacion pu on pu.id = m.publicacion_id
         where p.organizacion_id = $1 and p.estado = 'candidate' and p.tipo = any($3::text[])
           and p.creado_ts > coalesce(x.previa, now() - interval '2 hours')`, [org, JSON.stringify(marcas), CON_PRECIO]);
      await consulta(`update canal set config = config || jsonb_build_object('precios_campanas_ts', $2::text) where id = any($1::bigint[])`,
        [marcas.map((m) => m.id), ahoraTs]);
    }
    const variaciones = [...new Set([...ev.map((e) => e.variacion_id), ...ofrecidas.map((x) => x.variacion_id)])];
    if (noche) informe[org] = await sincronizarPreciosMl(org);
    else if (variaciones.length) informe[org] = await sincronizarPreciosMl(org, { variaciones });
  }
  return informe;
}
