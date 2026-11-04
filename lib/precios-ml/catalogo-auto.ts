// Catálogos que armó Mercado Libre solo (Fer, 4/11): ML mete publicaciones nuestras en catálogos («ahora competís
// para ser la primera opción de compra») creando publicaciones de catálogo que no salieron de la cola de Laucen.
//   1. Se anotan en ml_catalogo_auto (db/precios_ml.sql) las publicaciones de catálogo de los últimos 15 días que
//      la cola no creó.
//   2. Se controla el catálogo: la marca (catalogo-marca.ts: una página armada por ML con la marca de otro vendedor,
//      o una marca vetada, no sirve) y si es el mismo producto que el nuestro (la IA, juez-similar.ts).
//   3. Con el precio para ganar que ya se lee cada 6 h (lectura.ts) se ve cómo le va: gana, comparte el primer
//      lugar, pierde contra otro vendedor (¿cuánto hay que bajar?) o pierde contra otra publicación nuestra.
//   4. Al superadministrador: aviso en la barra de estado y un mail con lo nuevo o lo que cambió.
// Sólo lectura de ML: los cambios de precio se preparan en Precios en Mercado Libre, como siempre.

import { consulta } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { decidirCatalogo } from "@/lib/mercadolibre/catalogo-marca";
import { juzgar } from "@/lib/mercadolibre/juez-similar";
import { referenciaDe } from "@/lib/mercadolibre/publicar-similar";
import { enviarMail, plantilla, escapar } from "@/lib/correo/mailer";
import { urlPanel } from "@/lib/tienda/dominios";
import { formatearNumero } from "@/lib/numeros";

/** Cuánto se acepta bajar de la Clásica para ganar un catálogo (Fer, 3/11: «no más del 3 %»). */
export const TOPE_BAJA_PCT = 3;

// Las publicaciones que creó la cola de Laucen (la respuesta guarda el id y, si hubo, las otras que se crearon juntas).
const SQL_CREADAS = `
  select q.canal_id, q.respuesta ->> 'id' item from ml_cola q
   where q.estado = 'ok' and q.creado_ts > now() - interval '30 days' and q.respuesta ? 'id'
  union
  select q.canal_id, o from ml_cola q
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(q.respuesta -> 'otras') = 'array' then q.respuesta -> 'otras' else '[]'::jsonb end) o
   where q.estado = 'ok' and q.creado_ts > now() - interval '30 days'`;

/** Anota las publicaciones de catálogo nuevas que no creó Laucen. Devuelve cuántas. */
export async function registrarCatalogosAuto(org: string | null): Promise<number> {
  const r = await consulta<{ item_id: string }>(`
    with creadas as (${SQL_CREADAS})
    insert into ml_catalogo_auto (organizacion_id, canal_id, item_id, catalogo_id)
    select m.organizacion_id, m.canal_id, m.item_id, m.datos_externos -> 'ml' ->> 'catalog_product_id'
      from meli_item m
     where ($1::text is null or m.organizacion_id = $1)
       and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false)
       and m.estado in ('active', 'paused', 'under_review')
       and (m.datos_externos -> 'ml' ->> 'date_created')::timestamptz >= now() - interval '15 days'
       and not exists (select 1 from ml_catalogo_auto a where a.canal_id = m.canal_id and a.item_id = m.item_id)
       and not exists (select 1 from creadas c where c.canal_id = m.canal_id and c.item = m.item_id)
    on conflict do nothing returning item_id`, [org]);
  return r.length;
}

type ProductoMl = { name?: string; type?: string; attributes?: { id: string; name?: string; value_name?: string | null }[] };

