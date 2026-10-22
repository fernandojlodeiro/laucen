// Títulos de Mercado Libre con criterio (Fer, 22/10). Cada cuenta lleva un título distinto del mismo
// producto (pauta del 10/10), pero mezclar las palabras a ciegas lo rompía: «Notebook 7 Ram Ssd 8gb Amd
// 3700u Hp Windows Ryzen 256gb» separa «Ryzen 7», «8gb Ram» y «256gb Ssd». Acá la IA varía el ORDEN DE
// LOS BLOQUES entre cuentas (qué es + marca + modelo + datos clave), nunca parte un bloque, y deja la
// primera palabra (qué es) adelante.
//
//   · titulosIa: los títulos de varias cuentas a la vez (las que no se pueden cambiar van como fijas,
//     para que los demás sean distintos de ellas). La usan publicar-todas.ts y precios-ml/faltantes.ts.
//   · prepararRevisionTitulos: revisa con la IA los títulos de una cuenta en los productos de ML sin
//     ventas y prepara un lote (con el clic de Fer) que cambia sólo los mal armados. En un producto de ML
//     el título sale del family_name: cambiándolo en una publicación, ML lo pasa a todas las del producto.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { pedirClaude, jsonDe } from "@/lib/claude";
import { cuentaDelCanal } from "@/lib/mercadolibre/api";
import { encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";

export const LARGO_TITULO_ML = 60;

const SISTEMA = `Armás y revisás títulos de publicaciones de Mercado Libre Argentina de una tienda de electrónica, informática y componentes.
Cada cuenta de la tienda tiene que mostrar el MISMO producto con un título DISTINTO, armado con criterio.
Reglas:
- La primera palabra (qué es el producto: "Notebook", "Placa", "Fuente", "Módulo"…) va siempre adelante.
- El título se arma con BLOQUES que nunca se separan ni se cortan: marca + línea + número de modelo ("Hp 15-ef0022nr", "Ryzen 7 3700u", "Core I5-1035g1"), número con su unidad ("8gb", "512 GB", "220v", "4000w", "15.6 Pulgadas"), un dato con su nombre ("8gb Ram", "256gb Ssd", "Pantalla 15.6"), y las palabras de un mismo concepto ("Fuente De Alimentación", "Reloj Tiempo Real").
- Entre cuentas se cambia el ORDEN DE LOS BLOQUES (después de la primera palabra) o se usa un sinónimo común; nunca se mezclan palabras sueltas de distintos bloques.
- Mismo contenido: no inventes ni saques datos clave (marca, modelo, capacidades, medidas, cantidades de un pack).
- Hasta ${LARGO_TITULO_ML} letras. Sin palabras de promoción ("oferta", "envío gratis", "original", "el mejor"), sin signos raros, sin todo en mayúsculas.
- Todos los títulos, distintos entre sí.
- Las cuentas marcadas FIJA no se cambian: devolvé su título tal cual, pero tenelas en cuenta para que los demás sean distintos.
- En una cuenta marcada REVISAR, si el título actual está bien armado (bloques enteros, en un orden lógico) y es distinto de los otros, devolvelo tal cual; si no, corregilo.
- Una cuenta marcada NUEVA todavía no tiene título: armale uno.
Devolvé SOLO un JSON: {"titulos": {"<clave de la cuenta>": "título", ...}} con todas las claves que te paso.`;

export type CuentaTitulo = { clave: string; nombre: string; titulo: string | null; modo: "fija" | "revisar" | "nueva" };

/** Los títulos de cada cuenta según las reglas (null si la IA no contestó). Los de las fijas vuelven como estaban. */
export async function titulosIa(producto: { titulo: string; marca?: string | null; modelo?: string | null }, cuentas: CuentaTitulo[]): Promise<Record<string, string> | null> {
  if (!cuentas.some((c) => c.modo !== "fija")) return null;
  const entrada = [
    `PRODUCTO: ${producto.titulo}`,
    producto.marca ? `Marca: ${producto.marca}` : null,
    producto.modelo ? `Modelo: ${producto.modelo}` : null,
    "CUENTAS:",
    ...cuentas.map((c) => `- clave ${c.clave} (${c.nombre}) ${c.modo.toUpperCase()}: ${c.titulo ?? "(sin título)"}`),
  ].filter(Boolean).join("\n");
  const r = await pedirClaude({ system: SISTEMA, contenido: entrada, maxTokens: 1500, modelo: "medio", effort: "low" });
  if ("error" in r) { console.error("[títulos IA]", r.error); return null; }
  const j = jsonDe<{ titulos?: Record<string, unknown> }>(r.texto);
  if (!j?.titulos) return null;
  const res: Record<string, string> = {};
  for (const c of cuentas) {
    const t = j.titulos[c.clave];
    if (c.modo === "fija" && c.titulo) res[c.clave] = c.titulo;
    else if (typeof t === "string" && t.trim()) res[c.clave] = t.trim().replace(/\s+/g, " ").slice(0, LARGO_TITULO_ML);
  }
  return res;
}

/** Los títulos que tiene hoy el producto en las otras cuentas (el family_name de su publicación común), para que el
 *  de esta cuenta sea distinto. */
export async function titulosDeOtrasCuentas(org: string, sku: string, canal: number): Promise<CuentaTitulo[]> {
  const filas = await consulta<{ canal_id: number; nombre: string; titulo: string }>(`
    select distinct on (m.canal_id) m.canal_id::int, c.nombre, coalesce(m.datos_externos -> 'ml' ->> 'family_name', m.titulo) titulo
      from meli_item m join canal c on c.id = m.canal_id
     where m.organizacion_id = $1 and m.sku = $2 and m.canal_id <> $3 and m.estado in ('active', 'paused') and c.tipo = 'mercadolibre'
       and not coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false)
     order by m.canal_id, m.vendidos desc nulls last`, [org, sku, canal]);
  return filas.filter((f) => f.titulo).map((f) => ({ clave: String(f.canal_id), nombre: f.nombre, titulo: f.titulo, modo: "fija" as const }));
}

/** El título para una cuenta nueva del producto, distinto de los de las otras cuentas (null si la IA no contestó). */
export async function tituloParaCuenta(org: string, sku: string, canal: number, nombreCuenta: string, base: string,
  extra: { marca?: string | null; modelo?: string | null } = {}): Promise<string | null> {
  const otras = await titulosDeOtrasCuentas(org, sku, canal);
  const r = await titulosIa({ titulo: base, ...extra }, [...otras, { clave: String(canal), nombre: nombreCuenta, titulo: null, modo: "nueva" }]);
  return r?.[String(canal)] ?? null;
}

export type ResultadoTitulos = { revisados: number; cambian: number; loteId: number | null; quedan: number; errores: number };

/** Revisa con la IA los títulos de la cuenta en los productos de ML sin ventas (de a `max` productos) y prepara un
 *  lote con los que hay que cambiar. Lo revisado queda anotado (ml_titulo_revisado) y no se repite por 30 días. */
export async function prepararRevisionTitulos(org: string, canal: number, usuarioId: string | null, opts: { max?: number; hasta?: number } = {}): Promise<ResultadoTitulos> {
  const hasta = opts.hasta ?? Date.now() + 240_000;
  const cuenta = await cuentaDelCanal(org, canal);
  if (!cuenta || cuenta.estado !== "activa") throw new ErrorErp("La cuenta de Mercado Libre no está conectada.");
  const nombre = (await una<{ nombre: string }>("select nombre from canal where id = $1", [canal]))?.nombre ?? "la cuenta";
  // Cada producto de ML (UP) de la cuenta sin ventas, con una de sus publicaciones comunes y su título actual.
  const ups = await consulta<{ up: string; sku: string; item_id: string; titulo: string; marca: string | null; modelo: string | null }>(`
    with x as (
      select m.datos_externos -> 'ml' ->> 'user_product_id' up, m.sku, m.item_id, coalesce(m.datos_externos -> 'ml' ->> 'family_name', m.titulo) titulo,
             coalesce(m.vendidos, 0) vendidos, coalesce((m.datos_externos -> 'ml' ->> 'catalog_listing')::boolean, false) catalogo
        from meli_item m
       where m.organizacion_id = $1 and m.canal_id = $2 and m.estado in ('active', 'paused') and m.variation_id = '' and m.sku is not null
         and m.datos_externos -> 'ml' ->> 'user_product_id' is not null and m.datos_externos -> 'ml' ->> 'family_name' is not null)
    select distinct on (x.up) x.up, x.sku, x.item_id, x.titulo, pr.marca, pr.modelo
      from x left join variacion v on v.organizacion_id = $1 and lower(v.sku) = lower(x.sku) left join producto pr on pr.id = v.producto_id
     where not x.catalogo
       and not exists (select 1 from x x2 where x2.up = x.up and x2.vendidos > 0)
       and not exists (select 1 from ml_titulo_revisado r where r.canal_id = $2 and r.up = x.up and r.revisado_ts > now() - interval '30 days')
       and not exists (select 1 from ml_cola q where q.canal_id = $2 and q.item_id = 'titulo:' || x.up and q.estado in ('preparado', 'pendiente', 'enviando'))
     order by x.up, x.item_id`, [org, canal]);
  const res: ResultadoTitulos = { revisados: 0, cambian: 0, loteId: null, quedan: 0, errores: 0 };
  const max = opts.max ?? 50;
  const cambios: CambioMl[] = [];
  for (const u of ups) {
    if (res.revisados >= max || Date.now() > hasta - 10_000) { res.quedan++; continue; }
    const otras = await titulosDeOtrasCuentas(org, u.sku, canal);
    const r = await titulosIa({ titulo: u.titulo, marca: u.marca, modelo: u.modelo },
      [...otras, { clave: "esta", nombre, titulo: u.titulo, modo: "revisar" }]);
    const nuevo = r?.esta;
    if (!nuevo) { res.errores++; continue; }
    res.revisados++;
    await consulta(`insert into ml_titulo_revisado (organizacion_id, canal_id, up, titulo_antes, titulo_ia) values ($1, $2, $3, $4, $5)
                    on conflict (canal_id, up) do update set titulo_antes = excluded.titulo_antes, titulo_ia = excluded.titulo_ia, revisado_ts = now()`,
      [org, canal, u.up, u.titulo, nuevo]);
    if (nuevo === u.titulo) continue;
    res.cambian++;
    cambios.push({
      canalId: canal, itemId: `titulo:${u.up}`, tipo: "otro", antes: { titulo: u.titulo },
      payload: {
        descripcion: `Título en ${nombre} (${u.sku}): «${u.titulo}» → «${nuevo}» (cambia en todas las publicaciones de ese producto de ML)`,
        pedidos: [{ metodo: "PUT", ruta: `/items/${u.item_id}`, cuerpo: { family_name: nuevo } }],
      },
    });
  }
  if (cambios.length) res.loteId = await encolarLoteConBoton(org, canal, cambios, `Títulos revisados con IA en ${nombre} (${cambios.length})`, usuarioId);
  return res;
}
