// Dos alertas del catálogo que mira el tablero de Mercado Libre y a las que
// lleva la lista de productos (alias `p` = producto):
//   · SIN PUBLICAR: producto activo con stock disponible y ninguna
//     publicación activa en Mercado Libre (plata parada).
//   · SIN FOTOS: producto activo que se vende en la tienda web (publicado en
//     un canal web activo y con precio en él, mirando el precio que realmente ve la tienda: las
//     listas web se derivan de la principal y no tienen filas propias) y no tiene ninguna foto.

/** Stock disponible total del producto (suma por variación y depósito activo; un kit se calcula desde sus componentes). */
export const SQL_DISPONIBLE = `(select coalesce(sum(stock_disponible_deposito(p.organizacion_id, v.id, d.id)), 0)
            from variacion v cross join deposito d
           where v.producto_id = p.id and d.organizacion_id = p.organizacion_id and d.estado = 'activo')`;

export const SQL_SIN_PUBLICAR = `(p.estado = 'activo' and ${SQL_DISPONIBLE} > 0
  and not exists (select 1 from publicacion pu join variacion v on v.id = pu.variacion_id join canal ca on ca.id = pu.canal_id
                   where v.producto_id = p.id and pu.estado = 'activa' and ca.tipo = 'mercadolibre'))`;

/** Igual que SQL_SIN_PUBLICAR pero para UNA cuenta de ML (`canalSql` = expresión con el id del canal). */
export const sqlSinPublicarEnCanal = (canalSql: string) => `(p.estado = 'activo' and ${SQL_DISPONIBLE} > 0
  and not exists (select 1 from publicacion pu join variacion v on v.id = pu.variacion_id
                   where v.producto_id = p.id and pu.estado = 'activa' and pu.canal_id = ${canalSql}))`;

export const SQL_SIN_FOTOS = `(p.estado = 'activo'
  and not exists (select 1 from producto_foto f where f.producto_id = p.id)
  and not exists (select 1 from variacion_foto vf join variacion v on v.id = vf.variacion_id where v.producto_id = p.id)
  and exists (select 1 from variacion v join canal ca on ca.organizacion_id = p.organizacion_id and ca.tipo in ('web_minorista', 'web_mayorista') and ca.estado = 'activo'
               join publicacion pw on pw.variacion_id = v.id and pw.canal_id = ca.id and pw.estado = 'activa'
               cross join lateral precio_de(p.organizacion_id, v.id, ca.lista_precios_id) pr
               where v.producto_id = p.id and v.estado = 'activa' and pr.venta_ars > 0))`;
