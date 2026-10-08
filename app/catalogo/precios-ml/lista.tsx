// Precios en Mercado Libre como listas configurables (lib/listas/tipos.ts), en
// modo memoria (los precios se calculan con el motor, lib/precios-ml/motor.ts):
//   · la vista previa: por publicación, Clásica, tachado, plan, precio
//     calculado, precio para ganar, precio actual en ML, diferencia y qué
//     cambiaría (más las publicaciones de planes que faltan);
//   · las excepciones por categoría o producto y los rangos de volumen.
// "Descargar Excel" baja lo mismo que la pantalla (filtros y orden).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { coincideBusqueda, gruposBusqueda } from "@/lib/busqueda";
import { formatear } from "@/lib/moneda";
import type { Campo, Lista, SP } from "@/lib/listas/tipos";
import { calcularCanal, canalesMl, excepcionesCanal, volumenCanal, type CanalMl } from "@/lib/precios-ml/datos";
import { filtrarCalculo } from "@/lib/precios-ml/preparar";
import { CON_PRECIO, PLANES, PLAN_INFO, descuentoComprador, queCambia, textoOrigen, type PlanOClasica } from "@/lib/precios-ml/motor";
import FotosProducto from "@/app/componentes/FotosProducto";
import PrecioPublicacion from "@/app/componentes/PrecioPublicacion";
import { PlanPublicacion } from "@/app/catalogo/publicaciones/lista";
import { url } from "@/app/componentes/erp";

export const BASE_PML = "/catalogo/precios-ml";
export const PREVIA = `${BASE_PML}/vista-previa`;

export const ROLES: Record<string, string> = {
  clasica: "Clásica", destacado: "Destacado", plan: "Plan", apagado: "Plan apagado", otro: "Sin tocar", nueva: "Nueva",
};
export const nombrePlan = (p: PlanOClasica | null | undefined) => (p ? PLAN_INFO[p].corto : "—");
const ESTADO_PTW: Record<string, string> = { winning: "gana", competing: "compite", sharing_first_place: "comparte el 1.º", listed: "listada" };

/** El canal de la pantalla: el de la dirección o el primero. */
export async function canalElegido(org: string, sp: SP): Promise<{ canales: CanalMl[]; canal: CanalMl | null }> {
  const canales = await canalesMl(org);
  return { canales, canal: canales.find((c) => c.id === Number(sp.canal)) ?? canales[0] ?? null };
}

export function filtrosPrevia(sp: SP) {
  return {
    familia: Number(sp.familia) || null,
    q: sp.q?.trim() ?? "",
    comienza: sp.contiene !== "1",
    cambios: sp.cambios === "1",
    todas: sp.todas === "1",
    rol: sp.rol && Object.hasOwn(ROLES, sp.rol) ? sp.rol : "",
  };
}

export type FilaPrevia = {
  id: string; canal_id: number; cuenta: string; item_id: string | null; variation_id: string | null; producto_id: number; sku: string; titulo: string; fotos: string[] | null;
  plan: PlanOClasica | null; rol: string; clasica: number | null; tachado_pct: number | null; tachado_origen: string | null;
  lista: number | null; venta: number | null; ptw: number | null; ptw_estado: string | null; precio_ml: number | null; venta_ml: number | null;
  diferencia: number | null; cambio: string; avisos: string; hay_cambio: boolean; comision_estimada: boolean; stock: number | null;
  /** % más cara que el esquema en este canal (0 = este canal gana ese plan). */
  ajuste: number | null;
  /** Las cuotas que ve el comprador en ese plan y las campañas propias en curso en ML. */
  cuotas: number | null; campana_ml: string | null;
  /** Campañas en curso (todas, también las de ML) y a las que entraría o de las que saldría. */
  campanas: string | null;
};