/** Controla marca y producto de los catálogos sin juzgar (de a pocos por vuelta; 3 intentos si ML o la IA fallan). */
export async function juzgarCatalogosAuto(org: string | null, hastaMs: number, max = 10): Promise<number> {
  const pendientes = await consulta<{ organizacion_id: string; canal_id: number; item_id: string; catalogo_id: string | null; producto_id: number | null }>(`
    select a.organizacion_id, a.canal_id::int, a.item_id, a.catalogo_id, v.producto_id::int
      from ml_catalogo_auto a
      left join publicacion pu on pu.canal_id = a.canal_id and pu.id_externo = a.item_id
      left join variacion v on v.id = pu.variacion_id
     where ($1::text is null or a.organizacion_id = $1) and a.juzgado_ts is null and a.intentos < 3
     order by a.visto_ts limit $2`, [org, max]);
  let n = 0;
  for (const f of pendientes) {
    if (Date.now() > hastaMs) break;
    await consulta("update ml_catalogo_auto set intentos = intentos + 1 where canal_id = $1 and item_id = $2", [f.canal_id, f.item_id]);
    const cuenta = await cuentaDelCanal(f.organizacion_id, f.canal_id);
    if (!cuenta || !f.catalogo_id) continue;
    const r = await ml<ProductoMl>(cuenta, "GET", `/products/${f.catalogo_id}`);
    if (r.status !== 200) continue;
    const marca = r.datos.attributes?.find((a) => a.id === "BRAND")?.value_name ?? null;
    const marcaOk = decidirCatalogo(marca, r.datos.type ?? null) === "entra";
    let veredicto: string | null = null, motivo: string | null = null;
    if (f.producto_id) {
      const ref = await referenciaDe(f.organizacion_id, f.producto_id);
      const datos = (r.datos.attributes ?? []).filter((a) => a.value_name && !/^(SELLER_|PACKAGE_|GTIN|EMPTY_GTIN|IS_|ITEM_CONDITION|PRODUCT_DATA_SOURCE)/.test(a.id))
        .slice(0, 15).map((a) => `${a.name ?? a.id}: ${a.value_name}`).join("; ");
      const j = await juzgar(ref, [{ id: f.catalogo_id, titulo: r.datos.name ?? f.catalogo_id, datos }]);
      if (!j) continue; // la IA no contestó: se reintenta en la próxima vuelta
      veredicto = j[f.catalogo_id]?.veredicto ?? null;
      motivo = j[f.catalogo_id]?.motivo ?? null;
    }
    await consulta(`update ml_catalogo_auto set catalogo_nombre = $3, marca = $4, marca_ok = $5, veredicto = $6, motivo = $7, juzgado_ts = now()
                     where canal_id = $1 and item_id = $2`, [f.canal_id, f.item_id, r.datos.name ?? null, marca, marcaOk, veredicto, motivo]);
    n++;
  }
  return n;
}

export type Situacion = "gana" | "comparte" | "contra_otro" | "contra_nosotros" | "sin_listar";
export const TEXTO_SITUACION: Record<Situacion, string> = {
  gana: "Gana", comparte: "Comparte el 1.er lugar", contra_otro: "Pierde contra otro vendedor",
  contra_nosotros: "Pierde contra una nuestra", sin_listar: "Todavía no compite",
};

export type CatalogoAuto = {
  canal_id: number; cuenta: string; item_id: string; estado_ml: string | null; tipo: string | null; precio: number | null;
  producto_id: number | null; variacion_id: number | null; sku: string | null; titulo: string | null; fotos: string[] | null;
  catalogo_id: string | null; catalogo_nombre: string | null; marca: string | null; marca_ok: boolean | null;
  veredicto: string | null; motivo: string | null; juzgado: boolean;
  situacion: Situacion; ptw: number | null; ganador: number | null; clasica: number | null; leido_ts: Date | null; visto_ts: Date;
  aviso_estado: string | null;
};

