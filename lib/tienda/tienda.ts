// Qué tienda se está mirando: un canal tipo web_minorista identificado por su
// "slug" (canal.config.slug; si no tiene, el nombre del canal en minúsculas
// y con guiones). Las rutas públicas son /tienda/<slug>/…; un dominio propio
// (ej. daitom.com.ar) se carga en Configuración › Tienda web (tienda_dominio,
// lib/tienda/dominios-tienda.ts).

import { consulta, una } from "@/lib/erp/base";

export type ConfigTienda = {
  nombre?: string; slug?: string; color?: string; logo?: string; banner?: string; bajada?: string;
  whatsapp?: string;            // número en formato internacional, sin +: 5493511234567
  whatsapp_token?: never;       // las credenciales de WhatsApp van en la tabla de credenciales, no acá
  email?: string; direccion?: string; horario?: string;
  sin_stock?: "ocultar" | "mostrar";
  // Colores de la tienda (app/tienda/[slug]/tema.ts): cada uno es una variable
  // CSS; vacío = el de siempre. `color` es el viejo "color de la marca" (ya no se usa).
  color_marca?: string;         // franja del encabezado
  color_marca_texto?: string;   // texto sobre la franja
  color_boton?: string;         // botones y links
  color_verde?: string;         // descuentos, cuotas sin interés, envío gratis
  color_fondo?: string;         // fondo de la página
  banner_2?: string; banner_3?: string;  // más imágenes para el carrusel de la portada
  devoluciones?: string;        // política de devoluciones (texto que ve el comprador)
  garantia?: string;            // garantía (texto que ve el comprador)
  sobre_nosotros?: string;      // texto de la página "Sobre nosotros"
};

export type Tienda = {
  organizacionId: string; canalId: number; nombreCanal: string; listaId: number | null; moneda: "ARS" | "USD";
  slug: string; config: ConfigTienda; estado: string;
};

export const slugDe = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tienda";

type Fila = { organizacion_id: string; id: string; nombre: string; lista_precios_id: string | null; moneda: "ARS" | "USD" | null; config: ConfigTienda; estado: string;
  logo_empresa: string | null };

const aTienda = (f: Fila): Tienda => ({
  organizacionId: f.organizacion_id, canalId: Number(f.id), nombreCanal: f.nombre, listaId: f.lista_precios_id ? Number(f.lista_precios_id) : null,
  moneda: f.moneda ?? "ARS", slug: f.config?.slug || slugDe(f.nombre), estado: f.estado,
  // Sin logo propio, la tienda usa el de la empresa (Configuración → Empresa).
  config: { ...(f.config ?? {}), logo: f.config?.logo || f.logo_empresa || undefined },
});

const SQL = `select c.organizacion_id, c.id, c.nombre, c.lista_precios_id, l.moneda_base moneda, c.config, c.estado, e.logo logo_empresa
               from canal c left join lista_precios l on l.id = c.lista_precios_id
               left join empresa e on e.organizacion_id = c.organizacion_id
              where c.tipo = 'web_minorista' and c.estado <> 'archivado'`;

/** La tienda de ese slug (activa o pausada; una pausada muestra "cerrada"). */
export async function tiendaPorSlug(slug: string): Promise<Tienda | null> {
  const filas = await consulta<Fila>(SQL);
  const f = filas.find((x) => (x.config?.slug || slugDe(x.nombre)) === slug);
  return f ? aTienda(f) : null;
}

export async function tiendaDelCanal(org: string, canalId: number): Promise<Tienda | null> {
  const f = await una<Fila>(`${SQL} and c.organizacion_id = $1 and c.id = $2`, [org, canalId]);
  return f ? aTienda(f) : null;
}

export const nombreTienda = (t: Tienda) => t.config.nombre || t.nombreCanal;
export const rutaTienda = (t: Tienda, resto = "") => `/tienda/${t.slug}${resto}`;