/** Lo que el filtro deja pasar, antes de calcular (Fer, 8/10: la cuenta tiene miles de
 *  publicaciones y calcularlas todas para mostrar un SKU tardaba). Es un colador grueso:
 *  todas las palabras buscadas en el SKU, título, número o publicaciones de la variación, y la
 *  categoría con sus subcategorías; el filtro fino (Comienza por, etc.) lo hace filtrarCalculo.
 *  null = sin filtro (todas). */
async function variacionesDelFiltro(org: string, canal: number, f: ReturnType<typeof filtrosPrevia>): Promise<number[] | null> {
  const terminos = gruposBusqueda(f.q).flat().map((t) => t.toLowerCase());
  if (!terminos.length && !f.familia) return null;
  const filas = await consulta<{ id: number }>(`
    with recursive fam as (
      select id from familia where organizacion_id = $1 and id = $3
      union select x.id from familia x join fam on x.padre_id = fam.id)
    select distinct v.id::int id
      from publicacion pu join variacion v on v.id = pu.variacion_id join producto p on p.id = v.producto_id
     where pu.organizacion_id = $1 and pu.canal_id = $2 and pu.id_externo is not null and pu.estado <> 'cerrada'
       and ($3::bigint is null or p.familia_id in (select id from fam))
       and (select bool_and(strpos(lower(v.sku || ' ' || coalesce(titulo_variacion(v.id), '') || ' ' || v.id || ' ' || v.producto_id || ' ' ||
              coalesce((select string_agg(x.id_externo, ' ') from publicacion x where x.variacion_id = v.id and x.canal_id = $2), '')), t) > 0)
              from unnest($4::text[]) t) is not false`, [org, canal, f.familia, terminos]);
  return filas.map((x) => x.id);
}

/** Lo calculado se guarda un ratito (Fer, 8/10): cambiar el papel, «Sólo las que cambian» o el
 *  orden no vuelve a calcular. Grabar una regla o preparar cambios lo borra. */
const CACHE_PREVIA = new Map<string, { hasta: number; filas: FilaPrevia[] }>();
const VIDA_CACHE_MS = 60_000;
export function limpiarCachePrevia() { CACHE_PREVIA.clear(); }

/** Las filas de la vista previa (filtradas, en el orden de siempre: por SKU). */
export async function filasPrevia(org: string, sp: SP): Promise<FilaPrevia[]> {
  const f = filtrosPrevia(sp);
  // «Todas las cuentas» (Fer, 8/10): las filas de cada cuenta, una debajo de la otra, por SKU.
  if (f.todas) {
    const canales = await canalesMl(org);
    const todas = (await Promise.all(canales.map((c) => filasPrevia(org, { ...sp, todas: undefined, canal: String(c.id) })))).flat();
    return todas.sort((a, b) => a.sku.localeCompare(b.sku) || a.cuenta.localeCompare(b.cuenta) || (a.plan ?? "").localeCompare(b.plan ?? ""));
  }
  const { canal } = await canalElegido(org, sp);
  if (!canal) return [];
  const clave = [org, canal.id, f.q, f.comienza, f.familia].join("|");
  const guardado = CACHE_PREVIA.get(clave);
  const todasLasFilas = guardado && guardado.hasta > Date.now() ? guardado.filas : await calcularFilas(org, canal, f);
  if (!guardado || guardado.hasta <= Date.now()) {
    for (const [k, v] of CACHE_PREVIA) if (v.hasta <= Date.now()) CACHE_PREVIA.delete(k);
    CACHE_PREVIA.set(clave, { hasta: Date.now() + VIDA_CACHE_MS, filas: todasLasFilas });
  }
  return todasLasFilas.filter((x) => (!f.cambios || x.hay_cambio) && (!f.rol || x.rol === f.rol));
}

