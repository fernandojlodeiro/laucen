// Catálogos que perdemos y el botón «Ganar» (Fer, 4/11).
//   · Quién gana cada catálogo donde no gana ninguna publicación nuestra: la primera de la lista de ofertas del
//     producto de catálogo (GET /products/{id}/items), con su vendedor (ml_catalogo_ganador). Si el vendedor no es
//     una de nuestras cuentas, perdemos ese catálogo.
//   · «Ganar» (el clic de Fer en la pantalla, sin lote): lee de ML el precio para ganar de esa publicación en el
//     momento, la saca de las campañas en curso y le pone ese precio, por la cola. Queda anotada en ml_precio_ganar:
//     el motor de precios no la toca mientras esté ahí (datos.ts, calcularCanal). «Soltar» la devuelve al motor.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { encolar, arrancarCola, PRIORIDAD } from "@/lib/mercadolibre/cola";
import { comisionesMl } from "@/lib/precios-ml/datos";
import { comisionesDe, planDePublicacion, pedidoSalirCampana, PLAN_INFO } from "@/lib/precios-ml/motor";
import { precioCambiadoAMano } from "@/lib/precios-ml/preparar";
import { enviarMail, plantilla, escapar } from "@/lib/correo/mailer";
import { urlPanel } from "@/lib/tienda/dominios";

/** Lee quién gana los catálogos donde no gana (ni comparte) ninguna nuestra, cada 6 h. Devuelve cuántos leyó. */
export async function leerGanadoresCatalogos(org: string | null, hastaMs: number, max = 60): Promise<number> {
  const cats = await consulta<{ organizacion_id: string; catalogo_id: string; canal_id: number }>(`
    with x as (
      select m.organizacion_id, m.datos_externos -> 'ml' ->> 'catalog_product_id' cpid, m.canal_id, w.estado
        from meli_item m join ml_price_to_win w on w.canal_id = m.canal_id and w.item_id = m.item_id and w.error is null
       where ($1::text is null or m.organizacion_id = $1) and m.estado = 'active'
         and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false))
    select x.organizacion_id, x.cpid catalogo_id, min(x.canal_id)::int canal_id from x
      left join ml_catalogo_ganador g on g.organizacion_id = x.organizacion_id and g.catalogo_id = x.cpid
     where x.cpid is not null
     group by x.organizacion_id, x.cpid, g.leido_ts
    having not bool_or(x.estado in ('winning', 'sharing_first_place')) and (g.leido_ts is null or g.leido_ts < now() - interval '6 hours')
     order by g.leido_ts nulls first limit $2`, [org, max]);
  let n = 0;
  for (const c of cats) {
    if (Date.now() > hastaMs) break;
    const cuenta = await cuentaDelCanal(c.organizacion_id, c.canal_id);
    if (!cuenta) continue;
    const r = await ml<{ results?: { item_id?: string; seller_id?: number; price?: number }[] }>(cuenta, "GET", `/products/${c.catalogo_id}/items?limit=1`);
    if (r.status !== 200) continue;
    const g = r.datos.results?.[0];
    await consulta(`
      insert into ml_catalogo_ganador (organizacion_id, catalogo_id, item_id, vendedor, precio, leido_ts) values ($1, $2, $3, $4, $5, now())
      on conflict (organizacion_id, catalogo_id) do update set item_id = excluded.item_id, vendedor = excluded.vendedor, precio = excluded.precio, leido_ts = now()`,
      [c.organizacion_id, c.catalogo_id, g?.item_id ?? null, g?.seller_id ?? null, g?.price ?? null]);
    n++;
  }
  return n;
}

export type PubCatalogo = {
  canal_id: number; cuenta: string; item_id: string; plan: string; venta: number | null; publicado: number | null;
  ptw: number | null; estado_ptw: string | null; comision_pct: number; envio: number | null; fijada: number | null;
  /** Por qué no compite, en criollo (null = compite). */
  no_compite: string | null;
  /** Cómo salió el último «Ganar» de la cola: pendiente, ok o error (con el motivo). */
  ganar_estado: string | null; ganar_error: string | null;
};
export type CatalogoPerdido = {
  catalogo_id: string; catalogo_nombre: string | null; producto_id: number; sku: string; titulo: string; fotos: string[] | null; clasica: number | null;
  ganador_item: string | null; ganador_precio: number | null; leido_ts: Date; pubs: PubCatalogo[];
};

