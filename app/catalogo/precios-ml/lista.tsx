// Precios en Mercado Libre como listas configurables (lib/listas/tipos.ts), en
// modo memoria (los precios se calculan con el motor, lib/precios-ml/motor.ts):
//   · la vista previa: por publicación, Clásica, tachado, plan, precio
//     calculado, precio para ganar, precio actual en ML, diferencia y qué
//     cambiaría (más las publicaciones de planes que faltan);
//   · las excepciones por categoría o producto y los rangos de volumen.
// "Descargar Excel" baja lo mismo que la pantalla (filtros y orden).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { coincideBusqueda } from "@/lib/busqueda";
import { formatear } from "@/lib/moneda";
import type { Campo, Lista, SP } from "@/lib/listas/tipos";
import { calcularCanal, canalesMl, excepcionesCanal, volumenCanal, type CanalMl } from "@/lib/precios-ml/datos";
import { filtrarCalculo } from "@/lib/precios-ml/preparar";
import { PLANES, PLAN_INFO, queCambia, textoOrigen, type PlanOClasica } from "@/lib/precios-ml/motor";
import FotosProducto from "@/app/componentes/FotosProducto";
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
    rol: sp.rol && Object.hasOwn(ROLES, sp.rol) ? sp.rol : "",
  };
}

export type FilaPrevia = {
  id: string; canal_id: number; item_id: string | null; variation_id: string | null; producto_id: number; sku: string; titulo: string; fotos: string[] | null;
  plan: PlanOClasica | null; rol: string; clasica: number | null; tachado_pct: number | null; tachado_origen: string | null;
  lista: number | null; venta: number | null; ptw: number | null; ptw_estado: string | null; precio_ml: number | null; venta_ml: number | null;
  diferencia: number | null; cambio: string; avisos: string; hay_cambio: boolean; comision_estimada: boolean; stock: number | null;
};

/** Las filas de la vista previa (filtradas, en el orden de siempre: por SKU). */
export async function filasPrevia(org: string, sp: SP): Promise<FilaPrevia[]> {
  const { canal } = await canalElegido(org, sp);
  if (!canal) return [];
  const f = filtrosPrevia(sp);
  const calculo = await calcularCanal(org, canal.id);
  const propuestas = filtrarCalculo(calculo, { familia: f.familia, q: f.q, comienza: f.comienza });
  const productos = [...new Set(propuestas.map((p) => p.info.productoId))];
  const fotos = new Map((productos.length ? await consulta<{ producto_id: number; fotos: string[] }>(
    "select producto_id::int, array_agg(url order by orden) fotos from producto_foto where producto_id = any($1::bigint[]) group by producto_id", [productos]) : [])
    .map((x) => [x.producto_id, x.fotos]));
  const nombreFamilia = (id: number) => calculo.familias.nombre.get(id);
  const filas: FilaPrevia[] = [];
  for (const { info, propuesta: p } of propuestas) {
    const comun = {
      canal_id: canal.id, producto_id: info.productoId, sku: info.sku, titulo: info.titulo, fotos: fotos.get(info.productoId) ?? null,
      clasica: p.clasica, tachado_pct: p.clasica != null ? p.tachadoPct : null, tachado_origen: p.clasica != null ? textoOrigen(p.tachadoOrigen, nombreFamilia) : null,
      comision_estimada: info.comisionEstimada, stock: info.stock,
    };
    p.pubs.forEach((pa, i) => {
      const cambio = queCambia(pa);
      filas.push({
        ...comun, id: `${pa.pub.publicacionId}`, item_id: pa.pub.itemId, variation_id: pa.pub.variationId, plan: pa.pub.plan, rol: pa.rol,
        lista: pa.lista, venta: pa.venta, ptw: pa.pub.priceToWin, ptw_estado: pa.pub.estadoPtw, precio_ml: pa.pub.precioListaMl, venta_ml: pa.pub.precioVentaMl,
        diferencia: pa.lista != null && pa.pub.precioListaMl != null ? Math.round(pa.lista - pa.pub.precioListaMl) : null,
        cambio, avisos: [...(i === 0 ? p.avisos : []), ...pa.avisos].join(" "), hay_cambio: !!cambio,
      });
    });
    for (const fa of p.faltan) {
      filas.push({
        ...comun, id: `n${info.variacionId}-${fa.plan}`, item_id: null, variation_id: null, plan: fa.plan, rol: "nueva",
        lista: fa.precio, venta: fa.precio, ptw: null, ptw_estado: null, precio_ml: null, venta_ml: null, diferencia: null,
        cambio: fa.userProductId ? `Crear la publicación de ${PLAN_INFO[fa.plan].corto} a ${formatear(fa.precio, "ARS")}` : "",
        avisos: fa.userProductId ? "" : "No se puede crear: ninguna publicación de esta variación tiene el user product de ML.",
        hay_cambio: !!fa.userProductId,
      });
    }
  }
  return filas.filter((x) => (!f.cambios || x.hay_cambio) && (!f.rol || x.rol === f.rol));
}

const pesos = (v: number | null | undefined) => (v == null ? "—" : formatear(v, "ARS"));

const CAMPOS_PREVIA: Campo[] = [
  {
    clave: "item_id", titulo: "Publicación", ancho: 16,
    celda: (f) => f.item_id
      ? <Link href={url("/catalogo/publicaciones", { canal: f.canal_id, q: f.item_id })} className="font-mono text-[#16577F] hover:underline">{f.item_id}</Link>
      : <span className="text-[#5C6B76]">nueva</span>,
  },
  {
    clave: "sku", titulo: "SKU", ancho: 14,
    celda: (f) => (
      <span className="whitespace-nowrap">
        <Link href={`/catalogo/productos/${f.producto_id}`} className="text-[#16577F] hover:underline">{f.sku}</Link>{" "}
        <FotosProducto fotos={f.fotos} titulo={f.titulo} />
      </span>
    ),
  },
  { clave: "titulo", titulo: "Producto", ancho: 36, celda: (f) => <span className="line-clamp-2 min-w-[180px]">{f.titulo}</span> },
  { clave: "plan", titulo: "Plan", valor: (f) => nombrePlan(f.plan) },
  { clave: "rol", titulo: "Papel", valor: (f) => ROLES[f.rol] ?? f.rol },
  { clave: "clasica", titulo: "Clásica", formato: "pesos" },
  { clave: "tachado_pct", titulo: "Tachado %", formato: "pct", usa: ["tachado_origen"], celda: (f) => f.tachado_pct == null ? "—" : <span title={`Regla ${f.tachado_origen ?? ""}`}>{f.tachado_pct.toLocaleString("es-AR")} %</span> },
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
  enPantalla: ["item_id", "sku", "titulo", "plan", "rol", "clasica", "tachado_pct", "lista", "venta", "ptw", "precio_ml", "diferencia", "cambio", "avisos"],
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
    { clave: "tachado_pct", titulo: "Tachado %", formato: "pct" },
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