async function calcularFilas(org: string, canal: CanalMl, f: ReturnType<typeof filtrosPrevia>): Promise<FilaPrevia[]> {
  const ids = await variacionesDelFiltro(org, canal.id, f);
  if (ids && !ids.length) return [];
  const calculo = await calcularCanal(org, canal.id, { variaciones: ids });
  const propuestas = filtrarCalculo(calculo, { familia: f.familia, q: f.q, comienza: f.comienza });
  const productos = [...new Set(propuestas.map((p) => p.info.productoId))];
  const fotos = new Map((productos.length ? await consulta<{ producto_id: number; fotos: string[] }>(
    "select producto_id::int, array_agg(url order by orden) fotos from producto_foto where producto_id = any($1::bigint[]) group by producto_id", [productos]) : [])
    .map((x) => [x.producto_id, x.fotos]));
  const nombreFamilia = (id: number) => calculo.familias.nombre.get(id);
  const filas: FilaPrevia[] = [];
  for (const { info, propuesta: p } of propuestas) {
    const comun = {
      canal_id: canal.id, cuenta: canal.nombre, producto_id: info.productoId, sku: info.sku, titulo: info.titulo, fotos: fotos.get(info.productoId) ?? null,
      clasica: p.clasica, tachado_pct: p.clasica != null ? p.tachadoPct : null, tachado_origen: p.clasica != null ? textoOrigen(p.tachadoOrigen, nombreFamilia) : null,
      comision_estimada: info.comisionEstimada, stock: info.stock,
    };
    const cuotasDe = (plan: PlanOClasica | null) => (plan && plan !== "clasica" ? p.planes.find((x) => x.plan === plan)?.cuotasVisibles ?? null : null);
    const ajusteDe = (plan: PlanOClasica | null) => p.clasica == null ? null : plan === "clasica" ? p.ajustePct : p.planes.find((x) => x.plan === plan)?.ajustePct ?? null;
    p.pubs.forEach((pa, i) => {
      const cambio = queCambia(pa);
      filas.push({
        ajuste: ajusteDe(pa.pub.plan), cuotas: cuotasDe(pa.pub.plan),
        campana_ml: [...new Set(pa.pub.campanas.filter((c) => c.estado === "started" && CON_PRECIO.includes(c.tipo)).map((c) => c.nombre ?? c.tipo))].join(" · ") || null,
        campanas: textoCampanas(pa.pub.campanas, pa.entrar.map((c) => c.id), pa.salir.map((c) => c.id)),
        ...comun, id: `${pa.pub.publicacionId}`, item_id: pa.pub.itemId, variation_id: pa.pub.variationId, plan: pa.pub.plan, rol: pa.rol,
        lista: pa.lista, venta: pa.venta, ptw: pa.pub.priceToWin, ptw_estado: pa.pub.estadoPtw, precio_ml: pa.pub.precioListaMl, venta_ml: pa.pub.precioVentaMl,
        diferencia: pa.lista != null && pa.pub.precioListaMl != null ? Math.round(pa.lista - pa.pub.precioListaMl) : null,
        cambio, avisos: [...(i === 0 ? p.avisos : []), ...pa.avisos].join(" "), hay_cambio: !!cambio,
      });
    });
    for (const fa of p.faltan) {
      // Las que faltan se crean con «Publicar en todas las cuentas» de la ficha del producto (copia completa de otra publicación).
      filas.push({
        ...comun, ajuste: ajusteDe(fa.plan), cuotas: cuotasDe(fa.plan), campana_ml: null, campanas: null, id: `n${info.variacionId}-${fa.plan}`, item_id: null, variation_id: null, plan: fa.plan, rol: "nueva",
        lista: p.tachado ?? fa.precio, venta: fa.precio, ptw: null, ptw_estado: null, precio_ml: null, venta_ml: null, diferencia: null,
        cambio: "", avisos: `Falta la publicación de ${PLAN_INFO[fa.plan].corto}: se crea con «Publicar en todas las cuentas» (ficha del producto, pestaña Publicaciones).`,
        hay_cambio: false,
      });
    }
  }
  return filas;
}