/** Los catálogos que armó ML, con cómo les va. */
export async function catalogosAuto(org: string): Promise<CatalogoAuto[]> {
  return consulta<CatalogoAuto>(`
    with lc as (select id from lista_precios where organizacion_id = $1 and lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') order by id limit 1),
    nuestros as (
      -- Nuestras publicaciones de catálogo activas, a su precio de venta (con la campaña en curso, si tiene).
      select m.canal_id, m.item_id, m.datos_externos -> 'ml' ->> 'catalog_product_id' cpid,
             least((m.datos_externos -> 'ml' ->> 'price')::numeric,
                   (select min(o.precio) from ml_promo_item o where o.canal_id = m.canal_id and o.item_id = m.item_id and o.estado = 'started')) precio
        from meli_item m where m.organizacion_id = $1 and m.estado = 'active' and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false))
    select a.canal_id::int, c.nombre cuenta, a.item_id, m.estado estado_ml, m.datos_externos -> 'ml' ->> 'listing_type_id' tipo,
           (m.datos_externos -> 'ml' ->> 'price')::float8 precio, v.producto_id::int, v.id::int variacion_id, v.sku, titulo_variacion(v.id) titulo,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = v.producto_id) fotos,
           a.catalogo_id, a.catalogo_nombre, a.marca, a.marca_ok, a.veredicto, a.motivo, a.juzgado_ts is not null or a.intentos >= 3 juzgado,
           case when w.estado = 'winning' then 'gana' when w.estado = 'sharing_first_place' then 'comparte'
                when w.estado = 'competing' and exists (select 1 from nuestros n where n.cpid = a.catalogo_id and n.item_id <> a.item_id and abs(n.precio - w.ganador_precio) <= 1) then 'contra_nosotros'
                when w.estado = 'competing' then 'contra_otro' else 'sin_listar' end situacion,
           w.precio::float8 ptw, w.ganador_precio::float8 ganador, cl.venta_ars::float8 clasica, w.leido_ts, a.visto_ts, a.aviso_estado
      from ml_catalogo_auto a join canal c on c.id = a.canal_id
      left join meli_item m on m.canal_id = a.canal_id and m.item_id = a.item_id
      left join publicacion pu on pu.canal_id = a.canal_id and pu.id_externo = a.item_id
      left join variacion v on v.id = pu.variacion_id
      left join ml_price_to_win w on w.canal_id = a.canal_id and w.item_id = a.item_id and w.error is null
      left join lc on true
      left join lateral precio_de($1, v.id, lc.id) cl on v.id is not null
     where a.organizacion_id = $1 and coalesce(m.estado, '') <> 'closed'
     order by c.nombre, v.sku`, [org]);
}

/** ¿Cuánto abajo de la Clásica queda el precio para ganar? (sólo en las Clásicas; en otros planes el precio no se compara así). */
export function bajaPct(c: Pick<CatalogoAuto, "ptw" | "clasica" | "tipo">): number | null {
  if (c.tipo !== "gold_special" || !c.ptw || !c.clasica) return null;
  return Math.round((1 - c.ptw / c.clasica) * 1000) / 10;
}

/** Qué hacer con un catálogo, en criollo (null = nada). */
export function queHacer(c: CatalogoAuto): string | null {
  const pesos = (x: number | null) => (x == null ? "—" : `$ ${formatearNumero(x, "entero")}`);
  const partes: string[] = [];
  if (c.marca_ok === false) partes.push(`El catálogo tiene la marca de otro vendedor (${c.marca ?? "sin marca"}): trae denuncias, conviene sacarla.`);
  if (c.veredicto === "distinto") partes.push(`No es el mismo producto que el nuestro${c.motivo ? `: ${c.motivo}` : ""}.`);
  if (c.situacion === "contra_otro") {
    const b = bajaPct(c);
    if (b == null) partes.push(`Para ganar hay que bajar a ${pesos(c.ptw)} (gana otro vendedor a ${pesos(c.ganador)}).`);
    else if (b <= TOPE_BAJA_PCT) partes.push(`Para ganar hay que bajar a ${pesos(c.ptw)}, ${formatearNumero(Math.max(b, 0), "decimal")} % abajo de la Clásica: se puede (Precios en Mercado Libre › Preparar cambios).`);
    else partes.push(`Para ganar habría que bajar a ${pesos(c.ptw)}, ${formatearNumero(b, "decimal")} % abajo de la Clásica: más del ${TOPE_BAJA_PCT} %.`);
  }
  if (c.situacion === "contra_nosotros") partes.push(`La que gana es otra publicación nuestra a ${pesos(c.ganador)}: que ésta entre a la campaña (Precios en Mercado Libre › Preparar cambios) o pausala.`);
  return partes.length ? partes.join(" ") : null;
}