/** Los catálogos donde gana un vendedor que no es ninguna de nuestras cuentas, con todas nuestras publicaciones
 *  activas de ese catálogo. Las fijadas con «Ganar» se muestran aunque el catálogo ya esté ganado. */
export async function catalogosPerdidos(org: string): Promise<CatalogoPerdido[]> {
  const filas = await consulta<{
    catalogo_id: string; catalogo_nombre: string | null; producto_id: number; sku: string; titulo: string; fotos: string[] | null; clasica: number | null;
    ganador_item: string | null; ganador_precio: number | null; leido_ts: Date;
    canal_id: number; cuenta: string; item_id: string; tipo: string | null; tags: unknown; categoria: string | null;
    venta: number | null; publicado: number | null; ptw: number | null; estado_ptw: string | null; envio: number | null; fijada: number | null;
    ganar_estado: string | null; ganar_error: string | null; motivo: string | null;
  }>(`
    with lc as (select id from lista_precios where organizacion_id = $1 and lower(nombre) in ('clásicas', 'clasicas', 'clásica', 'clasica') order by id limit 1),
    nuestros as (select meli_user_id from meli_cuenta where organizacion_id = $1 and canal_id is not null),
    pubs as (
      select m.canal_id, m.item_id, m.datos_externos -> 'ml' ->> 'catalog_product_id' cpid, p.variacion_id, w.estado, w.precio ptw, w.motivo,
             w.ganador_item w_item, w.ganador_precio w_precio, w.leido_ts w_ts,
             m.datos_externos -> 'ml' ->> 'listing_type_id' tipo, m.datos_externos -> 'ml' -> 'tags' tags, m.datos_externos -> 'ml' ->> 'category_id' categoria,
             (m.datos_externos -> 'ml' ->> 'price')::numeric publicado
        from meli_item m join publicacion p on p.canal_id = m.canal_id and p.id_externo = m.item_id
        left join ml_price_to_win w on w.canal_id = m.canal_id and w.item_id = m.item_id and w.error is null
       where m.organizacion_id = $1 and m.estado = 'active' and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false)),
    cats as (
      select g.* from ml_catalogo_ganador g
       where g.organizacion_id = $1 and g.vendedor is not null and g.vendedor not in (select meli_user_id from nuestros)
         and (not exists (select 1 from pubs where pubs.cpid = g.catalogo_id and pubs.estado in ('winning', 'sharing_first_place'))
              or exists (select 1 from pubs join ml_precio_ganar f on f.canal_id = pubs.canal_id and f.item_id = pubs.item_id where pubs.cpid = g.catalogo_id)))
    select g.catalogo_id, (select a.catalogo_nombre from ml_catalogo_auto a where a.catalogo_id = g.catalogo_id and a.catalogo_nombre is not null limit 1) catalogo_nombre,
           v.producto_id::int, v.sku, titulo_variacion(v.id) titulo,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = v.producto_id) fotos,
           -- El ganador: el que da ML en el precio para ganar de nuestras publicaciones (el dueño del botón de compra); si
           -- ninguna lo trae, el primero de la lista de ofertas del catálogo.
           cl.venta_ars::float8 clasica, coalesce(wg.w_item, g.item_id) ganador_item, coalesce(wg.w_precio, g.precio)::float8 ganador_precio,
           coalesce(wg.w_ts, g.leido_ts) leido_ts, pu.motivo,
           pu.canal_id::int, c.nombre cuenta, pu.item_id, pu.tipo, pu.tags, pu.categoria,
           least(pu.publicado, (select min(o.precio) from ml_promo_item o where o.canal_id = pu.canal_id and o.item_id = pu.item_id and o.estado = 'started'))::float8 venta,
           pu.publicado::float8, pu.ptw::float8, pu.estado estado_ptw,
           (select k.envio from ml_relampago_costo k where k.canal_id = pu.canal_id and k.item_id = pu.item_id and k.envio is not null order by k.leido_ts desc limit 1)::float8 envio,
           f.precio::float8 fijada, q.estado ganar_estado, q.ultimo_error ganar_error
      from cats g join pubs pu on pu.cpid = g.catalogo_id
      left join lateral (select x.w_item, x.w_precio, x.w_ts from pubs x where x.cpid = g.catalogo_id and x.w_item is not null order by x.w_ts desc limit 1) wg on true
      join canal c on c.id = pu.canal_id
      join variacion v on v.id = pu.variacion_id
      left join ml_precio_ganar f on f.canal_id = pu.canal_id and f.item_id = pu.item_id
      left join lateral (select q.estado, q.ultimo_error from ml_cola q where f.item_id is not null and q.canal_id = pu.canal_id and q.item_id = pu.item_id
                          and q.tipo = 'precio' and q.payload ->> 'descripcion' like 'Ganar el catálogo%' order by q.id desc limit 1) q on true
      left join lc on true
      left join lateral precio_de($1, v.id, lc.id) cl on true
     order by v.sku, g.catalogo_id, pu.ptw desc nulls last`, [org]);
  const com = await comisionesMl();
  const porCat = new Map<string, CatalogoPerdido>();
  for (const f of filas) {
    let c = porCat.get(f.catalogo_id);
    if (!c) {
      c = { catalogo_id: f.catalogo_id, catalogo_nombre: f.catalogo_nombre, producto_id: f.producto_id, sku: f.sku, titulo: f.titulo, fotos: f.fotos, clasica: f.clasica,
        ganador_item: f.ganador_item, ganador_precio: f.ganador_precio, leido_ts: f.leido_ts, pubs: [] };
      porCat.set(f.catalogo_id, c);
    }
    const plan = planDePublicacion(f.tipo, f.tags) ?? "clasica";
    c.pubs.push({
      canal_id: f.canal_id, cuenta: f.cuenta, item_id: f.item_id, plan: PLAN_INFO[plan]?.nombre ?? plan, venta: f.venta, publicado: f.publicado,
      ptw: f.ptw, estado_ptw: f.estado_ptw, comision_pct: comisionesDe(f.categoria ? com.porCategoria.get(f.categoria) : null, com.general).valores[plan],
      envio: f.envio, fijada: f.fijada, ganar_estado: f.ganar_estado, ganar_error: f.ganar_error,
      no_compite: f.estado_ptw && f.estado_ptw !== "competing" && f.estado_ptw !== "winning" && f.estado_ptw !== "sharing_first_place" ? motivoNoCompite(f.motivo) : null,
    });
  }
  // Una sola cuenta por producto (Fer, 4/11): la primera cuenta, en el orden de las cuentas (DAITOM primero), que tenga
  // alguna publicación que compite en ese catálogo; sólo se muestran sus publicaciones (y las que ya se fijaron con «Ganar»).
  for (const c of porCat.values()) {
    const compiten = c.pubs.filter((p) => !p.no_compite);
    if (!compiten.length) continue;
    const cuenta = Math.min(...compiten.map((p) => p.canal_id));
    c.pubs = c.pubs.filter((p) => p.canal_id === cuenta || p.fijada != null);
  }
  return [...porCat.values()];
}