/** Las campañas de una publicación en una línea cada una: «● En curso: Día de la Madre $ 1.216.677», «→ Entraría: …», «← Saldría: …», «○ Programada: …». */
function textoCampanas(campanas: { id: string; tipo: string; estado: string | null; nombre?: string | null; precio: number | null }[], entrar: string[], salir: string[]): string | null {
  const lineas: string[] = [];
  const nombre = (c: { tipo: string; nombre?: string | null }) => `${c.nombre ?? c.tipo}${CON_PRECIO.includes(c.tipo) ? "" : " (de ML)"}`;
  const precio = (c: { precio: number | null }) => (c.precio ? ` ${formatear(c.precio, "ARS")}` : "");
  for (const c of campanas) {
    if (salir.includes(c.id)) lineas.push(`← Saldría: ${nombre(c)}${precio(c)}`);
    else if (c.estado === "started") lineas.push(`● En curso: ${nombre(c)}${precio(c)}`);
    else if (c.estado === "pending") lineas.push(`○ Programada: ${nombre(c)}${precio(c)}`);
    if (entrar.includes(c.id)) lineas.push(`→ Entraría: ${nombre(c)}`);
  }
  return lineas.length ? lineas.join("\n") : null;
}

const pesos = (v: number | null | undefined) => (v == null ? "—" : formatear(v, "ARS"));