/** Lo que pide atención (el aviso de la barra de estado). */
export const pideAtencion = (c: CatalogoAuto) => c.marca_ok === false || c.veredicto === "distinto" || c.situacion === "contra_otro" || c.situacion === "contra_nosotros";

/** Lo que se le avisó por mail: cambia cuando cambia lo que hay que hacer. */
const estadoAviso = (c: CatalogoAuto) => [c.situacion, c.veredicto ?? "-", c.marca_ok === false ? "marca" : "-", c.situacion === "contra_otro" ? Math.round(c.ptw ?? 0) : ""].join("|");

/** Mail a los superadministradores con los catálogos nuevos y los que cambiaron (ya juzgados). Devuelve cuántos mails salieron. */
export async function avisarCatalogosAuto(org: string | null): Promise<number> {
  const orgs = org ? [org] : (await consulta<{ id: string }>("select distinct organizacion_id id from ml_catalogo_auto")).map((x) => x.id);
  let enviados = 0;
  for (const o of orgs) {
    const todos = (await catalogosAuto(o)).filter((c) => c.juzgado && c.leido_ts);
    const cambios = todos.filter((c) => c.aviso_estado !== estadoAviso(c) && (c.aviso_estado == null || pideAtencion(c)));
    if (!cambios.length) continue;
    const para = await consulta<{ email: string }>(`
      select distinct u.email from membresias m join usuarios u on u.id = m.usuario_id
       where m.organizacion_id = $1 and m.superadmin and upper(m.estado) = 'ACTIVO' and u.email is not null`, [o]);
    const panel = urlPanel();
    const filas = cambios.map((c) => `<li><b>${escapar(c.cuenta)}</b> · ${escapar(c.sku ?? "sin producto")} · ${escapar(c.item_id)}: ${escapar(TEXTO_SITUACION[c.situacion])}.`
      + `${queHacer(c) ? ` ${escapar(queHacer(c)!)}` : ""}</li>`).join("");
    const atencion = cambios.filter(pideAtencion).length;
    let salio = !para.length;
    for (const p of para) {
      const r = await enviarMail(o, {
        para: p.email, tipo: "catalogos_ml", remitente: { nombre: "Laucen", email: null },
        asunto: atencion ? `Catálogos de Mercado Libre: ${atencion} para revisar` : `Catálogos de Mercado Libre: ${cambios.length} nuevos`,
        html: plantilla({ nombre: "Laucen", web: panel }, "Catálogos que armó Mercado Libre",
          `<p>Mercado Libre puso estas publicaciones a competir en un catálogo, o cambió cómo les va:</p><ul>${filas}</ul>`,
          { texto: "Ver los catálogos", url: `${panel}/catalogo/catalogos-ml` }),
      });
      if (r.ok) { salio = true; enviados++; }
    }
    if (salio) for (const c of cambios) {
      await consulta("update ml_catalogo_auto set aviso_estado = $3, aviso_ts = now() where canal_id = $1 and item_id = $2", [c.canal_id, c.item_id, estadoAviso(c)]);
    }
  }
  return enviados;
}

/** Una vuelta entera: anotar, juzgar y avisar (la corre el barrido de ML después de leer los precios). */
export async function revisarCatalogosAuto(hastaMs: number): Promise<{ nuevos: number; juzgados: number; mails: number }> {
  const nuevos = await registrarCatalogosAuto(null);
  const juzgados = await juzgarCatalogosAuto(null, hastaMs);
  const mails = await avisarCatalogosAuto(null);
  return { nuevos, juzgados, mails };
}