/** Por qué ML no pone a competir una publicación de catálogo (el reason de price_to_win), en criollo. */
const MOTIVOS: Record<string, string> = {
  shipping_mode_not_specified_me2: "no tiene Mercado Envíos",
  item_not_opted_in: "no está en el catálogo",
  not_active: "no está activa",
  item_paused: "está pausada",
  item_under_review: "está en revisión",
};
export function motivoNoCompite(m: string | null): string {
  const lista = (m ?? "").split(",").filter(Boolean);
  return lista.length ? lista.map((x) => MOTIVOS[x] ?? x).join(", ") : "Mercado Libre no dice por qué";
}

/** Lo que queda después de la comisión y el envío (el envío, si se conoce). */
export const netoDe = (precio: number | null, p: Pick<PubCatalogo, "comision_pct" | "envio">) =>
  precio == null ? null : Math.round(precio * (1 - p.comision_pct / 100) - (p.envio ?? 0));

/** «Ganar»: el precio para ganar de ML en este momento, fuera de las campañas en curso, por la cola (sin lote: el
 *  clic de Fer en la pantalla es el que lo manda). Devuelve el precio puesto. */
export async function ganarCatalogo(org: string, canalId: number, itemId: string, usuario: string | null): Promise<number> {
  const pub = await una<{ id: number; variacion_id: number; variacion_externa: string | null; publicado: number | null }>(`
    select p.id::int, p.variacion_id::int, p.variacion_externa, (m.datos_externos -> 'ml' ->> 'price')::float8 publicado
      from publicacion p join meli_item m on m.canal_id = p.canal_id and m.item_id = p.id_externo
     where p.organizacion_id = $1 and p.canal_id = $2 and p.id_externo = $3 and m.estado = 'active'
       and coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false)`, [org, canalId, itemId]);
  if (!pub) throw new ErrorErp("Esa publicación no es de catálogo o no está activa.");
  const cuenta = await cuentaDelCanal(org, canalId);
  if (!cuenta) throw new ErrorErp("La cuenta de Mercado Libre no está conectada.");
  const r = await ml<{ price_to_win?: number | null; current_price?: number | null; status?: string | null; reason?: string[] | null }>(cuenta, "GET", `/items/${itemId}/price_to_win?siteId=MLA&version=v2`);
  if (r.status !== 200) throw new ErrorErp("Mercado Libre no contestó el precio para ganar. Probá de nuevo en un rato.");
  if (r.datos.status === "winning") throw new ErrorErp("Esa publicación ya está ganando el catálogo.");
  // Si no compite (ej. sin Mercado Envíos), ML devuelve como precio para ganar el mismo precio de hoy: bajar no sirve.
  if (r.datos.status !== "competing" && r.datos.status !== "sharing_first_place")
    throw new ErrorErp(`Esa publicación no compite en el catálogo: ${motivoNoCompite(r.datos.reason?.join(",") ?? null)}. Bajar el precio no la hace ganar.`);
  const ptw = Number(r.datos.price_to_win);
  if (!(ptw > 0)) throw new ErrorErp("Mercado Libre no da un precio para ganar para esa publicación.");
  if (r.datos.current_price && ptw >= Number(r.datos.current_price) - 0.5)
    throw new ErrorErp("El precio de hoy ya alcanza para ganar: pierde por otra cosa (envío, cuotas o reputación), no por precio.");
  const precio = Math.floor(ptw);
  // Sale de las campañas en curso (el precio que ve el comprador tiene que ser éste) y después cambia el precio.
  const campanas = await consulta<{ promocion_id: string; tipo: string; estado: string; precio: number | null }>(`
    select promocion_id, tipo, estado, precio::float8 from ml_promo_item
     where canal_id = $1 and item_id = $2 and estado in ('started', 'pending') and tipo not in ('LIGHTNING', 'SMART_LIGHTNING')`, [canalId, itemId]);
  const v = pub.variacion_externa ? Number(pub.variacion_externa) : null;
  const pedidos = [
    ...campanas.map((c) => ({ ...pedidoSalirCampana(itemId, { id: c.promocion_id, tipo: c.tipo, estado: c.estado, precio: c.precio, min: null, max: null }), seguirSiFalla: true })),
    { metodo: "PUT" as const, ruta: `/items/${itemId}`, cuerpo: v ? { variations: [{ id: v, price: precio }] } : { price: precio } },
  ];
  const venta = campanas.filter((c) => c.estado === "started" && c.precio).reduce((m, c) => Math.min(m, c.precio!), pub.publicado ?? Infinity);
  await encolar(org, [{
    canalId, itemId, variationId: pub.variacion_externa, publicacionId: pub.id, tipo: "precio", prioridad: PRIORIDAD.boton,
    payload: { precio, pedidos, descripcion: `Ganar el catálogo: ${itemId} a $ ${precio.toLocaleString("es-AR")}, fuera de las campañas (pedido de Fer)` },
    antes: { precio: pub.publicado, venta: Number.isFinite(venta) ? venta : null },
  }], { origen: "boton", usuarioId: usuario });
  arrancarCola();
  await consulta(`
    insert into ml_precio_ganar (organizacion_id, canal_id, item_id, precio, venta_antes, usuario_id) values ($1, $2, $3, $4, $5, $6)
    on conflict (canal_id, item_id) do update set precio = excluded.precio, venta_antes = coalesce(ml_precio_ganar.venta_antes, excluded.venta_antes),
      usuario_id = excluded.usuario_id, creado_ts = now()`,
    [org, canalId, itemId, precio, Number.isFinite(venta) ? venta : null, usuario]);
  return precio;
}

