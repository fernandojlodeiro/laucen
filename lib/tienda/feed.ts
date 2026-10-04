// Feed de catálogo para Meta (Facebook / Instagram Commerce Manager): RSS 2.0
// con el espacio de nombres de Google Shopping (g:), que Meta acepta. Una
// entrada por variación con precio en la lista de la tienda.

import { sqlPublicadoEnWeb } from "@/lib/catalogo/web";
import { consulta } from "@/lib/erp/base";
import { nombreTienda, type Tienda } from "@/lib/tienda/tienda";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `base`: la dirección pública de la tienda (https://daitom.com.ar o …/tienda/<slug>). */
export async function feedMeta(t: Tienda, base: string): Promise<string> {
  const filas = await consulta<{ variacion_id: number; producto_id: number; titulo: string; descripcion: string | null; marca: string | null; foto: string | null;
    lista: string | null; venta: string | null; disponible: number; codigo_barras: string | null }>(`
    select v.id::int variacion_id, p.id::int producto_id, titulo_variacion(v.id) titulo, p.descripcion, p.marca, v.codigo_barras,
           coalesce((select url from variacion_foto where variacion_id = v.id order by orden limit 1),
                    (select url from producto_foto where producto_id = p.id order by orden limit 1)) foto,
           pr.lista_ars lista, pr.venta_ars venta, greatest(stock_disponible_canal($1, v.id, $2), 0) disponible
      from variacion v join producto p on p.id = v.producto_id
      cross join lateral (select * from precio_de($1, v.id, $3)) pr
     where v.organizacion_id = $1 and v.estado = 'activa' and p.estado = 'activo' and ${sqlPublicadoEnWeb("p", "$2")}`, [t.organizacionId, t.canalId, t.listaId]);
  const items = filas.filter((f) => f.foto).map((f) => `
    <item>
      <g:id>${f.variacion_id}</g:id>
      <g:item_group_id>${f.producto_id}</g:item_group_id>
      <g:title>${esc(f.titulo.slice(0, 150))}</g:title>
      <g:description>${esc((f.descripcion || f.titulo).slice(0, 5000))}</g:description>
      <g:link>${esc(`${base}/producto/${f.producto_id}?v=${f.variacion_id}`)}</g:link>
      <g:image_link>${esc(f.foto!)}</g:image_link>
      <g:availability>${f.disponible > 0 ? "in stock" : "out of stock"}</g:availability>
      <g:condition>new</g:condition>
      <g:price>${Number(f.lista).toFixed(2)} ARS</g:price>
      ${Number(f.venta) < Number(f.lista) ? `<g:sale_price>${Number(f.venta).toFixed(2)} ARS</g:sale_price>` : ""}
      ${f.marca ? `<g:brand>${esc(f.marca)}</g:brand>` : `<g:brand>${esc(nombreTienda(t))}</g:brand>`}
      ${f.codigo_barras ? `<g:gtin>${esc(f.codigo_barras)}</g:gtin>` : ""}
    </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(nombreTienda(t))}</title>
    <link>${esc(base)}</link>
    <description>Catálogo de ${esc(nombreTienda(t))}</description>${items}
  </channel>
</rss>`;
}
