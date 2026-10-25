// Catálogos de productos para publicidad (24/10): Google Merchant Center (anuncios de Shopping),
// Meta (Facebook / Instagram) y TikTok. El mismo formato para los tres —RSS 2.0 con el espacio
// de nombres g: de Google, que Meta y TikTok aceptan—, armado en el momento con stock y precio al
// día, en una dirección fija por dominio: https://<dominio>/feeds/google.xml (meta.xml, tiktok.xml).
//
// Una entrada por variación publicada en la tienda, activa y con precio; g:id = idCatalogo (el SKU),
// el mismo id que llevan los eventos de compra (lib/tienda/publicidad.ts) para que la plataforma
// cruce la venta con el anuncio.
//
// El precio:
//   - Google: SOLO el precio que paga el comprador en la ficha (el precio grande), sin g:sale_price
//     ni el tachado. Google controla que un precio tachado se haya cobrado de verdad y desaprueba
//     el producto si no lo puede comprobar; el mismo precio va en los datos de la ficha (schema.org).
//   - Meta y TikTok: el tachado como g:price y el precio grande como g:sale_price (así el anuncio
//     muestra la rebaja, como la tienda).
//
// Lo que no sale y por qué se cuenta (Configuración › Tienda web › Publicidad): sin stock (o va como
// "out of stock", según la configuración), sin foto o excluido (por categoría o producto).

import { precioWebListo } from "@/lib/tienda/precio-web";
import { sqlPublicadoEnWeb } from "@/lib/catalogo/web";
import { consulta } from "@/lib/erp/base";
import { nombreTienda, type Tienda } from "@/lib/tienda/tienda";
import { condicionCatalogo, gtinValido, idCatalogo } from "@/lib/tienda/publicidad";

export type Plataforma = "google" | "meta" | "tiktok";
export const PLATAFORMAS: { clave: Plataforma; nombre: string }[] = [
  { clave: "google", nombre: "Google Merchant Center" }, { clave: "meta", nombre: "Meta (Facebook e Instagram)" }, { clave: "tiktok", nombre: "TikTok" },
];

/** canal.config.publicidad_feed: bandas de precio (custom_label_1). Los sin stock nunca van (regla fija de la web). */
export type ConfigFeed = { bandas: number[] };
export function configFeedDe(x: unknown): ConfigFeed {
  const c = (x ?? {}) as Partial<ConfigFeed>;
  const bandas = (Array.isArray(c.bandas) ? c.bandas : [33000, 300000]).map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b).slice(0, 6);
  return { bandas };
}

/** "<33.000", "33.000-300.000", ">300.000". */
export function bandaDe(precio: number, bandas: number[]): string {
  const f = (n: number) => n.toLocaleString("es-AR");
  if (!bandas.length) return "todos";
  if (precio < bandas[0]) return `<${f(bandas[0])}`;
  for (let i = 1; i < bandas.length; i++) if (precio < bandas[i]) return `${f(bandas[i - 1])}-${f(bandas[i])}`;
  return `>${f(bandas.at(-1)!)}`;
}

export type Afuera = { sin_stock: number; sin_foto: number; excluido: number };
export type Catalogo = { xml: string; salen: number; afuera: Afuera };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

type Fila = {
  variacion_id: number; producto_id: number; sku: string | null; titulo: string; descripcion: string | null; marca: string | null; modelo: string | null;
  condicion: string | null; codigo_barras: string | null; peso_g: number | null; familia_id: number | null; fotos: string[] | null;
  lista: string; venta: string; disponible: number; excluido_producto: boolean;
};

