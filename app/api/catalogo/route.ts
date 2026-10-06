// GET /api/catalogo — productos activos con sus variaciones, precios (lista
// del canal, vía precio_de) y stock disponible para el canal. Pensado para la
// tienda web. Autenticación: token del canal.
//
// Parámetros: ?canal= (opcional; si viene tiene que ser el del token)
//             ?q= (busca en título, SKU, marca; regla de lib/busqueda.ts)  ?familia=<id>
//             ?pagina=1  ?por_pagina=50 (máx. 200)
// Respuesta: { canal, pagina, por_pagina, total, productos: [ { id, sku_base, titulo, descripcion, marca,
//   familia: {id, nombre} | null, tipo, peso_g, largo_cm, ancho_cm, alto_cm, fotos: [url], cucardas: [{nombre, color}],
//   atributos: [{nombre, valor}], variaciones: [ { id, sku, codigo_barras, titulo, atributos: [{nombre, valor}],
//   fotos: [url], disponible, precio: { lista: {ars, usd}, descuento_pct, venta: {ars, usd} } | null } ] } ] }
// Una variación sin precio en la lista del canal viene con precio null.

import { canalDelPedido, noAutorizado, respuestaError } from "@/lib/api/canal";
import { consulta } from "@/lib/erp/base";
import { hoyAR } from "@/lib/moneda";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { camposProductoConVariaciones } from "@/app/catalogo/busqueda";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const canal = await canalDelPedido(req);
    if (!canal) return noAutorizado();
    const u = new URL(req.url);
    if (u.searchParams.get("canal") && Number(u.searchParams.get("canal")) !== canal.id) {
      return Response.json({ error: "El canal pedido no es el del token." }, { status: 403 });
    }
    const pagina = Math.max(1, Number(u.searchParams.get("pagina")) || 1);
    const porPagina = Math.min(200, Math.max(1, Number(u.searchParams.get("por_pagina")) || 50));
    // Lo escrito, con la regla de lib/busqueda.ts (tal cual, en cualquier parte; "?" separa condiciones).
    const q = parametroBusqueda(u.searchParams.get("q"));
    const familia = Number(u.searchParams.get("familia")) || null;
    const org = canal.organizacionId;

    const filtros = `p.organizacion_id = $1 and p.estado = 'activo'
      and ${sqlBusqueda("$2", camposProductoConVariaciones("p"))}
      and ($3::bigint is null or p.familia_id = $3)`;
    const total = (await consulta<{ n: number }>(`select count(*)::int n from producto p where ${filtros}`, [org, q, familia]))[0].n;
    const productos = await consulta(`
      select p.id::int, p.sku_base, p.titulo, p.descripcion, p.marca, p.tipo, p.peso_g, p.largo_cm::float, p.ancho_cm::float, p.alto_cm::float,
             case when f.id is null then null else json_build_object('id', f.id, 'nombre', f.nombre) end familia,
             coalesce((select json_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = p.id), '[]') fotos,
             coalesce((select json_agg(json_build_object('nombre', c.nombre, 'color', c.color) order by c.orden)
                         from producto_cucarda pc join cucarda c on c.id = pc.cucarda_id and c.estado = 'activa'
                        where pc.producto_id = p.id and (pc.desde is null or pc.desde <= $6::date) and (pc.hasta is null or pc.hasta >= $6::date)), '[]') cucardas,
             coalesce((select json_agg(json_build_object('nombre', a.nombre, 'valor', a.valor) order by a.orden) from producto_atributo a where a.producto_id = p.id), '[]') atributos,
             coalesce((select json_agg(json_build_object(
                 'id', v.id, 'sku', v.sku, 'codigo_barras', v.codigo_barras, 'titulo', titulo_variacion(v.id),
                 'atributos', coalesce((select json_agg(json_build_object('nombre', va.nombre, 'valor', va.valor) order by va.orden) from variacion_atributo va where va.variacion_id = v.id), '[]'),
                 'fotos', coalesce((select json_agg(vf.url order by vf.orden, vf.id) from variacion_foto vf where vf.variacion_id = v.id), '[]'),
                 'disponible', greatest(stock_disponible_canal($1, v.id, $7), 0),
                 'precio', (select json_build_object('lista', json_build_object('ars', pr.lista_ars, 'usd', pr.lista_usd),
                                                     'descuento_pct', pr.descuento_pct,
                                                     'venta', json_build_object('ars', pr.venta_ars, 'usd', pr.venta_usd))
                              from precio_de($1, v.id, $8, $6::date) pr)
               ) order by v.orden, v.id)
               from variacion v where v.producto_id = p.id and v.estado = 'activa'), '[]') variaciones
        from producto p left join familia f on f.id = p.familia_id
       where ${filtros}
       order by p.titulo, p.id
       limit $4 offset $5`,
      [org, q, familia, porPagina, (pagina - 1) * porPagina, hoyAR(), canal.id, canal.listaPreciosId]);
    return Response.json({ canal: { id: canal.id, nombre: canal.nombre }, pagina, por_pagina: porPagina, total, productos });
  } catch (e) {
    return respuestaError(e);
  }
}