/** «Soltar»: la publicación vuelve al motor de precios (se recalcula en el acto si la cuenta sincroniza precios). */
export async function soltarCatalogo(org: string, canalId: number, itemId: string): Promise<void> {
  const r = await una<{ variacion_id: number }>(`
    with b as (delete from ml_precio_ganar where organizacion_id = $1 and canal_id = $2 and item_id = $3 returning item_id)
    select p.variacion_id::int from publicacion p join b on b.item_id = p.id_externo where p.canal_id = $2 limit 1`, [org, canalId, itemId]);
  if (r) await precioCambiadoAMano(org, r.variacion_id).catch((e) => console.error("[ganar] soltar", e));
}

/** Mail a los superadministradores con los catálogos que perdemos nuevos o que cambiaron de ganador o de precio
 *  (Fer, 4/11: «que me avise de manera inmediata si tengo que bajar el precio para ganar»). */
export async function avisarPerdidos(org: string | null): Promise<number> {
  const orgs = org ? [org] : (await consulta<{ id: string }>("select distinct organizacion_id id from ml_catalogo_ganador")).map((x) => x.id);
  let enviados = 0;
  for (const o of orgs) {
    const estados = new Map((await consulta<{ catalogo_id: string; avisado: string | null }>(
      "select catalogo_id, avisado from ml_catalogo_ganador where organizacion_id = $1", [o])).map((x) => [x.catalogo_id, x.avisado]));
    const firma = (c: CatalogoPerdido) => `${c.ganador_item ?? ""}|${Math.round(c.ganador_precio ?? 0)}`;
    const cambios = (await catalogosPerdidos(o)).filter((c) => !c.pubs.some((p) => p.fijada != null) && estados.get(c.catalogo_id) !== firma(c));
    if (!cambios.length) continue;
    const para = await consulta<{ email: string }>(`
      select distinct u.email from membresias m join usuarios u on u.id = m.usuario_id
       where m.organizacion_id = $1 and m.superadmin and upper(m.estado) = 'ACTIVO' and u.email is not null`, [o]);
    const panel = urlPanel();
    const pesos = (x: number | null) => (x == null ? "—" : `$ ${Math.round(x).toLocaleString("es-AR")}`);
    const filas = cambios.map((c) => {
      const mejor = [...c.pubs].filter((p) => p.ptw).sort((a, b) => (netoDe(b.ptw, b) ?? 0) - (netoDe(a.ptw, a) ?? 0))[0];
      return `<li><b>${escapar(c.sku)}</b>: gana otro vendedor a ${pesos(c.ganador_precio)}.${mejor ? ` Para ganar con ${escapar(mejor.cuenta)} (${escapar(mejor.plan)}): ${pesos(mejor.ptw)}, neto ${pesos(netoDe(mejor.ptw, mejor))}.` : ""}</li>`;
    }).join("");
    let salio = !para.length;
    for (const p of para) {
      const r = await enviarMail(o, {
        para: p.email, tipo: "catalogos_perdidos", remitente: { nombre: "Laucen", email: null },
        asunto: `Catálogos de Mercado Libre: perdemos ${cambios.length}`,
        html: plantilla({ nombre: "Laucen", web: panel }, "Catálogos que perdemos",
          `<p>En estos catálogos el botón de compra lo tiene un vendedor que no es ninguna de tus cuentas:</p><ul>${filas}</ul>`,
          { texto: "Ver y ganar", url: `${panel}/catalogo/catalogos-ml` }),
      });
      if (r.ok) { salio = true; enviados++; }
    }
    if (salio) for (const c of cambios) {
      await consulta("update ml_catalogo_ganador set avisado = $3 where organizacion_id = $1 and catalogo_id = $2", [o, c.catalogo_id, firma(c)]);
    }
  }
  return enviados;
}
