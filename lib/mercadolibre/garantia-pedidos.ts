// Garantía de los pedidos que ya estaban en Laucen (Fer, 13/10) y control de las notebooks que pasaron a 1 año.
// Sólo LEE de Mercado Libre; lo único que se escribe es la línea del pedido en Laucen (garantia, garantia_origen).
//  - Notebooks: las pocas vendidas hasta ahora quedan con "Garantía del vendedor · 3 meses" (lo que tenían cuando se vendieron).
//  - Vendidas por ML: la garantía que tiene hoy la publicación en ML (si ya no existe, la última copia que guarda Laucen).
//  - El resto: la de la ficha del producto.
// Desde ahora cada venta nueva la graba sola (lib/pedidos/garantia.ts).

import { consulta, una } from "@/lib/erp/base";
import { ml, cuentaDelCanal } from "@/lib/mercadolibre/api";
import { esNotebook } from "@/lib/mercadolibre/es-notebook";
import { garantiaDeTerminos, GARANTIA_NOTEBOOK_ANTERIOR, type TerminoVenta } from "@/lib/garantia";
import { DESCRIPCION_LOTE_GARANTIA } from "@/lib/mercadolibre/garantia-notebooks";

type Fila = { id: string; canal_id: string; titulo: string; categoria_ml: string | null; item_id: string | null; ficha: string | null; copia: TerminoVenta[] | null };

export type ResultadoCompletar = { revisadas: number; notebooks: number; ml: number; copia: number; ficha: number; sinDato: number; pendientes: number; fallos: Record<string, number> };

/** A cada línea de pedido sin garantía grabada, le graba la que corresponde. Repetirlo sólo toma las que faltan. */
export async function completarGarantiaPedidos(org: string, hastaMs: number): Promise<ResultadoCompletar> {
  const filas = await consulta<Fila>(`
    select l.id, p.canal_id, l.titulo, pr.categoria_ml, l.datos_externos #>> '{ml,item_id}' item_id, nullif(trim(pr.garantia), '') ficha,
           (select mi.datos_externos -> 'ml' -> 'sale_terms' from meli_item mi where mi.canal_id = p.canal_id and mi.item_id = l.datos_externos #>> '{ml,item_id}' limit 1) copia
      from pedido_linea l join pedido p on p.id = l.pedido_id
      left join variacion v on v.id = l.variacion_id left join producto pr on pr.id = v.producto_id
     where l.organizacion_id = $1 and l.garantia_origen is null order by l.id`, [org]);
  const r: ResultadoCompletar = { revisadas: filas.length, notebooks: 0, ml: 0, copia: 0, ficha: 0, sinDato: 0, pendientes: 0, fallos: {} };
  const poner = (id: string, garantia: string | null, origen: string) =>
    consulta("update pedido_linea set garantia = $2, garantia_origen = $3 where id = $1 and garantia_origen is null", [id, garantia, origen]);

  // Lo que dice hoy ML de cada publicación vendida: una lectura por cuenta, de a 20.
  const hoy = new Map<string, TerminoVenta[] | null>();     // "canal|item" → condiciones (null: ML no la tiene / no se pudo leer)
  const leidos = new Set<string>();                          // "canal|item" leídos bien (aunque ML diga que no existe)
  const porCanal = new Map<string, Set<string>>();
  for (const f of filas) if (f.item_id && !esNotebook(f.titulo, f.categoria_ml)) (porCanal.get(f.canal_id) ?? porCanal.set(f.canal_id, new Set()).get(f.canal_id)!).add(f.item_id);
  for (const [canal, ids] of porCanal) {
    const cuenta = await cuentaDelCanal(org, Number(canal));
    if (!cuenta || cuenta.estado !== "activa") continue;
    const lista = [...ids];
    for (let i = 0; i < lista.length; i += 20) {
      if (Date.now() > hastaMs - 4_000) break;
      const lote = lista.slice(i, i + 20);
      const x = await ml<{ code: number; body: { id?: string; sale_terms?: TerminoVenta[] } }[]>(cuenta, "GET", `/items?ids=${lote.join(",")}&attributes=id,sale_terms`);
      if (x.status !== 200 || !Array.isArray(x.datos)) { r.fallos[`lectura ${x.status}`] = (r.fallos[`lectura ${x.status}`] ?? 0) + lote.length; continue; }
      // Cada publicación se busca por su id (no por el lugar): lo que ML no devuelve o rechaza queda "leído sin dato" y usa la copia o la ficha.
      for (const id of lote) {
        const e = x.datos.find((y) => y?.body?.id === id);
        if (e?.code === 200) hoy.set(`${canal}|${id}`, e.body.sale_terms ?? []);
        else r.fallos[`publicación ${e?.code ?? "no devuelta"}`] = (r.fallos[`publicación ${e?.code ?? "no devuelta"}`] ?? 0) + 1;
        leidos.add(`${canal}|${id}`);
      }
    }
  }

  for (const f of filas) {
    if (esNotebook(f.titulo, f.categoria_ml)) { await poner(f.id, GARANTIA_NOTEBOOK_ANTERIOR, "ml"); r.notebooks++; continue; }
    if (f.item_id) {
      const clave = `${f.canal_id}|${f.item_id}`;
      if (!leidos.has(clave)) { r.pendientes++; continue; }  // ML no contestó: queda para la próxima vez
      const g = garantiaDeTerminos(hoy.get(clave));
      if (g) { await poner(f.id, g, "ml"); r.ml++; continue; }
      const c = garantiaDeTerminos(f.copia);
      if (c) { await poner(f.id, c, "ml"); r.copia++; continue; }
    }
    if (f.ficha) { await poner(f.id, f.ficha, "ficha"); r.ficha++; continue; }
    await poner(f.id, null, "sin_dato"); r.sinDato++;
  }
  return r;
}

