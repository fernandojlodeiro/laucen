// Dos alertas del catálogo que mira el tablero de Mercado Libre y a las que
// lleva la lista de productos (alias `p` = producto):
//   · SIN PUBLICAR: producto activo con stock disponible y ninguna
//     publicación activa en Mercado Libre (plata parada).
//   · SIN FOTOS: producto activo que se vende en la tienda web (tiene precio
//     en la lista de un canal web activo) y no tiene ninguna foto.

/** Stock disponible total del producto (suma por variación y depósito activo; un kit se calcula desde sus componentes). */
export const SQL_DISPONIBLE = `(select coalesce(sum(stock_disponible_deposito(p.organizacion_id, v.id, d.id)), 0)
            from variacion v cross join deposito d
           where v.producto_id = p.id and d.organizacion_id = p.organizacion_id and d.estado = 'activo')`;

export const SQL_SIN_PUBLICAR = `(p.estado = 'activo' and ${SQL_DISPONIBLE} > 0
  and not exists (select 1 from publicacion pu join variacion v on v.id = pu.variacion_id join canal ca on ca.id = pu.canal_id
                   where v.producto_id = p.id and pu.estado = 'activa' and ca.tipo = 'mercadolibre'))`;

export const SQL_SIN_FOTOS = `(p.estado = 'activo'
  and not exists (select 1 from producto_foto f where f.producto_id = p.id)
  and not exists (select 1 from variacion_foto vf join variacion v on v.id = vf.variacion_id where v.producto_id = p.id)
  and exists (select 1 from precio pr join variacion v on v.id = pr.variacion_id join canal ca on ca.lista_precios_id = pr.lista_id
               where v.producto_id = p.id and ca.tipo in ('web_minorista', 'web_mayorista') and ca.estado = 'activo'))`;
