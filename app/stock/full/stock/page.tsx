// Stock › Envíos a Full › Stock en Full: por producto y cuenta, lo que Mercado Libre tiene en Full
// (disponible y no disponible, de la última lectura) al lado de lo que Laucen tiene en ese depósito,
// lo que está en camino y cuántos días de venta cubre. «Leer Full ahora» lee de ML y concilia
// (lib/full/lectura.ts).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { paginarEnMemoria, ordenarEnMemoria } from "@/lib/lista";
import { coincideBusqueda } from "@/lib/busqueda";
import { SUAVE } from "@/app/botones";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { entrarErp, Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { formatear } from "@/lib/moneda";
import { fechaHora } from "@/app/ventas/formato";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { MINUTOS_QUIETO } from "@/lib/full/lectura";
import { tamanosDe, tarifas, TAMANOS, DIAS_STOCK_ANTIGUO, type Tamano } from "@/lib/full/costos";
import { PestanasFull } from "../piezas";
import { accionLeerFull } from "../acciones";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };
type Fila = {
  clave: string; canal_id: number; cuenta: string; variacion_id: number | null; producto_id: number | null; sku: string | null; titulo: string | null;
  fotos: string[] | null; inventory_id: string | null; item_id: string | null; ml: number | null; no_disponible: number | null;
  detalle: { status: string; quantity: number }[] | null; laucen: number; en_camino: number; vendidas: number; leido_ts: Date | null; error: string | null;
};

const DIAS = 60;
const ESTADOS_ML: Record<string, string> = {
  transfer: "en traslado", damaged: "dañado", lost: "perdido", withdrawal: "en retiro", internal_process: "en proceso interno",
  noFiscalCoverage: "sin cobertura fiscal", not_supported: "no admitido", quarantine: "en revisión", in_review: "en revisión",
};

