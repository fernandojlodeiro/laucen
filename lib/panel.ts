// Las tarjetas del panel de inicio (orden 136, §2 bis): cuestiones
// pendientes. Qué muestra exactamente se define con Fer; acá está la
// estructura. Para agregar, sacar o reordenar una tarjeta se toca esta lista.
// Una tarjeta sin `calcular` se muestra como "próximamente".

import { consulta } from "@/lib/erp/base";
import type { PermisoKey } from "@/lib/permisos";

export type Renglon = { texto: string; valor: string | number; href?: string; alerta?: boolean };
export type Tarjeta = {
  id: string;
  titulo: string;
  permiso?: PermisoKey;
  href?: string;
  calcular?: (org: string) => Promise<Renglon[]>;
};

const ETIQUETAS: Record<string, string> = {
  nuevo: "Nuevos", pagado: "Pagados (sin preparar)", en_preparacion: "En preparación",
  preparado: "Preparados (sin despachar)", despachado: "Despachados",
};

export const TARJETAS: Tarjeta[] = [
  {
    id: "pedidos_por_estado", titulo: "Pedidos abiertos", permiso: "pedidos_ver", href: "/ventas/pedidos",
    calcular: async (org) => {
      const filas = await consulta<{ estado: string; n: number }>(`
        select estado, count(*)::int n from pedido
         where organizacion_id = $1 and estado in ('nuevo', 'pagado', 'en_preparacion', 'preparado', 'despachado')
         group by estado`, [org]);
      const por = new Map(filas.map((f) => [f.estado, f.n]));
      return Object.entries(ETIQUETAS).map(([estado, texto]) => ({
        texto, valor: por.get(estado) ?? 0, href: `/ventas/pedidos?estado=${estado}`,
        alerta: (estado === "pagado" || estado === "preparado") && (por.get(estado) ?? 0) > 0,
      }));
    },
  },
  {
    id: "stock_bajo_minimo", titulo: "Productos bajo el stock mínimo", permiso: "stock_ver", href: "/stock/consulta?filtro=bajo_minimo",
    calcular: async (org) => {
      const filas = await consulta<{ id: number; sku: string; titulo: string; disponible: number; minimo: number }>(`
        select v.id::int, v.sku, titulo_variacion(v.id) titulo, coalesce(sum(s.cantidad - s.reservado), 0)::int disponible, p.stock_minimo minimo
          from variacion v join producto p on p.id = v.producto_id
          left join stock s on s.variacion_id = v.id
         where v.organizacion_id = $1 and p.stock_minimo is not null and p.estado = 'activo' and v.estado = 'activa'
           and not es_kit(v.id)
         group by v.id, p.stock_minimo
        having coalesce(sum(s.cantidad - s.reservado), 0) < p.stock_minimo
         order by 4 limit 8`, [org]);
      if (!filas.length) return [{ texto: "Ninguno (los productos sin stock mínimo cargado no cuentan)", valor: "" }];
      return filas.map((f) => ({ texto: `${f.sku} · ${f.titulo}`, valor: `${f.disponible} / ${f.minimo}`, href: `/stock/consulta?v=${f.id}`, alerta: true }));
    },
  },
  {
    id: "vendido_sin_stock", titulo: "Vendido sin stock (disponible negativo)", permiso: "stock_ver", href: "/stock/consulta?filtro=negativo",
    calcular: async (org) => {
      const filas = await consulta<{ id: number; sku: string; titulo: string; disponible: number }>(`
        select v.id::int, v.sku, titulo_variacion(v.id) titulo, sum(s.cantidad - s.reservado)::int disponible
          from stock s join variacion v on v.id = s.variacion_id
         where s.organizacion_id = $1 group by v.id having sum(s.cantidad - s.reservado) < 0 order by 4 limit 8`, [org]);
      if (!filas.length) return [{ texto: "Nada", valor: "" }];
      return filas.map((f) => ({ texto: `${f.sku} · ${f.titulo}`, valor: f.disponible, href: `/stock/consulta?v=${f.id}`, alerta: true }));
    },
  },
  {
    id: "preguntas", titulo: "Preguntas sin responder", permiso: "preguntas_ver", href: "/ventas/preguntas",
    calcular: async (org) => {
      const filas = await consulta<{ texto: string; fecha: Date; titulo: string | null }>(`
        select q.texto, q.fecha, coalesce(i.titulo, q.item_id) titulo from meli_pregunta q
          left join lateral (select titulo from meli_item where canal_id = q.canal_id and item_id = q.item_id limit 1) i on true
         where q.organizacion_id = $1 and q.estado = 'UNANSWERED' order by q.fecha limit 6`, [org]);
      if (!filas.length) return [{ texto: "Ninguna", valor: "" }];
      const hace = (d: Date) => { const h = Math.round((Date.now() - d.getTime()) / 3600_000); return h < 1 ? "recién" : h < 24 ? `${h} h` : `${Math.round(h / 24)} d`; };
      return filas.map((f) => ({ texto: `${f.texto} · ${f.titulo}`, valor: hace(f.fecha), href: "/ventas/preguntas", alerta: Date.now() - f.fecha.getTime() > 3600_000 }));
    },
  },
  { id: "facturas", titulo: "Facturas pendientes" },
  {
    id: "envios", titulo: "Envíos para despachar", permiso: "envios_ver", href: "/ventas/envios",
    calcular: async (org) => {
      const f = await consulta<{ hoy: number; vencidos: number; total: number; sin_imprimir: number }>(`
        select count(*) filter (where despachar_antes::date = (now() at time zone 'America/Argentina/Buenos_Aires')::date)::int hoy,
               count(*) filter (where despachar_antes < now())::int vencidos,
               count(*)::int total,
               count(*) filter (where etiqueta_impresa_ts is null)::int sin_imprimir
          from envio where organizacion_id = $1 and estado in ('ready_to_ship', 'handling') and coalesce(logistica, '') <> 'fulfillment'`, [org]);
      const x = f[0];
      return [
        { texto: "Para despachar", valor: x.total, href: "/ventas/envios" },
        { texto: "Vencen hoy", valor: x.hoy, href: "/ventas/envios", alerta: x.hoy > 0 },
        { texto: "Atrasados", valor: x.vencidos, href: "/ventas/envios", alerta: x.vencidos > 0 },
        { texto: "Etiquetas sin imprimir", valor: x.sin_imprimir, href: "/ventas/envios" },
      ];
    },
  },
  {
    id: "sin_vincular", titulo: "Ventas de artículos sin vincular", permiso: "publicaciones_ver", href: "/catalogo/publicaciones/ml",
    calcular: async (org) => {
      const f = await consulta<{ n: number }>("select count(*)::int n from pedido where organizacion_id = $1 and sin_vincular and estado not in ('cancelado', 'entregado')", [org]);
      return [{ texto: "Pedidos abiertos con artículos que no están vinculados a un producto (no descuentan stock)", valor: f[0].n, href: "/ventas/pedidos", alerta: f[0].n > 0 }];
    },
  },
  { id: "reclamos", titulo: "Reclamos y devoluciones abiertos" },
];
