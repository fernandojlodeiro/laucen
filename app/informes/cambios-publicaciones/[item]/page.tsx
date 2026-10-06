// Historial de una publicación de Mercado Libre (Fer, 6/10): todo lo que le
// cambió, lo más nuevo arriba. Junta tres historias de la misma publicación:
//   · sus cambios de estado, precio y stock (meli_item_cambio, los anota el
//     trigger sobre la copia local desde el 3/10);
//   · lo que le mandó Laucen por la cola (ml_cola: estado, precio, stock,
//     atributos, campañas…) con su resultado;
//   · lo que pasó con ella en las campañas de ML (ml_promo_historia);
//   · sus ventas (pedido_linea), con enlace al pedido.
// Columna "Por qué" (Fer, 6/10): una baja de stock o una pausa que llega hasta
// 30 minutos después de una venta del mismo producto (en ésta u otra
// publicación o canal) dice "Venta del pedido N" en el mismo renglón.
// Arriba, "Ver en Mercado Libre ↗" (en otra pestaña).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { paginarEnMemoria } from "@/lib/lista";
import { entrarErp, Pantalla, CAJA, CAJA_TABLA, TABLA, THEAD, TH, TR, TD } from "@/app/componentes/erp";
import { Paginado } from "@/app/componentes/Lista";
import FotosProducto from "@/app/componentes/FotosProducto";
import { SUAVE } from "@/app/botones";
import { formatear } from "@/lib/moneda";
import { TEXTO_ESTADO_ML } from "@/app/catalogo/publicaciones/lista";
import { QUE_PROMO, ESTADOS_PROMO } from "@/app/informes/promociones/formato";
import { CAMPOS_CAMBIO, ORIGENES_CAMBIO, describirCambioMl, enlaceMl } from "../formato";
import { BASE_CAMBIOS } from "../lista";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const ENLACE = "text-[#16577F] hover:underline";
const fechaHora = (d: Date) => new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const TIPO_COLA: Record<string, string> = {
  stock: "Stock", estado: "Estado", precio: "Precio", descuento: "Descuento", campana: "Campaña", atributos: "Atributos",
  crear: "Publicación nueva", factura: "Factura", reclamo: "Reclamo", otro: "Otro",
};
const ESTADO_COLA: Record<string, string> = {
  preparado: "esperando tu clic", pendiente: "en la cola", enviando: "enviándose", ok: "enviado bien", error: "con error", descartado: "descartado",
};

type Linea = { fecha: Date; variacion: string; tipo: "cambio" | "cola" | "campana" | "venta"; que: string; detalle: string; origen: string; pedido?: number;
  /** Por qué: la venta que lo explica. */
  porque?: { texto: string; pedido: number } };

const VENTANA_MS = 30 * 60 * 1000;

/** Lo que mandó la cola, en una línea: "Pausada", "$ 19.836", "12 u.", o los datos tal cual. */
function textoPayload(tipo: string, p: Record<string, unknown> | null): string {
  if (!p) return "";
  if (tipo === "estado" && typeof p.estado === "string") return TEXTO_ESTADO_ML[p.estado] ?? (p.estado === "activa" ? "Activa" : p.estado === "pausada" ? "Pausada" : p.estado);
  if (tipo === "precio" && p.precio != null) return formatear(String(p.precio), "ARS");
  if (tipo === "stock" && p.stock != null) return `${Number(p.stock).toLocaleString("es-AR")} u.`;
  const t = Object.entries(p).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => `${k}: ${v}`).join(" · ");
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