export default async function StockFull({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("full_ver");
  const sp = await searchParams;
  const todas = await consulta<Fila>(`
    with deps as (
      select d.id deposito, cd.canal_id, c.nombre cuenta from deposito d join canal_deposito cd on cd.deposito_id = d.id join canal c on c.id = cd.canal_id
       where d.organizacion_id = $1 and d.tipo = 'full_ml' and d.estado = 'activo'
    ), vs as (
      select dp.deposito, dp.canal_id, dp.cuenta, fs.variacion_id, fs.inventory_id from deps dp join full_stock fs on fs.canal_id = dp.canal_id
      union
      select dp.deposito, dp.canal_id, dp.cuenta, s.variacion_id, null from deps dp join ubicacion u on u.deposito_id = dp.deposito join stock s on s.ubicacion_id = u.id
       where s.cantidad <> 0 or s.reservado <> 0
      union
      select dp.deposito, dp.canal_id, dp.cuenta, l.variacion_id, null from deps dp join full_envio e on e.deposito_full_id = dp.deposito and e.estado = 'despachado'
        join full_envio_linea l on l.envio_id = e.id where l.cantidad > l.recibido + l.faltante
    ), una as (
      select distinct on (canal_id, coalesce(variacion_id::text, inventory_id)) * from vs order by canal_id, coalesce(variacion_id::text, inventory_id), inventory_id nulls last
    )
    select x.canal_id || ':' || coalesce(x.variacion_id::text, x.inventory_id) clave, x.canal_id::int, x.cuenta, x.variacion_id::int, v.producto_id::int, v.sku,
           titulo_variacion(v.id) titulo, (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = v.producto_id) fotos,
           coalesce(x.inventory_id, (select fs.inventory_id from full_stock fs where fs.canal_id = x.canal_id and fs.variacion_id = x.variacion_id limit 1)) inventory_id,
           (select fs.item_id from full_stock fs where fs.canal_id = x.canal_id and (fs.variacion_id = x.variacion_id or fs.inventory_id = x.inventory_id) limit 1) item_id,
           (select sum(fs.disponible)::int from full_stock fs where fs.canal_id = x.canal_id and (fs.variacion_id = x.variacion_id or (x.variacion_id is null and fs.inventory_id = x.inventory_id))) ml,
           (select sum(fs.no_disponible)::int from full_stock fs where fs.canal_id = x.canal_id and (fs.variacion_id = x.variacion_id or (x.variacion_id is null and fs.inventory_id = x.inventory_id))) no_disponible,
           (select jsonb_agg(d) from full_stock fs, jsonb_array_elements(fs.detalle) d where fs.canal_id = x.canal_id and (fs.variacion_id = x.variacion_id or (x.variacion_id is null and fs.inventory_id = x.inventory_id))) detalle,
           case when x.variacion_id is null then 0 else stock_disponible_deposito($1, x.variacion_id, x.deposito) end laucen,
           coalesce((select sum(l.cantidad - l.recibido - l.faltante) from full_envio_linea l join full_envio e on e.id = l.envio_id
                      where e.deposito_full_id = x.deposito and e.estado = 'despachado' and l.variacion_id = x.variacion_id), 0)::int en_camino,
           coalesce((select sum(pl.cantidad) from pedido pe join pedido_linea pl on pl.pedido_id = pe.id
                      where pe.organizacion_id = $1 and pe.canal_id = x.canal_id and pl.variacion_id = x.variacion_id
                        and pe.estado not in ('presupuesto', 'nuevo', 'cancelado', 'devuelto') and pe.fecha >= now() - make_interval(days => $2)), 0)::int vendidas,
           (select max(fs.leido_ts) from full_stock fs where fs.canal_id = x.canal_id and (fs.variacion_id = x.variacion_id or fs.inventory_id = x.inventory_id)) leido_ts,
           (select string_agg(fs.error, ' · ') from full_stock fs where fs.canal_id = x.canal_id and (fs.variacion_id = x.variacion_id or fs.inventory_id = x.inventory_id)) error
      from una x left join variacion v on v.id = x.variacion_id
     order by v.sku nulls last, x.inventory_id`, [s.org.id, DIAS]);
  // Tamaño de Full (el que midió ML, y el de la ficha), costo por día y antigüedad de lo que hay en Full.
  const tars = new Map((await tarifas(s.org.id)).map((t) => [t.tamano, t.almacenamiento_dia]));
  const tamDe = new Map<string, { ml: Tamano | null; ficha: Tamano | null; usado: Tamano | null }>();
  for (const canal of [...new Set(todas.map((f) => f.canal_id))]) {
    const m = await tamanosDe(s.org.id, canal, todas.filter((f) => f.canal_id === canal && f.variacion_id).map((f) => f.variacion_id!));
    for (const [v, t] of m) tamDe.set(`${canal}:${v}`, t);
  }
  // Antigüedad: lo que hay se supone de los envíos recibidos más nuevos (lo viejo sale primero).
  const recepciones = await consulta<{ canal_id: number; v: number; recibido: number; fecha: Date }>(`
    select e.canal_id::int, l.variacion_id::int v, l.recibido, coalesce(e.recibido_ts, e.cerrado_ts, e.despachado_ts) fecha
      from full_envio_linea l join full_envio e on e.id = l.envio_id
     where e.organizacion_id = $1 and l.recibido > 0 order by fecha desc`, [s.org.id]);
  const diasEnFull = (f: Fila) => {
    if (!f.variacion_id || f.laucen <= 0) return null;
    let quedan = f.laucen, fecha: Date | null = null;
    for (const r of recepciones) {
      if (r.canal_id !== f.canal_id || r.v !== f.variacion_id) continue;
      fecha = r.fecha; quedan -= r.recibido;
      if (quedan <= 0) break;
    }
    return fecha ? Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000) : null;
  };
  const tamano = (f: Fila) => (f.variacion_id ? tamDe.get(`${f.canal_id}:${f.variacion_id}`) ?? null : null);
  const porDia = (f: Fila) => { const t = tamano(f)?.usado; return t ? (Math.max(f.laucen, 0) * (tars.get(t) ?? 0)) : null; };
  const lecturas = await consulta<{ cuenta: string; leido_ts: Date }>(`
    select c.nombre cuenta, fl.leido_ts from full_lectura fl join canal c on c.id = fl.canal_id where fl.organizacion_id = $1 order by c.nombre`, [s.org.id]);

  const q = sp.q ?? "";
  const filtradas = todas.filter((f) => coincideBusqueda([f.sku, f.titulo, f.inventory_id, f.item_id, f.cuenta], q, sp.contiene !== "1"));
  const cobertura = (f: Fila) => (f.vendidas > 0 ? Math.round(((f.ml ?? f.laucen) / (f.vendidas / DIAS)) * 10) / 10 : null);
  const ordenadas = ordenarEnMemoria(filtradas, sp, {
    sku: (f) => f.sku, cuenta: (f) => f.cuenta, ml: (f) => f.ml, no_disponible: (f) => f.no_disponible, laucen: (f) => f.laucen,
    diferencia: (f) => (f.ml ?? 0) - f.laucen, en_camino: (f) => f.en_camino, vendidas: (f) => f.vendidas, cobertura: (f) => cobertura(f), tamano: (f) => tamano(f)?.usado ?? null, por_dia: (f) => porDia(f), dias: (f) => diasEnFull(f), leido: (f) => (f.leido_ts ? new Date(f.leido_ts).getTime() : null),
  });
  const filas = paginarEnMemoria(ordenadas, sp);
  const n = (x: number | null | undefined) => (x == null ? "—" : formatearNumero(x, "entero"));

  return (
    <Pantalla titulo="Envíos a Full" subtitulo="Lo que Mercado Libre tiene en Full de cada cuenta, al lado de lo que dice Laucen."
      acciones={<BotonTarea accion={accionLeerFull} tipo="full-lectura" texto="Leer Full ahora" clase={SUAVE} />}>
      <Avisos sp={sp} />
      <PestanasFull org={s.org.id} activa="stock" />
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Se lee solo cada media hora. {lecturas.length ? `Última lectura: ${lecturas.map((l) => `${l.cuenta} ${fechaHora(l.leido_ts)}`).join(" · ")}.` : "Todavía no se leyó nunca."}{" "}
        Cuando lo que dice Mercado Libre se queda quieto {MINUTOS_QUIETO} minutos y no coincide con Laucen, Laucen se iguala: primero recibe lo que está en camino y el resto lo ajusta.
      </p>
      <div className="mb-3"><BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="Buscar por SKU, título, Código ML o publicación" limpiar={["p"]} /></div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="sku" porDefecto>Producto</ThOrden><ThOrden col="cuenta">Cuenta</ThOrden><th className="py-1.5 px-2 text-left font-semibold">Código ML</th>
              <ThOrden col="ml" n>Disponible en ML</ThOrden><ThOrden col="no_disponible" n>No disponible en ML</ThOrden><ThOrden col="laucen" n>En Full según Laucen</ThOrden>
              <ThOrden col="diferencia" n>Diferencia</ThOrden><ThOrden col="en_camino" n>En camino</ThOrden><ThOrden col="vendidas" n>Vendidas ({DIAS} días)</ThOrden>
              <ThOrden col="cobertura" n>Días que cubre</ThOrden><ThOrden col="tamano">Tamaño en Full</ThOrden><ThOrden col="por_dia" n>Cuesta por día</ThOrden>
              <ThOrden col="dias" n>Días en Full</ThOrden><ThOrden col="leido" n>Lectura</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={14} className={`${TD} text-[#5C6B76]`}>{q ? "Nada con esa búsqueda." : "Todavía no hay nada en Full. Aparece cuando se despacha el primer envío o Mercado Libre muestra stock en Full."}</td></tr>}
            {filas.map((f) => {
              const dif = f.ml == null ? null : f.ml - f.laucen;
              const cob = cobertura(f);
              return (
                <tr key={f.clave} className={TR} data-canal={f.canal_id}>
                  <td className={`${TD} min-w-56 max-w-80`}>
                    <div className="flex items-start gap-2">
                      <FotosProducto fotos={f.fotos} titulo={f.titulo ?? ""} />
                      <div className="min-w-0">
                        {f.producto_id ? <Link href={`/catalogo/productos/${f.producto_id}`} className="font-mono text-[#16577F] hover:underline">{f.sku}</Link> : <span className="text-[#8a6100]">Sin producto en Laucen</span>}
                        <TituloCorto titulo={f.titulo} />
                        {f.item_id && <span className="block font-mono text-[10px]"><Link href={historialPublicacion(f.item_id)} className="text-[#16577F] hover:underline">{f.item_id}</Link> <a href={enlaceMl(f.item_id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a></span>}
                      </div>
                    </div>
                  </td>
                  <td className={TD}>{f.cuenta}</td>
                  <td className={`${TD} font-mono`}>{f.inventory_id ?? "—"}</td>
                  <td className={TDN}>{n(f.ml)}</td>
                  <td className={TDN} title={(f.detalle ?? []).map((d) => `${d.quantity} ${ESTADOS_ML[d.status] ?? d.status}`).join(", ")}>
                    {f.no_disponible ? <>{n(f.no_disponible)}<span className="block text-[10px] text-[#5C6B76]">{(f.detalle ?? []).map((d) => `${d.quantity} ${ESTADOS_ML[d.status] ?? d.status}`).join(", ")}</span></> : n(f.no_disponible)}
                  </td>
                  <td className={TDN}>{n(f.laucen)}</td>
                  <td className={`${TDN} ${dif ? "text-[#8a6100] font-bold" : ""}`}>{dif == null ? "—" : dif > 0 ? `+${n(dif)}` : n(dif)}</td>
                  <td className={TDN}>{f.en_camino ? n(f.en_camino) : ""}</td>
                  <td className={TDN}>{n(f.vendidas)}</td>
                  <td className={TDN}>{cob == null ? "—" : formatearNumero(cob, "decimal")}</td>
                  <td className={TD}>{(() => {
                    const t = tamano(f);
                    if (!t?.usado) return <span className="text-[#8a6100]" title="Faltan medidas o peso del paquete">sin medidas</span>;
                    return <>{TAMANOS[t.usado].texto}{t.ml && t.ficha && t.ml !== t.ficha && (
                      <span className="block text-[10px] text-[#C03420]" title="Mercado Libre midió el paquete distinto de lo cargado en la ficha">según la ficha: {TAMANOS[t.ficha].texto}</span>)}</>;
                  })()}</td>
                  <td className={TDN}>{porDia(f) != null ? formatear(porDia(f)!, "ARS") : "—"}</td>
                  <td className={`${TDN} ${(diasEnFull(f) ?? 0) >= DIAS_STOCK_ANTIGUO - 20 ? "text-[#C03420] font-bold" : ""}`}
                    title={(diasEnFull(f) ?? 0) >= DIAS_STOCK_ANTIGUO - 20 ? `Desde los ${DIAS_STOCK_ANTIGUO} días Mercado Libre cobra además stock antiguo` : undefined}>{n(diasEnFull(f))}</td>
                  <td className={`${TDN} text-[11px]`}>{f.error ? <span className="text-[#C03420]" title={f.error}>Error</span> : f.leido_ts ? fechaHora(f.leido_ts) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={ordenadas.length} />
    </Pantalla>
  );
}
