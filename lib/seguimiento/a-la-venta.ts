// ¿El producto está a la venta? (Fer, 22/10): con al menos una publicación activa en una cuenta de Mercado Libre y stock
// disponible. Sólo las seguidas de esos productos se releen solas con lo que cuesta (Apify); las de los demás quedan de
// referencia y se leen a pedido («Leer ahora»). Alias del producto: `p`.

import { SQL_DISPONIBLE } from "@/lib/catalogo-alertas";

/** Tiene alguna publicación activa en Mercado Libre. */
export const SQL_CON_ML_ACTIVA = `exists (select 1 from publicacion pu join variacion v on v.id = pu.variacion_id join canal ca on ca.id = pu.canal_id
                 where v.producto_id = p.id and pu.estado = 'activa' and ca.tipo = 'mercadolibre')`;

export const SQL_A_LA_VENTA = `(${SQL_CON_ML_ACTIVA} and ${SQL_DISPONIBLE} > 0)`;

/** Notebooks (Fer, 22/10): sus seguimientos no se importan. Por la familia «Notebooks» o el título. */
export const SQL_ES_NOTEBOOK = `(p.titulo ~* '^\\s*notebook' or exists (select 1 from familia f where f.id = p.familia_id and lower(f.nombre) in ('notebooks', 'notebook')))`;

/** Un título de notebook (el de la publicación de enfrente, para lo que no tiene producto). Pura. */
export const esTituloNotebook = (t: string | null | undefined) => /^\s*(notebook|laptop)\b/i.test(t ?? "");