export type Control = { cuenta: string; item_id: string; titulo: string; garantia: string | null; esperada: boolean; motivo?: string };
export type InformeControl = { fecha: string; controles: Control[] };
const ESPERADA = "Garantía del vendedor · 12 meses";

/** Lee de ML una notebook al azar de cada lote de garantía (que ML aceptó) y las que ML rechazó, y guarda lo que dice HOY. */
export async function controlarGarantiaNotebooks(org: string): Promise<InformeControl> {
  const filas = await consulta<{ canal_id: string; cuenta: string; item_id: string; titulo: string | null; estado: string }>(`
    select q.canal_id, c.nombre cuenta, q.item_id, q.antes ->> 'titulo' titulo, q.estado
      from ml_cola q join ml_lote l on l.id = q.lote_id join canal c on c.id = q.canal_id
     where l.organizacion_id = $1 and l.descripcion = $2 and l.estado = 'enviado' and q.estado in ('ok', 'error', 'pendiente')`, [org, DESCRIPCION_LOTE_GARANTIA]);
  const elegidas: typeof filas = [];
  for (const canal of new Set(filas.map((f) => f.canal_id))) {
    const ok = filas.filter((f) => f.canal_id === canal && f.estado === "ok");
    if (ok.length) elegidas.push(ok[Math.floor(Math.random() * ok.length)]);
  }
  elegidas.push(...filas.filter((f) => f.estado !== "ok"));
  const controles: Control[] = [];
  for (const f of elegidas) {
    const cuenta = await cuentaDelCanal(org, Number(f.canal_id));
    if (!cuenta || cuenta.estado !== "activa") { controles.push({ cuenta: f.cuenta, item_id: f.item_id, titulo: f.titulo ?? "", garantia: null, esperada: false, motivo: "cuenta no conectada" }); continue; }
    const x = await ml<{ title?: string; sale_terms?: TerminoVenta[] }>(cuenta, "GET", `/items/${f.item_id}?attributes=title,sale_terms`);
    const g = x.status === 200 ? garantiaDeTerminos(x.datos.sale_terms) : null;
    controles.push({ cuenta: f.cuenta, item_id: f.item_id, titulo: x.datos?.title ?? f.titulo ?? "", garantia: g, esperada: g === ESPERADA,
      ...(x.status !== 200 ? { motivo: `ML contestó ${x.status}` } : {}) });
  }
  const informe: InformeControl = { fecha: new Date().toISOString(), controles };
  await una(`insert into config_org (organizacion_id, clave, valor) values ($1, 'garantia_notebooks_control', $2::jsonb)
             on conflict (coalesce(organizacion_id, ''), clave) do update set valor = excluded.valor, actualizado_ts = now()`, [org, JSON.stringify(informe)]);
  return informe;
}

export function textoControl(i: InformeControl, c: ResultadoCompletar): string {
  const bien = i.controles.filter((x) => x.esperada).length;
  const mal = i.controles.filter((x) => !x.esperada);
  const partes = [`Control en ML: ${bien} de ${i.controles.length} con 1 año.`];
  if (mal.length) partes.push(`Sin 1 año: ${mal.map((x) => `${x.item_id} (${x.garantia ?? x.motivo ?? "sin dato"})`).join(", ")}.`);
  partes.push(`Pedidos: se revisaron ${c.revisadas} líneas: ${c.notebooks} notebooks con 3 meses, ${c.ml + c.copia} con la de ML, ${c.ficha} con la de la ficha, ${c.sinDato} sin dato.`);
  const fallos = Object.entries(c.fallos).map(([k, v]) => `${v} ${k}`).join(", ");
  if (fallos) partes.push(`Lo que ML no dio: ${fallos}.`);
  if (c.pendientes) partes.push(`${c.pendientes} quedaron pendientes (ML no contestó o no alcanzó el tiempo): apretá de nuevo.`);
  return partes.join(" ");
}