/** El catálogo de la tienda para una plataforma. `base`: la dirección pública de la tienda en ese dominio. */
export async function catalogoPublicidad(t: Tienda, base: string, plataforma: Plataforma): Promise<Catalogo> {
  if (!t.listaId) return { xml: envolver(t, base, ""), salen: 0, afuera: { sin_stock: 0, sin_foto: 0, excluido: 0 } };
  const org = t.organizacionId;
  // Los precios ya calculados (precio_web) si la tabla está lista; si no, la cuenta en vivo (dan lo mismo).
  const tabla = await precioWebListo(t.canalId, t.listaId);
  const [filas, familias, reglas, conf] = await Promise.all([
    consulta<Fila>(`
      select v.id::int variacion_id, p.id::int producto_id, v.sku, titulo_variacion(v.id) titulo, p.descripcion, p.marca, p.modelo, p.condicion,
             coalesce(nullif(v.codigo_barras, ''), p.codigo_barras) codigo_barras, p.peso_g, p.familia_id::int,
             coalesce((select array_agg(url order by orden, id) from (select url, orden, id from variacion_foto where variacion_id = v.id order by orden, id limit 10) x),
                      (select array_agg(url order by orden, id) from (select url, orden, id from producto_foto where producto_id = p.id order by orden, id limit 10) y)) fotos,
             case when $4 = 'USD' then pr.lista_usd else pr.lista_ars end lista, case when $4 = 'USD' then pr.venta_usd else pr.venta_ars end venta,
             pr.disp::int disponible,
             exists (select 1 from tienda_feed_producto x where x.canal_id = $2 and x.producto_id = p.id) excluido_producto
        from variacion v join producto p on p.id = v.producto_id
        ${tabla ? "join precio_web pr on pr.canal_id = $2 and pr.lista_id = $3 and pr.variacion_id = v.id"
          : "cross join lateral (select *, greatest(stock_disponible_canal($1, v.id, $2), 0) disp from precio_de($1, v.id, $3)) pr"}
       where v.organizacion_id = $1 and v.estado = 'activa' and p.estado = 'activo' and ${sqlPublicadoEnWeb("p", "$2")}
         and coalesce(case when $4 = 'USD' then pr.venta_usd else pr.venta_ars end, 0) > 0
       order by p.id, v.orden, v.id`, [org, t.canalId, t.listaId, t.moneda]),
    consulta<{ id: number; nombre: string; padre_id: number | null }>("select id::int, nombre, padre_id::int from familia where organizacion_id = $1", [org]),
    consulta<{ familia_id: number; grupo: string | null; excluida: boolean }>(
      "select familia_id::int, grupo, excluida from tienda_feed_familia where organizacion_id = $1 and canal_id = $2", [org, t.canalId]),
    consulta<{ c: unknown }>("select config -> 'publicidad_feed' c from canal where id = $1", [t.canalId]).then((r) => configFeedDe(r[0]?.c)),
  ]);

  const fam = new Map(familias.map((f) => [f.id, f]));
  const regla = new Map(reglas.map((r) => [r.familia_id, r]));
  // La cadena de una categoría, de ella hacia arriba.
  const cadena = (id: number | null) => {
    const r: number[] = [];
    for (let x = id; x != null && fam.has(x) && r.length < 20; x = fam.get(x)!.padre_id) r.push(x);
    return r;
  };

  const afuera: Afuera = { sin_stock: 0, sin_foto: 0, excluido: 0 };
  const items: string[] = [];
  for (const f of filas) {
    const c = cadena(f.familia_id);
    if (f.excluido_producto || c.some((id) => regla.get(id)?.excluida)) { afuera.excluido++; continue; }
    if (!f.fotos?.length) { afuera.sin_foto++; continue; }
    // Reglas de la web, sin excepción: sin stock o sin precio no va (inactivo ya no llega: lo filtra la consulta).
    if (f.disponible <= 0) { afuera.sin_stock++; continue; }
    const venta = Number(f.venta), lista = Number(f.lista);
    const grupo = c.map((id) => regla.get(id)?.grupo).find((g) => g) ?? "otros";
    const tipo = c.slice().reverse().map((id) => fam.get(id)!.nombre).join(" > ");
    const gtin = gtinValido(f.codigo_barras);
    const marca = f.marca?.trim() || null, mpn = f.modelo?.trim() || null;
    const precio = plataforma === "google" || !(venta < lista)
      ? `<g:price>${venta.toFixed(2)} ${t.moneda}</g:price>`
      : `<g:price>${lista.toFixed(2)} ${t.moneda}</g:price>\n      <g:sale_price>${venta.toFixed(2)} ${t.moneda}</g:sale_price>`;
    items.push(`
    <item>
      <g:id>${esc(idCatalogo(f.sku, f.variacion_id))}</g:id>
      <g:item_group_id>${f.producto_id}</g:item_group_id>
      <g:title>${esc(f.titulo.slice(0, 150))}</g:title>
      <g:description>${esc((f.descripcion?.trim() || f.titulo).slice(0, 5000))}</g:description>
      <g:link>${esc(`${base}/producto/${f.producto_id}?v=${f.variacion_id}`)}</g:link>
      <g:image_link>${esc(f.fotos[0])}</g:image_link>${f.fotos.slice(1).map((u) => `\n      <g:additional_image_link>${esc(u)}</g:additional_image_link>`).join("")}
      <g:availability>${f.disponible > 0 ? "in stock" : "out of stock"}</g:availability>
      ${precio}
      <g:condition>${condicionCatalogo(f.condicion)}</g:condition>${marca ? `\n      <g:brand>${esc(marca)}</g:brand>` : ""}${gtin ? `\n      <g:gtin>${gtin}</g:gtin>` : ""}${mpn ? `\n      <g:mpn>${esc(mpn)}</g:mpn>` : ""}${
        !gtin && !(mpn && marca) ? "\n      <g:identifier_exists>no</g:identifier_exists>" : ""}${tipo ? `\n      <g:product_type>${esc(tipo)}</g:product_type>` : ""}${
        f.peso_g ? `\n      <g:shipping_weight>${f.peso_g} g</g:shipping_weight>` : ""}
      <g:custom_label_0>${esc(grupo)}</g:custom_label_0>
      <g:custom_label_1>${esc(bandaDe(venta, conf.bandas))}</g:custom_label_1>
    </item>`);
  }
  return { xml: envolver(t, base, items.join("")), salen: items.length, afuera };
}

function envolver(t: Tienda, base: string, items: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(nombreTienda(t))}</title>
    <link>${esc(base)}</link>
    <description>Catálogo de ${esc(nombreTienda(t))}</description>${items}
  </channel>
</rss>`;
}