export default async function HistorialPublicacion({ params, searchParams }: { params: Promise<{ item: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_publicaciones_ver");
  const item = decodeURIComponent((await params).item).trim().toUpperCase();
  const sp = await searchParams;
  const org = s.org.id;

  const [pub] = await consulta<{
    cuenta: string; titulo: string | null; estado: string | null; precio: string | null; stock: number | null; permalink: string | null;
    sku: string | null; producto_id: number | null; fotos: string[] | null; variaciones: number;
  }>(`
    select string_agg(distinct ca.nombre, ', ') cuenta, max(mi.titulo) titulo,
           (array_agg(mi.estado order by mi.variation_id))[1] estado, min(mi.precio)::text precio, sum(mi.stock)::int stock, max(mi.permalink) permalink,
           max(coalesce(v.sku, mi.sku)) sku, max(v.producto_id)::int producto_id,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = max(v.producto_id)) fotos,
           count(*) filter (where mi.variation_id <> '')::int variaciones
      from meli_item mi join canal ca on ca.id = mi.canal_id
      left join publicacion pu on pu.id = mi.publicacion_id left join variacion v on v.id = pu.variacion_id
     where mi.organizacion_id = $1 and mi.item_id = $2`, [org, item]);
  const existe = !!pub?.cuenta;

  const [cambios, cola, campanas, ventas] = await Promise.all([
    consulta<{ fecha: Date; variation_id: string; campo: string; antes: string | null; despues: string | null; origen: string }>(`
      select fecha, variation_id, campo, antes, despues, origen from meli_item_cambio
       where organizacion_id = $1 and item_id = $2`, [org, item]),
    consulta<{ fecha: Date; variation_id: string; tipo: string; estado: string; payload: Record<string, unknown> | null; error: string | null; origen: string }>(`
      select coalesce(enviado_ts, creado_ts) fecha, variation_id, tipo, estado, payload, ultimo_error error, origen from ml_cola
       where organizacion_id = $1 and item_id = $2`, [org, item]),
    consulta<{ fecha: Date; nombre: string | null; promocion_id: string; que: string; antes: string | null; despues: string | null; precio_antes: string | null; precio_despues: string | null }>(`
      select fecha, nombre, promocion_id, que, antes, despues, precio_antes::text, precio_despues::text from ml_promo_historia
       where organizacion_id = $1 and item_id = $2`, [org, item]),
    consulta<{ fecha: Date; pedido: number; canal: string; cantidad: number; item: string | null; estado: string }>(`
      select p.fecha, p.id::int pedido, ca.nombre canal, l.cantidad::int, l.datos_externos #>> '{ml,item_id}' item, p.estado
        from pedido_linea l join pedido p on p.id = l.pedido_id join canal ca on ca.id = p.canal_id
       where l.organizacion_id = $1 and (l.datos_externos #>> '{ml,item_id}' = $2 or l.variacion_id in (
             select pu.variacion_id from meli_item mi join publicacion pu on pu.id = mi.publicacion_id where mi.organizacion_id = $1 and mi.item_id = $2))`, [org, item]),
  ]);

  // La venta más reciente del mismo producto hasta 30 minutos antes de un cambio.
  const ventaAntes = (f: Date) => {
    const t = new Date(f).getTime();
    return ventas.filter((v) => v.estado !== "cancelado" && t - new Date(v.fecha).getTime() >= 0 && t - new Date(v.fecha).getTime() <= VENTANA_MS)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
  };
  const porque = (c: (typeof cambios)[number]): Linea["porque"] => {
    const baja = c.campo === "stock" && Number(c.despues) < Number(c.antes);
    const pausa = c.campo === "estado" && c.despues === "paused";
    if (!baja && !pausa) return undefined;
    const v = ventaAntes(c.fecha);
    if (!v) return undefined;
    return { pedido: v.pedido, texto: baja ? "Venta del pedido" : "Sin stock por la venta del pedido" };
  };

  const lineas: Linea[] = [
    ...cambios.map((c): Linea => ({
      fecha: c.fecha, variacion: c.variation_id, tipo: "cambio", que: CAMPOS_CAMBIO[c.campo as keyof typeof CAMPOS_CAMBIO] ?? c.campo,
      detalle: describirCambioMl(c.campo, c.antes, c.despues), origen: ORIGENES_CAMBIO[c.origen] ?? c.origen, porque: porque(c),
    })),
    ...cola.map((c): Linea => ({
      fecha: c.fecha, variacion: c.variation_id, tipo: "cola", que: `Laucen mandó: ${TIPO_COLA[c.tipo] ?? c.tipo}`,
      detalle: [textoPayload(c.tipo, c.payload), `(${ESTADO_COLA[c.estado] ?? c.estado}${c.estado === "error" && c.error ? `: ${c.error}` : ""})`].filter(Boolean).join(" "),
      origen: c.origen === "boton" ? "Laucen (tu clic)" : c.origen === "barrida" ? "Laucen (barrida)" : "Laucen (automático)",
    })),
    ...campanas.map((c): Linea => {
      const est = (x: string | null) => (x ? ESTADOS_PROMO[x] ?? x : "—");
      const det = c.que === "item_precio" || (c.precio_antes || c.precio_despues)
        ? `${c.precio_antes ? formatear(c.precio_antes, "ARS") : "—"} → ${c.precio_despues ? formatear(c.precio_despues, "ARS") : "—"}`
        : c.antes || c.despues ? `${est(c.antes)} → ${est(c.despues)}` : "";
      return {
        fecha: c.fecha, variacion: "", tipo: "campana", que: `Campaña: ${c.nombre ?? c.promocion_id}`,
        detalle: [QUE_PROMO[c.que] ?? c.que, det].filter(Boolean).join(" · "), origen: "Mercado Libre",
      };
    }),
    // Sólo las ventas de ESTA publicación; las del mismo producto en otras aparecen como "Por qué".
    ...ventas.filter((v) => v.item === item).map((v): Linea => ({
      fecha: v.fecha, variacion: "", tipo: "venta", pedido: v.pedido, que: "Venta",
      detalle: `${v.cantidad} u.${v.estado === "cancelado" ? " (cancelado)" : ""}`, origen: v.canal,
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  const pagina = paginarEnMemoria(lineas, sp);
  const conVariacion = lineas.some((l) => l.variacion);

  return (
    <Pantalla titulo={`Historial de ${item}`}
      camino={[{ texto: item }]}
      subtitulo="Todo lo que le cambió a esta publicación, lo más nuevo arriba: estado, precio y stock (desde el 3/10/2026), lo que le mandó Laucen, sus ventas y lo que pasó con ella en las campañas de Mercado Libre. «Por qué» dice la venta que explica una baja de stock o una pausa."
      acciones={<a href={enlaceMl(item, pub?.permalink)} target="_blank" rel="noopener noreferrer" className={SUAVE}>Ver en Mercado Libre ↗</a>}>
      {existe ? (
        <div className={`${CAJA} mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm`}>
          {pub.producto_id && <FotosProducto fotos={pub.fotos} titulo={pub.titulo ?? ""} />}
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{pub.titulo ?? "—"}</div>
            <div className="text-xs text-[#5C6B76]">
              {pub.cuenta}
              {pub.sku && <> · SKU {pub.producto_id ? <Link href={`/catalogo/productos/${pub.producto_id}`} className={ENLACE}>{pub.sku}</Link> : pub.sku}</>}
              {pub.variaciones > 0 && <> · {pub.variaciones} variaciones</>}
            </div>
          </div>
          <div className="text-xs"><span className="text-[#5C6B76]">Hoy: </span><b>{TEXTO_ESTADO_ML[pub.estado ?? ""] ?? pub.estado ?? "—"}</b></div>
          <div className="text-xs"><span className="text-[#5C6B76]">Precio: </span><b>{pub.precio ? formatear(pub.precio, "ARS") : "—"}</b></div>
          <div className="text-xs"><span className="text-[#5C6B76]">Stock: </span><b>{pub.stock ?? "—"}</b></div>
        </div>
      ) : (
        <p className={`${CAJA} mb-3 text-sm text-[#5C6B76]`}>Esta publicación no está en las cuentas de Mercado Libre conectadas a Laucen.</p>
      )}
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Fecha y hora</th>
              {conVariacion && <th className={TH}>Variación</th>}
              <th className={TH}>Qué</th>
              <th className={TH}>Detalle</th>
              <th className={TH}>Quién</th>
              <th className={TH}>Por qué</th>
            </tr>
          </thead>
          <tbody>
            {pagina.map((l, i) => (
              <tr key={i} className={TR}>
                <td className={`${TD} whitespace-nowrap`}>{fechaHora(l.fecha)}</td>
                {conVariacion && <td className={`${TD} font-mono whitespace-nowrap`}>{l.variacion || "—"}</td>}
                <td className={`${TD} whitespace-nowrap font-semibold`}>{l.que}</td>
                <td className={TD}>
                  {l.pedido && <Link href={`/ventas/pedidos/${l.pedido}`} className={`${ENLACE} font-semibold`}>Pedido {l.pedido}</Link>}
                  {l.pedido && l.detalle ? " · " : ""}{l.detalle || (l.pedido ? "" : "—")}
                </td>
                <td className={`${TD} whitespace-nowrap text-[#5C6B76]`}>{l.origen}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  {l.porque ? <>{l.porque.texto} <Link href={`/ventas/pedidos/${l.porque.pedido}`} className={`${ENLACE} font-semibold`}>{l.porque.pedido}</Link></> : ""}
                </td>
              </tr>
            ))}
            {!lineas.length && <tr><td colSpan={6} className={`${TD} text-center text-[#5C6B76] py-6`}>No hay nada anotado de esta publicación.</td></tr>}
          </tbody>
        </table>
      </div>
      <Paginado total={lineas.length} />
      <p className="text-[11px] text-[#5C6B76] mt-1">
        Para ver los cambios de todas las publicaciones juntas, <Link href={BASE_CAMBIOS} className={ENLACE}>Cambios en publicaciones</Link>.
      </p>
    </Pantalla>
  );
}