const CAMPOS_PREVIA: Campo[] = [
  { clave: "cuenta", titulo: "Cuenta", celda: (f) => <span className="whitespace-nowrap text-[11px]">{f.cuenta}</span> },
  {
    clave: "item_id", titulo: "Publicación", ancho: 16,
    celda: (f) => f.item_id
      ? <Link href={url("/catalogo/publicaciones", { canal: f.canal_id, q: f.item_id })} className="font-mono text-[#16577F] hover:underline">{f.item_id}</Link>
      : <span className="text-[#5C6B76]">nueva</span>,
  },
  {
    clave: "sku", titulo: "SKU", ancho: 14,
    celda: (f) => (
      // La foto primero (todas del mismo tamaño) y después el SKU: quedan alineadas (Fer, 8/10).
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <FotosProducto fotos={f.fotos} titulo={f.titulo} />
        <Link href={`/catalogo/productos/${f.producto_id}`} className="text-[#16577F] hover:underline">{f.sku}</Link>
      </span>
    ),
  },
  { clave: "titulo", titulo: "Producto", ancho: 36, celda: (f) => <span className="line-clamp-2 block w-[160px] text-[11px] leading-tight" title={f.titulo}>{f.titulo}</span> },
  // Como en Catálogo › Publicaciones (Fer, 8/10): el nombre de ML y debajo las cuotas que ve el comprador.
  { clave: "plan", titulo: "Plan", valor: (f) => nombrePlan(f.plan), usa: ["cuotas"], celda: (f) => <PlanPublicacion plan={f.plan} cuotas={f.cuotas} /> },
  { clave: "rol", titulo: "Papel", valor: (f) => ROLES[f.rol] ?? f.rol },
  {
    clave: "ajuste", titulo: "¿Gana?", formato: "pct",
    celda: (f) => f.ajuste == null ? "—" : f.ajuste === 0 ? <b className="text-[#1F6E4A]">Gana</b> : <span title="Esta cuenta no gana este plan: va más cara que el esquema">+{f.ajuste.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %</span>,
  },
  { clave: "clasica", titulo: "Clásica", formato: "pesos" },
  // Lo que decide Fer: el descuento que ve el comprador (el tachado % es la cuenta interna; Fer, 8/10).
  {
    clave: "tachado_pct", titulo: "Descuento", formato: "pct", usa: ["tachado_origen"],
    valor: (f) => (f.tachado_pct == null ? null : descuentoComprador(f.tachado_pct)),
    celda: (f) => f.tachado_pct == null ? "—" : f.tachado_pct === 0 ? <span className="text-[#5C6B76]">sin descuento</span>
      : <span title={`Regla ${f.tachado_origen ?? ""}`}>{descuentoComprador(f.tachado_pct).toLocaleString("es-AR")} %</span>,
  },
  // Como lo ve el comprador (Fer, 8/10): grande lo que paga, chico y tachado el precio publicado, % OFF.
  {
    clave: "segun_laucen", titulo: "Según Laucen", orden: false, usa: ["venta", "lista"],
    valor: (f) => f.venta, formato: "pesos",
    celda: (f) => f.venta == null ? "—" : <PrecioPublicacion paga={f.venta} lista={f.lista} texto={(n) => formatear(n, "ARS")} />,
  },
  {
    clave: "hoy_ml", titulo: "Hoy en ML", orden: false, usa: ["venta_ml", "precio_ml", "campana_ml"],
    valor: (f) => f.venta_ml ?? f.precio_ml, formato: "pesos",
    celda: (f) => (f.venta_ml ?? f.precio_ml) == null ? "—" : <PrecioPublicacion paga={(f.venta_ml ?? f.precio_ml)!} lista={f.precio_ml} campana={f.campana_ml} texto={(n) => formatear(n, "ARS")} />,
  },
  {
    clave: "campanas", titulo: "Campañas", ancho: 40, orden: false,
    celda: (f) => f.campanas ? <span className="block min-w-[170px] whitespace-pre-line text-[11px] leading-snug">{f.campanas}</span> : <span className="text-[11px] text-[#5C6B76]">ninguna</span>,
  },
  { clave: "lista", titulo: "Precio calculado", formato: "pesos" },
  { clave: "venta", titulo: "Paga el comprador", formato: "pesos" },
  {
    clave: "ptw", titulo: "Precio para ganar", formato: "pesos", usa: ["ptw_estado"],
    celda: (f) => f.ptw == null ? "—" : <>{pesos(f.ptw)}{f.ptw_estado && <div className="text-[10px] text-[#5C6B76]">{ESTADO_PTW[f.ptw_estado] ?? f.ptw_estado}</div>}</>,
  },
  { clave: "ptw_estado", titulo: "Estado en catálogo", valor: (f) => (f.ptw_estado ? ESTADO_PTW[f.ptw_estado] ?? f.ptw_estado : null) },
  { clave: "precio_ml", titulo: "Precio en ML", formato: "pesos" },
  { clave: "venta_ml", titulo: "Paga hoy en ML", formato: "pesos" },
  {
    clave: "diferencia", titulo: "Diferencia", formato: "pesos",
    celda: (f) => f.diferencia == null || f.diferencia === 0 ? "—" : <span className={f.diferencia > 0 ? "text-[#1F6E4A]" : "text-[#C03420]"}>{f.diferencia > 0 ? "+" : ""}{pesos(f.diferencia)}</span>,
  },
  { clave: "cambio", titulo: "Qué cambiaría", ancho: 40, orden: false, celda: (f) => f.cambio ? <b className="text-[11px]">{f.cambio}</b> : <span className="text-[#5C6B76]">Nada</span> },
  { clave: "avisos", titulo: "Avisos", ancho: 40, orden: false, celda: (f) => f.avisos ? <span className="text-[11px] text-[#8a6100]">{f.avisos}</span> : "" },
  { clave: "stock", titulo: "Stock del canal", formato: "entero" },
  { clave: "comision_estimada", titulo: "Comisión estimada", formato: "sino" },
];

export const LISTA_PRECIOS_ML: Lista = {
  pantalla: "precios_ml",
  titulo: "Vista previa de precios en Mercado Libre",
  ruta: PREVIA,
  permiso: "precios_ml_ver",
  // En memoria: el orden por columna usa el valor de cada fila (la clave sólo lo habilita).
  campos: CAMPOS_PREVIA.map((c) => (c.orden === false ? c : { ...c, orden: c.clave })),
  enPantalla: ["cuenta", "item_id", "sku", "titulo", "plan", "rol", "ajuste", "clasica", "tachado_pct", "segun_laucen", "hoy_ml", "campanas", "ptw", "diferencia", "cambio", "avisos"],
  filas: (ctx, sp) => filasPrevia(ctx.org, sp),
};

// ── Excepciones y volumen ───────────────────────────────────

const activoTexto = (v: boolean | null | undefined) => (v == null ? "hereda" : v ? "sí" : "no");

export const LISTA_EXCEPCIONES_ML: Lista = {
  pantalla: "precios_ml_excepciones",
  titulo: "Excepciones de precios en Mercado Libre",
  ruta: BASE_PML,
  permiso: "precios_ml_ver",
  campos: [
    { clave: "tipo", titulo: "Aplica a", valor: (f) => (f.nivel === "familia" ? "Categoría" : "Producto") },
    { clave: "nombre", titulo: "Categoría o producto", ancho: 36 },
    { clave: "sku", titulo: "SKU" },
    // Lo que decide Fer es el descuento que ve el comprador (el tachado % es la cuenta interna).
    { clave: "tachado_pct", titulo: "Descuento que ve el comprador %", formato: "pct", valor: (f) => (f.tachado_pct == null ? null : descuentoComprador(Number(f.tachado_pct))) },
    ...PLANES.flatMap((p): Campo[] => [
      { clave: `${p}_activo`, titulo: `${PLAN_INFO[p].corto}: activo`, valor: (f) => activoTexto(f.planes?.[p]?.activo) },
      { clave: `${p}_min`, titulo: `${PLAN_INFO[p].corto}: Clásica mínima`, valor: (f) => f.planes?.[p]?.min ?? null, formato: "pesos" },
      { clave: `${p}_margen`, titulo: `${PLAN_INFO[p].corto}: margen %`, valor: (f) => f.planes?.[p]?.margen ?? null, formato: "pct" },
    ]),
  ],
  enPantalla: ["tipo", "nombre", "sku", "tachado_pct"],
  filas: async (ctx, sp) => {
    const { canal } = await canalElegido(ctx.org, sp);
    if (!canal) return [];
    const comienza = sp.contiene !== "1";
    return (await excepcionesCanal(ctx.org, canal.id)).filter((e) => coincideBusqueda([String(e.familia_id ?? e.producto_id ?? ""), e.nombre, e.sku], sp.q, comienza));
  },
};

export const textoEscalones = (e: { cantidad: number; pct: number }[]) => e.map((x) => `${x.cantidad}+ u. −${x.pct.toLocaleString("es-AR")} %`).join(" · ");

export const LISTA_VOLUMEN_ML: Lista = {
  pantalla: "precios_ml_volumen",
  titulo: "Descuento por volumen en Mercado Libre",
  ruta: BASE_PML,
  permiso: "precios_ml_ver",
  campos: [
    { clave: "aplica", titulo: "Aplica a", valor: (f) => (f.nivel === "general" ? "General" : f.nivel === "familia" ? `Categoría ${f.nombre}` : `Producto ${f.sku}`), ancho: 30 },
    { clave: "desde_precio", titulo: "Clásica desde", formato: "pesos" },
    { clave: "hasta_precio", titulo: "Clásica hasta", formato: "pesos" },
    { clave: "escalones", titulo: "Escalones", ancho: 50, valor: (f) => (f.sin_descuento ? "Sin descuento" : textoEscalones(f.escalones)) },
  ],
  enPantalla: ["aplica", "desde_precio", "hasta_precio", "escalones"],
  filas: async (ctx, sp) => {
    const { canal } = await canalElegido(ctx.org, sp);
    return canal ? volumenCanal(ctx.org, canal.id) : [];
  },
};
