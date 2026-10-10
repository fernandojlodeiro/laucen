// Las secciones de la ficha de producto. Todas de servidor; la edición en
// fila va con ?editar=<id> (el lápiz convierte la fila en sus campos).

import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import Link from "next/link";
import { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import PrecioPublicacion from "@/app/componentes/PrecioPublicacion";
import { consulta } from "@/lib/erp/base";
import { precioDe, listasDePrecios } from "@/lib/precios";
import { enVista, enMoneda, formatear, tcDelDia, tcParaVista, type Moneda } from "@/lib/moneda";
import { formatearNumero } from "@/lib/numeros";
import type { Sesion } from "@/lib/tenancy";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import { costoDeProducto, resolver, calcular, PCT_CREDITO } from "@/lib/costo-importacion";
import { CamposCosto, CajaCostoGeneral } from "../../costo-piezas";
import {
  Lapiz, Estado, Dato, ValorVista, url, editandoFicha, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import {
  accionGuardarDatos, accionCrearVariacion, accionGuardarVariacion, accionBorrarVariacion,
  accionCrearAtributo, accionGuardarAtributo, accionBorrarAtributo, accionMoverFoto, accionBorrarFoto,
  accionGuardarCucardas, accionGuardarCosto, accionAgregarComponente, accionGuardarComponente, accionBorrarComponente, accionGuardarPrecio, accionPublicarWeb, accionNoPublicable,
} from "../acciones";
import { EstadoProducto, TIPOS_PRODUCTO, ESTADOS_PRODUCTO, ESTADOS_VARIACION, CONDICIONES, condicionDe } from "../comun";
import SubirFoto from "../SubirFoto";
import AltaNueva from "@/app/componentes/AltaNueva";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import FamiliaConLupa from "@/app/catalogo/productos/FamiliaConLupa";
import { opcionesMarcas } from "@/lib/catalogo/marcas";
import { accionCrearMarcaDesdeFicha } from "@/app/catalogo/marcas/acciones";
import { caminoDeFamilia } from "@/lib/erp/familias";
import { UNIR_MELI_ITEM, textoEstadoMl, PlanPublicacion, PLAN_PUBLICACION, CUOTAS_VISIBLES_PUBLICACION, ES_CATALOGO, MarcaCatalogo, rangoPlan, UNIR_PRECIO_COMPRADOR, CAMPOS_PRECIO_COMPRADOR } from "@/app/catalogo/publicaciones/lista";
import { UNIR_MODERACION } from "@/lib/mercadolibre/moderaciones";
import { canalesWebDe } from "@/lib/catalogo/web";
import { Interruptor } from "@/app/radar/Piezas";
import { ThOrden } from "@/app/componentes/Lista";

export type Producto = {
  id: number; sku_base: string; titulo: string; descripcion: string | null; familia_id: number | null; familia: string | null;
  marca: string | null; marca_id: number | null; tipo: string; estado: string; codigo_barras: string | null; peso_g: number | null;
  largo_cm: number | null; ancho_cm: number | null; alto_cm: number | null; descuento_pct: number | null;
  umbral_pausa: number | null; stock_minimo: number | null; descuento_familia: number | null; umbral_org: string | null;
  variacion_default: number | null;
  modelo: string | null; linea: string | null; garantia: string | null; condicion: string | null;
  categoria_ml: string | null; atributos_ml: unknown; kit_vs: boolean; precio_en_dolares: boolean; no_publicable: boolean;
};

type Props = {
  s: Sesion & { moneda: Moneda };
  p: Producto;
  sp: { editar?: string; orden?: string; dir?: string; pcanal?: string };
  seccion: string;
  /** Datos, Costo y Cucardas: en edición (?editar=ficha); si no, en vista. */
  editando: boolean;
};

const pct = (n: number | null | undefined) => (n == null ? "—" : `${formatearNumero(Number(n), "pct")} %`);

/** Dirección de esta sección (con parámetros extra, ej. editar). */
const aqui = (p: Producto, seccion: string, extra: Record<string, string | number | undefined> = {}) =>
  url(`/catalogo/productos/${p.id}`, { seccion: seccion === "datos" ? undefined : seccion, ...extra });

/** Los dos campos que lleva todo formulario de la ficha. */
function Ocultos({ p, seccion }: { p: Producto; seccion: string }) {
  return <><input type="hidden" name="producto_id" value={p.id} /><input type="hidden" name="seccion" value={seccion} /></>;
}
const ocultos = (p: Producto, seccion: string, extra: Record<string, string | number> = {}) =>
  Object.fromEntries(Object.entries({ producto_id: p.id, seccion, ...extra }).map(([k, v]) => [k, String(v)]));

type Variacion = {
  id: number; sku: string; codigo_barras: string | null; titulo: string | null; titulo_efectivo: string; descuento_pct: number | null;
  descuento_efectivo: number; estado: string; es_default: boolean; atributos: string | null;
  costo_fob: number | null; costo_moneda: Moneda;
  costo_promedio_ars: number | null; costo_promedio_usd: number | null; costo_ultimo_ars: number | null; costo_ultimo_usd: number | null;
};
function variacionesDe(org: string, pid: number) {
  return consulta<Variacion>(`
    select v.id::int, v.sku, v.codigo_barras, v.titulo, titulo_variacion(v.id) titulo_efectivo, v.descuento_pct::float8,
           descuento_efectivo(v.organizacion_id, v.id)::float8 descuento_efectivo, v.estado, v.es_default,
           (select string_agg(a.nombre || '=' || a.valor, '; ' order by a.orden, a.nombre) from variacion_atributo a where a.variacion_id = v.id) atributos,
           v.costo_fob::float8, v.costo_moneda, v.costo_promedio_ars::float8, v.costo_promedio_usd::float8,
           v.costo_ultimo_ars::float8, v.costo_ultimo_usd::float8
      from variacion v where v.producto_id = $2 and v.organizacion_id = $1 order by v.orden, v.id`, [org, pid]);
}

const depositosActivos = (org: string) =>
  consulta<{ id: number; nombre: string }>("select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' order by nombre, id", [org]);

/** El costo puesto en depósito (sale de compras y despachos), en gris. */
function CostoDeposito({ v, vista }: { v: Variacion; vista: Moneda }) {
  const prom = v.costo_promedio_ars != null || v.costo_promedio_usd != null;
  const ult = v.costo_ultimo_ars != null || v.costo_ultimo_usd != null;
  if (!prom && !ult) return <span className="text-[10px] text-[#5C6B76]">Sin costo en depósito todavía (sale de compras).</span>;
  return (
    <span className="text-[10px] text-[#5C6B76]">
      Puesto en depósito:{prom && <> promedio {enVista({ ars: v.costo_promedio_ars, usd: v.costo_promedio_usd }, vista)}</>}
      {prom && ult && " ·"}{ult && <> último {enVista({ ars: v.costo_ultimo_ars, usd: v.costo_ultimo_usd }, vista)}</>} — sale de compras.
    </span>
  );
}

/** Campo de costo FOB con su selector de moneda. */
function CampoCosto({ v }: { v: Pick<Variacion, "costo_fob" | "costo_moneda"> | null }) {
  return (
    <span className="flex gap-1">
      <CampoNumero name="costo_fob" valor={v?.costo_fob ?? null} tipo="decimal" className={`${CAMPO} w-full min-w-0`} />
      <select name="costo_moneda" defaultValue={v?.costo_moneda ?? "USD"} className={CAMPO} aria-label="Moneda del costo">
        <option value="USD">USD</option><option value="ARS">ARS</option>
      </select>
    </span>
  );
}

/** Costo FOB de un kit: no se carga, es la suma de sus componentes
 *  (costo_fob × cantidad). Si los componentes mezclan monedas, todo a USD
 *  con el tipo de cambio del día. */
type CostoKit = {
  total: number | null; moneda: Moneda; sinCosto: string[]; sinTc: boolean;
  componentes: { sku: string; cantidad: number; subtotal: number | null; moneda: Moneda }[];
};
async function costosKit(org: string, variaciones: number[]): Promise<Map<number, CostoKit>> {
  const salida = new Map<number, CostoKit>();
  if (!variaciones.length) return salida;
  // La pieza que sobra al armar el kit (vuelve al stock) resta: cantidad negativa.
  const filas = await consulta<{ kit: number; sku: string; cantidad: number; costo: number | null; moneda: Moneda }>(`
    select k.variacion_kit_id::int kit, v.sku, case when k.sobrante then -k.cantidad else k.cantidad end cantidad, v.costo_fob::float8 costo, v.costo_moneda moneda
      from kit_componente k join variacion v on v.id = k.variacion_componente_id
     where k.organizacion_id = $1 and k.variacion_kit_id = any($2::bigint[]) order by v.sku`, [org, variaciones]);
  let tc: number | null | undefined;
  for (const id of variaciones) {
    const comp = filas.filter((f) => f.kit === id);
    if (!comp.length) continue;
    const conCosto = comp.filter((c) => c.costo != null);
    const mezcla = new Set(conCosto.map((c) => c.moneda)).size > 1;
    const moneda: Moneda = mezcla ? "USD" : conCosto[0]?.moneda ?? "USD";
    if (mezcla && tc === undefined) tc = (await tcDelDia(org))?.venta ?? null;
    const aMoneda = (n: number, de: Moneda) => (de === moneda ? n : tc ? n / tc : null);
    const componentes = comp.map((c) => {
      const sub = c.costo == null ? null : aMoneda(c.costo * c.cantidad, c.moneda);
      return { sku: c.sku, cantidad: c.cantidad, subtotal: sub, moneda };
    });
    const sinTc = mezcla && !tc;
    const total = sinTc || !conCosto.length ? null : componentes.reduce((t, c) => t + (c.subtotal ?? 0), 0);
    salida.set(id, { total, moneda, componentes, sinTc, sinCosto: comp.filter((c) => c.costo == null).map((c) => c.sku) });
  }
  return salida;
}

/** El costo FOB calculado de un kit, con sus componentes debajo. */
function CostoKitVer({ k }: { k: CostoKit | undefined }) {
  if (!k) return <span className="block text-[11px] text-[#5C6B76] py-1.5">El kit todavía no tiene componentes: su costo FOB es la suma de ellos.</span>;
  return (
    <span className="block text-xs">
      <span className="block py-1.5 tabular-nums font-semibold text-right">{k.total != null ? formatear(k.total, k.moneda) : "—"}</span>
      <span className="block text-[10px] text-[#5C6B76]">Suma de sus componentes{k.sinTc && " (no hay tipo de cambio del día para pasar todo a USD)"}:</span>
      <ul className="text-[10px] text-[#5C6B76] tabular-nums">
        {k.componentes.map((c, i) => (
          <li key={i}>{c.sku} × {c.cantidad} = {c.subtotal != null ? formatear(c.subtotal, c.moneda) : "sin costo"}</li>
        ))}
      </ul>
      {k.sinCosto.length > 0 && <span className="block text-[10px] text-[#8a6100]">Falta el costo FOB de {k.sinCosto.join(", ")}.</span>}
    </span>
  );
}

type AtributoMl = { id?: string; name?: string; value_name?: string | null };
const atributosMl = (x: unknown): AtributoMl[] => (Array.isArray(x) ? x.filter((a) => a && typeof a === "object") as AtributoMl[] : []);

// ── Datos ─────────────────────────────────────────────────

/** Alícuotas de IVA que acepta ARCA (valor guardado → texto). */
const ALICUOTAS_IVA = [["21", "21 %"], ["10.5", "10,5 %"], ["27", "27 %"], ["5", "5 %"], ["2.5", "2,5 %"], ["0", "0 %"]] as const;

export async function SeccionDatos({ s, p, seccion, editando }: Props) {
  // La familia se elige con buscador (ElegirFamilia) y su lupa de Mercado Libre; se muestra con su camino.
  const caminoFamilia = await caminoDeFamilia(s.org.id, p.familia_id);
  // Las marcas, de su tabla (desplegable con buscador).
  const marcas = editando ? await opcionesMarcas(s.org.id) : [];
  // La alícuota de IVA (facturación) se lee aparte: la consulta del producto está en page.tsx.
  const iva = await consulta<{ iva_pct: string }>("select iva_pct::text from producto where id = $1 and organizacion_id = $2", [p.id, s.org.id]);
  const ivaPct = String(Number(iva[0]?.iva_pct ?? 21));
  const heredado = p.descuento_familia ?? 0;
  const umbralOrg = Number(p.umbral_org ?? 0) || 0;
  const conVariaciones = p.tipo === "con_variaciones";
  const vDefault = conVariaciones ? null : (await variacionesDe(s.org.id, p.id)).find((v) => v.es_default) ?? null;
  const kits = vDefault ? await costosKit(s.org.id, [vDefault.id]) : new Map<number, CostoKit>();
  const esKit = !!vDefault && (p.tipo === "kit" || kits.has(vDefault.id));
  const attrsMl = atributosMl(p.atributos_ml);
  const num = (n: number | null, tipo: "entero" | "decimal") => (n == null ? null : formatearNumero(Number(n), tipo));
  const ayudaDescuento = <>Vacío = hereda {p.familia ? "de la familia" : ""}: {pct(heredado)}.{p.descuento_pct != null && <> Rige: {pct(p.descuento_pct)}.</>}</>;
  const ayudaUmbral = <>Vacío = el del canal o el general ({umbralOrg}).</>;
  const ayudaIva = "Los precios se cargan con IVA; al facturar se discrimina con esta alícuota.";
  const costoFob = vDefault && esKit ? (
    <div className="col-span-2"><span className={ETIQUETA}>Costo FOB</span><CostoKitVer k={kits.get(vDefault.id)} /></div>
  ) : vDefault ? (
    editando ? (
      <div className="col-span-2">
        <input type="hidden" name="con_costo" value="1" />
        <label><span className={ETIQUETA}>Costo FOB</span><CampoCosto v={vDefault} /></label>
        <CostoDeposito v={vDefault} vista={s.moneda} />
      </div>
    ) : (
      <Dato etiqueta="Costo FOB" className="col-span-2" numero ayuda={<CostoDeposito v={vDefault} vista={s.moneda} />}>
        {vDefault.costo_fob != null ? <span className="tabular-nums">{formatear(vDefault.costo_fob, vDefault.costo_moneda)}</span> : null}
      </Dato>
    )
  ) : (
    <div className="col-span-2"><span className={ETIQUETA}>Costo FOB</span><p className="text-[11px] text-[#5C6B76] py-1.5">Va en cada variación.</p></div>
  );

  // Modo vista: los datos, sin campos. Se edita con el lápiz de arriba a la derecha.
  if (!editando) {
    return (
      <>
      <div className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 items-start`}>
        <Dato etiqueta="SKU base"><span className="font-mono">{p.sku_base}</span></Dato>
        <Dato etiqueta="Título" className="col-span-1 sm:col-span-3">{p.titulo}</Dato>
        <Dato etiqueta="Familia">{p.familia_id && <span className="block truncate" title={caminoFamilia ?? undefined}>{caminoFamilia ?? p.familia}</span>}</Dato>
        <Dato etiqueta="Marca">{p.marca_id && <Link href={`/catalogo/productos?marca=${p.marca_id}`} className="text-[#16577F] hover:underline">{p.marca}</Link>}</Dato>
        <Dato etiqueta="Tipo">{TIPOS_PRODUCTO[p.tipo] ?? p.tipo}</Dato>
        <Dato etiqueta="Estado"><EstadoProducto estado={p.estado} /></Dato>
        {conVariaciones
          ? <Dato etiqueta="Código de barras" ayuda="Va en cada variación." />
          : <Dato etiqueta="Código de barras">{p.codigo_barras && <span className="font-mono">{p.codigo_barras}</span>}</Dato>}
        <Dato etiqueta="Modelo">{p.modelo}</Dato>
        <Dato etiqueta="Línea">{p.linea}</Dato>
        <Dato etiqueta="Garantía">{p.garantia}</Dato>
        <Dato etiqueta="Condición">{CONDICIONES[condicionDe(p.condicion)]}</Dato>
        {costoFob}
        <label className="col-span-2 flex items-center gap-2 text-xs self-end py-1.5">
          <input type="checkbox" disabled checked={p.kit_vs} className="h-4 w-4 accent-[#16577F]" />
          Kit en Virtual Seller (armar a mano)
        </label>
        <label className="col-span-2 flex items-center gap-2 text-xs self-end py-1.5">
          <input type="checkbox" disabled checked={p.precio_en_dolares} className="h-4 w-4 accent-[#16577F]" />
          Precio en dólares (los pesos siguen al tipo de cambio del día)
        </label>
        <Dato etiqueta="Peso (g)" numero>{num(p.peso_g, "entero")}</Dato>
        <Dato etiqueta="Stock mínimo" numero ayuda="Debajo de esto, avisa el panel.">{num(p.stock_minimo, "entero")}</Dato>
        <Dato etiqueta="Largo (cm)" numero>{num(p.largo_cm, "decimal")}</Dato>
        <Dato etiqueta="Ancho (cm)" numero>{num(p.ancho_cm, "decimal")}</Dato>
        <Dato etiqueta="Alto (cm)" numero>{num(p.alto_cm, "decimal")}</Dato>
        <div />
        <Dato etiqueta="Descuento %" numero ayuda={ayudaDescuento}>{p.descuento_pct != null ? pct(p.descuento_pct) : null}</Dato>
        <Dato etiqueta="Umbral de pausa" numero ayuda={ayudaUmbral}>{p.umbral_pausa != null ? String(p.umbral_pausa) : null}</Dato>
        <Dato etiqueta="IVA" numero ayuda={ayudaIva}>{ALICUOTAS_IVA.find(([v]) => v === ivaPct)?.[1] ?? `${ivaPct} %`}</Dato>
        <div />
        <Dato etiqueta="Descripción larga" className="col-span-2 sm:col-span-4" largo>{p.descripcion}</Dato>
      </div>
      <AtributosMl p={p} attrsMl={attrsMl} />
      </>
    );
  }

  return (
    <>
    <form id="ficha" action={accionGuardarDatos} className={`${CAJA} grid grid-cols-2 sm:grid-cols-4 gap-3 items-start`}>
      <Ocultos p={p} seccion={seccion} />
      <label><span className={ETIQUETA}>SKU base</span><input name="sku_base" defaultValue={p.sku_base} className={`${CAMPO} w-full font-mono`} /></label>
      <label className="col-span-1 sm:col-span-3"><span className={ETIQUETA}>Título</span><input name="titulo" defaultValue={p.titulo} className={`${CAMPO} w-full`} autoFocus /></label>
      <div><span className={ETIQUETA}>Familia</span>
        <FamiliaConLupa name="familia_id" valor={p.familia_id} etiqueta={caminoFamilia} />
      </div>
      <div><span className={ETIQUETA}>Marca</span>
        <ElegirDeLista name="marca_id" opciones={marcas} valor={p.marca_id} vacio="Sin marca" placeholder="Buscá la marca…" etiqueta="Marca" crear={accionCrearMarcaDesdeFicha} />
      </div>
      <label><span className={ETIQUETA}>Tipo</span>
        <select name="tipo" defaultValue={p.tipo} className={`${CAMPO} w-full`}>
          {Object.entries(TIPOS_PRODUCTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">A simple o kit, sólo con una variación.</span>
      </label>
      <label><span className={ETIQUETA}>Estado</span>
        <select name="estado" defaultValue={p.estado} className={`${CAMPO} w-full`}>
          {Object.entries(ESTADOS_PRODUCTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </label>
      {p.tipo !== "con_variaciones" ? (
        <label><span className={ETIQUETA}>Código de barras</span><input name="codigo_barras" defaultValue={p.codigo_barras ?? ""} className={`${CAMPO} w-full font-mono`} /></label>
      ) : (
        <div><span className={ETIQUETA}>Código de barras</span><p className="text-[11px] text-[#5C6B76] py-1.5">Va en cada variación.</p></div>
      )}
      <label><span className={ETIQUETA}>Modelo</span><input name="modelo" defaultValue={p.modelo ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Línea</span><input name="linea" defaultValue={p.linea ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Garantía</span><input name="garantia" defaultValue={p.garantia ?? ""} placeholder="ej. 6 meses" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Condición</span>
        <select name="condicion" defaultValue={condicionDe(p.condicion)} className={`${CAMPO} w-full`}>
          <option value="">Sin indicar</option>
          {Object.entries(CONDICIONES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </label>
      {costoFob}
      <label className="col-span-2 flex items-center gap-2 text-xs self-end py-1.5">
        <input type="checkbox" name="kit_vs" defaultChecked={p.kit_vs} className="h-4 w-4 accent-[#16577F]" />
        Kit en Virtual Seller (armar a mano)
      </label>
      <label className="col-span-2 flex items-center gap-2 text-xs self-end py-1.5" title="Los pesos salen todos los días con el tipo de cambio del día">
        <input type="checkbox" name="precio_en_dolares" defaultChecked={p.precio_en_dolares} className="h-4 w-4 accent-[#16577F]" />
        Precio en dólares (los pesos siguen al tipo de cambio del día)
      </label>
      <label><span className={ETIQUETA}>Peso (g)</span><CampoNumero name="peso_g" valor={p.peso_g} tipo="entero" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Stock mínimo</span><CampoNumero name="stock_minimo" valor={p.stock_minimo} tipo="entero" className={`${CAMPO} w-full`} />
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">Debajo de esto, avisa el panel.</span>
      </label>
      <label><span className={ETIQUETA}>Largo (cm)</span><CampoNumero name="largo_cm" valor={p.largo_cm} tipo="decimal" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Ancho (cm)</span><CampoNumero name="ancho_cm" valor={p.ancho_cm} tipo="decimal" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Alto (cm)</span><CampoNumero name="alto_cm" valor={p.alto_cm} tipo="decimal" className={`${CAMPO} w-full`} /></label>
      <div />
      <label><span className={ETIQUETA}>Descuento %</span>
        <CampoNumero name="descuento_pct" valor={p.descuento_pct} tipo="pct" placeholder={formatearNumero(heredado, "pct")} className={`${CAMPO} w-full`} />
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">{ayudaDescuento}</span>
      </label>
      <label><span className={ETIQUETA}>Umbral de pausa</span>
        <CampoNumero name="umbral_pausa" valor={p.umbral_pausa} tipo="entero" placeholder={String(umbralOrg)} className={`${CAMPO} w-full`} />
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">{ayudaUmbral}</span>
      </label>
      <label><span className={ETIQUETA}>IVA</span>
        <select name="iva_pct" defaultValue={ivaPct} className={`${CAMPO} w-full`}>
          {ALICUOTAS_IVA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">{ayudaIva}</span>
      </label>
      <div />
      {/* La descripción larga, al final y a todo lo ancho. */}
      <label className="col-span-2 sm:col-span-4"><span className={ETIQUETA}>Descripción larga</span>
        <textarea name="descripcion" defaultValue={p.descripcion ?? ""} rows={14} className={`${CAMPO} w-full leading-relaxed`} />
      </label>
    </form>
    </>
  );
}

/** Lo que trajo Mercado Libre: sólo para mirar (debajo de los datos, en vista). */
function AtributosMl({ p, attrsMl }: { p: Producto; attrsMl: AtributoMl[] }) {
  return (
    <>
    {/* Lo que trajo Mercado Libre: sólo para mirar. */}
    <details className={`${CAJA} mt-3`}>
      <summary className="text-sm font-bold cursor-pointer">
        Atributos de Mercado Libre <span className="text-[11px] font-normal text-[#5C6B76]">· {attrsMl.length} · categoría {p.categoria_ml ?? "—"}</span>
      </summary>
      {attrsMl.length === 0 ? <p className="text-xs text-[#5C6B76] mt-2">No trajo atributos de Mercado Libre.</p> : (
        <div className={`${CAJA_TABLA} mt-2 max-w-2xl`}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Atributo</th><th className={TH}>Valor</th></tr></thead>
            <tbody>
              {attrsMl.map((a, i) => (
                <tr key={`${a.id ?? ""}-${i}`} className={TR}>
                  <td className={`${TD} font-semibold`}>{a.name ?? a.id ?? "—"}</td>
                  <td className={TD}>{a.value_name ?? <span className="text-[#5C6B76]">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
    </>
  );
}

// ── Costo de importación ──────────────────────────────────

export async function SeccionCosto({ s, p, sp, seccion, editando }: Props) {
  const { propios, cadena, general, resuelto } = await costoDeProducto(s.org.id, p.id, p.familia_id);
  const heredado = resolver(null, cadena, general);
  const variaciones = await variacionesDe(s.org.id, p.id);
  const kits = await costosKit(s.org.id, variaciones.map((v) => v.id));
  const esKit = (v: Variacion) => p.tipo === "kit" || kits.has(v.id);
  const uno = calcular(1, resuelto);
  const x = (n: number) => formatearNumero(n, "decimal");
  const editandoGeneral = !editando && editandoFicha(sp, "general");
  const sinFlete = resuelto.flete_pct.valor == null;

  const datos = (
    <>
      <CamposCosto editando={editando} propios={propios} rige={resuelto} heredado={heredado} credito={PCT_CREDITO} autoFocus />
      <div className="mt-3">
        {editando ? (
          <label className="block"><span className={ETIQUETA}>Notas</span>
            <textarea name="notas" defaultValue={propios?.notas ?? ""} rows={3} className={`${CAMPO} w-full`} />
          </label>
        ) : (
          <Dato etiqueta="Notas" largo>{propios?.notas}</Dato>
        )}
      </div>
      <p className="text-[10px] text-[#5C6B76] mt-2">
        {editando
          ? "Un campo vacío hereda de la categoría del producto (y de las de arriba) o de los valores generales."
          : <>Cada valor es el del producto o, si no tiene, el de su categoría{p.familia ? ` (${p.familia})` : ""} o el general.{propios?.actualizado && <> Última modificación: {propios.actualizado}.</>}</>}
      </p>
    </>
  );

  return (
    <div className="space-y-4">
      {editando ? (
        <form id="ficha" action={accionGuardarCosto} className={CAJA}>
          <Ocultos p={p} seccion={seccion} />
          {datos}
        </form>
      ) : <div className={CAJA}>{datos}</div>}

      <section>
        <h2 className="text-sm font-bold mb-1">Costo estimado puesto en depósito</h2>
        <p className="text-xs text-[#5C6B76] mb-2">
          CIF = FOB + flete + seguro = FOB × {x(uno.cif)}. Costo = CIF + derechos + estadística + arancel/otros + despachante + depósito
          = FOB × {x(uno.costo)}. El crédito fiscal y los anticipos (IVA, percepciones, IIBB) se calculan sobre CIF + derechos + estadística y no se suman.
          El costo real sale de las compras y los despachos.
        </p>
        {sinFlete && <p className="text-[11px] text-[#8a6100] mb-2">Falta el flete: cargalo acá, en la categoría del producto (Familias) o en los valores generales.</p>}
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Variación</th><th className={THN}>FOB</th><th className={THN}>Flete y seguro</th><th className={THN}>CIF</th>
                <th className={THN}>Derechos y tasas</th><th className={THN}>Despachante y depósito</th>
                <th className={THN}>Costo estimado</th><th className={THN}>Crédito fiscal (aparte)</th>
                <th className={THN}>Último costo real</th><th className={THN}>Costo promedio</th>
              </tr>
            </thead>
            <tbody>
              {variaciones.map((v) => {
                const k = kits.get(v.id);
                const fob = esKit(v) ? k?.total ?? null : v.costo_fob;
                const moneda: Moneda = esKit(v) ? k?.moneda ?? "USD" : v.costo_moneda;
                const c = fob == null ? null : calcular(fob, resuelto);
                const m = (n: number | undefined) => (n == null ? "—" : formatear(n, moneda));
                return (
                  <tr key={v.id} className={TR}>
                    <td className={TD}><span className="font-mono">{v.sku}</span>{v.atributos && <span className="text-[#5C6B76]"> · {v.atributos}</span>}</td>
                    <td className={TDN}>{fob != null ? formatear(fob, moneda) : <span className="text-[#5C6B76]">{esKit(v) ? "suma de componentes" : "sin FOB"}</span>}</td>
                    <td className={TDN}>{m(c ? c.flete + c.seguro : undefined)}</td>
                    <td className={TDN}>{m(c?.cif)}</td>
                    <td className={TDN}>{m(c ? c.derechos + c.estadistica + c.otros : undefined)}</td>
                    <td className={TDN}>{m(c ? c.despachante + c.deposito : undefined)}</td>
                    <td className={`${TDN} font-semibold`}>{m(c?.costo)}</td>
                    <td className={`${TDN} text-[#5C6B76]`}>{m(c?.credito)}</td>
                    <td className={TDN}>{v.costo_ultimo_ars != null || v.costo_ultimo_usd != null ? enVista({ ars: v.costo_ultimo_ars, usd: v.costo_ultimo_usd }, s.moneda) : <span className="text-[#5C6B76]">—</span>}</td>
                    <td className={TDN}>{v.costo_promedio_ars != null || v.costo_promedio_usd != null ? enVista({ ars: v.costo_promedio_ars, usd: v.costo_promedio_usd }, s.moneda) : <span className="text-[#5C6B76]">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[#5C6B76] mt-1">
          El FOB se carga en {p.tipo === "con_variaciones" ? "cada variación" : "Datos"}; los costos reales (último y promedio) salen de las facturas de compra y los despachos, en {s.moneda === "USD" ? "dólares" : "pesos"}.
        </p>
      </section>

      {!editando && (
        <CajaCostoGeneral general={general} editando={editandoGeneral} ver={aqui(p, seccion)} editar={aqui(p, seccion, { editar: "general" })} />
      )}
    </div>
  );
}

// ── Variaciones ───────────────────────────────────────────

/** El formulario de una variación (en su fila, o en la caja de la única). */
function FormVariacion({ s, p, seccion, v, fija, esKit, kit }: {
  s: Props["s"]; p: Producto; seccion: string; v: Variacion; fija: boolean; esKit: boolean; kit: CostoKit | undefined;
}) {
  return (
    <form action={accionGuardarVariacion} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start">
      <Ocultos p={p} seccion={seccion} />
      <input type="hidden" name="id" value={v.id} />
      <label><span className={ETIQUETA}>SKU</span>
        {fija ? <ValorVista className="font-mono">{v.sku}</ValorVista> : <input name="sku" defaultValue={v.sku} className={`${CAMPO} w-full font-mono`} autoFocus />}
      </label>
      <label><span className={ETIQUETA}>Código de barras</span>
        {fija ? <ValorVista className="font-mono">{v.codigo_barras}</ValorVista> : <input name="codigo_barras" defaultValue={v.codigo_barras ?? ""} className={`${CAMPO} w-full font-mono`} />}
      </label>
      <label className="col-span-2"><span className={ETIQUETA}>Atributos (nombre=valor; …)</span>
        <input name="atributos" defaultValue={v.atributos ?? ""} placeholder="color=rojo; talle=M" className={`${CAMPO} w-full`} />
      </label>
      <label className="col-span-2"><span className={ETIQUETA}>Título propio (vacío = el del producto + atributos)</span>
        <input name="titulo" defaultValue={v.titulo ?? ""} className={`${CAMPO} w-full`} />
      </label>
      <label><span className={ETIQUETA}>Descuento % (vacío = hereda)</span>
        <CampoNumero name="descuento_pct" valor={v.descuento_pct} tipo="pct" className={`${CAMPO} w-full`} />
      </label>
      <label><span className={ETIQUETA}>Estado</span>
        <select name="estado" defaultValue={v.estado} className={`${CAMPO} w-full`}>
          {Object.entries(ESTADOS_VARIACION).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </label>
      <div className="col-span-2"><span className={ETIQUETA}>Costo FOB</span>
        {esKit ? <CostoKitVer k={kit} /> : <><CampoCosto v={v} /><CostoDeposito v={v} vista={s.moneda} /></>}
      </div>
      <div className="col-span-2 sm:col-span-2 flex gap-2 justify-end self-end">
        <button className={VERDE}>Guardar</button>
        <Link href={aqui(p, seccion)} className={SUAVE} scroll={false}>Cancelar</Link>
      </div>
    </form>
  );
}

export async function SeccionVariaciones({ s, p, sp, seccion }: Props) {
  const filas = await variacionesDe(s.org.id, p.id);
  const editar = Number(sp.editar) || 0;
  const conVariaciones = p.tipo === "con_variaciones";
  // Un kit (por tipo o porque tiene componentes) no carga costo: se calcula.
  const kits = await costosKit(s.org.id, filas.map((v) => v.id));
  const esKit = (v: Variacion) => p.tipo === "kit" || kits.has(v.id);
  // Toda variación vive en la base (SKU, stock y precio van ahí), pero la
  // única default sin atributos no es una variación de verdad: "Variaciones (0)".
  const sinVariaciones = filas.length <= 1 && !filas[0]?.atributos;
  const unica = sinVariaciones ? filas[0] ?? null : null;
  return (
    <>
      {conVariaciones && (
        <AltaNueva texto="Nueva variación" sinBoton className="mb-3">
          <form action={accionCrearVariacion} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start">
            <Ocultos p={p} seccion={seccion} />
            <label><span className={ETIQUETA}>SKU</span><input name="sku" className={`${CAMPO} w-full font-mono`} autoFocus /></label>
            <label><span className={ETIQUETA}>Código de barras</span><input name="codigo_barras" className={`${CAMPO} w-full font-mono`} /></label>
            <label className="col-span-2"><span className={ETIQUETA}>Atributos</span><input name="atributos" placeholder="color=rojo; talle=M" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>Título propio</span><input name="titulo" placeholder="(opcional)" className={`${CAMPO} w-full`} /></label>
            <div className="self-end"><button className={PRIMARIO}>Agregar variación</button></div>
          </form>
        </AltaNueva>
      )}
      {sinVariaciones ? (
        <div className={`${CAJA} max-w-3xl`}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs">
              Este producto no tiene variaciones: se maneja como uno solo (el SKU, el stock y el precio son los del producto).
              {!conVariaciones && <span className="block text-[11px] text-[#5C6B76] mt-1">Para agregarle variaciones (color, talle…), cambiá el tipo a «Con variaciones» en Datos.</span>}
            </p>
            {/* Con tipo «Con variaciones», el SKU y el costo de la única van acá (en Datos dice «va en cada variación»). */}
            {conVariaciones && unica && editar !== unica.id && <Lapiz href={aqui(p, seccion, { editar: unica.id })} etiqueta="Editar el SKU, el costo y el estado" />}
          </div>
          {conVariaciones && unica && editar === unica.id && (
            <div className="mt-3 border-t border-[#E3E9F0] pt-3">
              <FormVariacion s={s} p={p} seccion={seccion} v={unica} fija={false} esKit={esKit(unica)} kit={kits.get(unica.id)} />
            </div>
          )}
        </div>
      ) : (
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>SKU</th><th className={TH}>Código de barras</th><th className={TH}>Atributos</th><th className={TH}>Título</th>
              <th className={THN}>Descuento</th><th className={THN}>Costo FOB</th><th className={TH}>Estado</th><th />
            </tr>
          </thead>
          <tbody>
            {filas.map((v) => {
              const fija = v.es_default && !conVariaciones;
              return editar === v.id ? (
                <tr key={v.id} className={`${TR} bg-[#FAFBFC]`}>
                  <td colSpan={8} className={TD}>
                    <FormVariacion s={s} p={p} seccion={seccion} v={v} fija={fija} esKit={esKit(v)} kit={kits.get(v.id)} />
                  </td>
                </tr>
              ) : (
                <tr key={v.id} className={TR}>
                  <td className={`${TD} font-mono whitespace-nowrap`}>{v.sku}</td>
                  <td className={`${TD} font-mono text-[#5C6B76]`}>{v.codigo_barras ?? "—"}</td>
                  <td className={TD}>{v.atributos ?? <span className="text-[#5C6B76]">—</span>}</td>
                  <td className={TD}>{v.titulo ?? <span className="text-[#5C6B76]">{v.titulo_efectivo}</span>}</td>
                  <td className={TDN}>
                    {v.descuento_pct != null ? pct(v.descuento_pct) : <span className="text-[#5C6B76]" title="Heredado">{pct(v.descuento_efectivo)}</span>}
                  </td>
                  <td className={TDN}>
                    {esKit(v) ? (() => {
                      const k = kits.get(v.id);
                      return <span title="Suma de sus componentes">{k?.total != null ? formatear(k.total, k.moneda) : "—"} <span className="text-[10px] text-[#5C6B76]">(suma de sus componentes)</span></span>;
                    })() : v.costo_fob != null ? formatear(v.costo_fob, v.costo_moneda) : <span className="text-[#5C6B76]">—</span>}
                  </td>
                  <td className={TD}><EstadoProducto estado={v.estado} /></td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <span className="inline-flex gap-1">
                      <Lapiz href={aqui(p, seccion, { editar: v.id })} />
                      {conVariaciones && filas.length > 1 && (
                        <TachoConfirmar accion={accionBorrarVariacion} campos={ocultos(p, seccion, { id: v.id })} pregunta="¿Borrar?" />
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </>
  );
}

// ── Atributos genéricos ───────────────────────────────────

export async function SeccionAtributos({ s, p, sp, seccion }: Props) {
  const filas = await consulta<{ id: number; nombre: string; valor: string; orden: number }>(
    "select id::int, nombre, valor, orden from producto_atributo where producto_id = $2 and organizacion_id = $1 order by orden, id", [s.org.id, p.id]);
  const editar = Number(sp.editar) || 0;
  return (
    <div className="max-w-2xl">
      <AltaNueva texto="Nuevo atributo" sinBoton className="mb-3">
        <form action={accionCrearAtributo} className="flex flex-wrap items-center gap-2">
          <Ocultos p={p} seccion={seccion} />
          <input name="nombre" placeholder="Nombre (ej. material)" className={`${CAMPO} w-40`} autoFocus />
          <input name="valor" placeholder="Valor (ej. acero inoxidable)" className={`${CAMPO} flex-1 min-w-48`} />
          <button className={PRIMARIO}>Agregar</button>
        </form>
      </AltaNueva>
      <p className="text-xs text-[#5C6B76] mb-2">Datos libres del producto (material, origen, garantía…). Los de cada variación (color, talle) van en Variaciones.</p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Nombre</th><th className={TH}>Valor</th><th className={THN}>Orden</th><th /></tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>Sin atributos todavía.</td></tr>}
            {filas.map((a) => editar === a.id ? (
              <tr key={a.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={4} className={TD}>
                  <form action={accionGuardarAtributo} className="flex flex-wrap items-center gap-2">
                    <Ocultos p={p} seccion={seccion} />
                    <input type="hidden" name="id" value={a.id} />
                    <input name="nombre" defaultValue={a.nombre} className={`${CAMPO} w-36`} autoFocus />
                    <input name="valor" defaultValue={a.valor} className={`${CAMPO} flex-1 min-w-40`} />
                    <CampoNumero name="orden" valor={a.orden} tipo="entero" className={`${CAMPO} w-16`} />
                    <button className={VERDE}>Guardar</button>
                    <Link href={aqui(p, seccion)} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={a.id} className={TR}>
                <td className={`${TD} font-semibold`}>{a.nombre}</td>
                <td className={TD}>{a.valor}</td>
                <td className={TDN}>{a.orden}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={aqui(p, seccion, { editar: a.id })} />
                    <TachoConfirmar accion={accionBorrarAtributo} campos={ocultos(p, seccion, { id: a.id })} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Fotos ─────────────────────────────────────────────────

type Foto = { id: number; url: string; dueno: number };

function TiraFotos({ p, seccion, fotos, de }: { p: Producto; seccion: string; fotos: Foto[]; de: "producto" | "variacion" }) {
  if (!fotos.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {fotos.map((f, i) => (
        <figure key={f.id} className="w-32 bg-white border border-[#E3E9F0] rounded-xl p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={`Foto ${i + 1}`} className="w-full h-28 object-contain rounded-lg bg-[#FAFBFC]" />
          <figcaption className="flex items-center justify-between gap-1 mt-1.5">
            <span className="inline-flex gap-1">
              <form action={accionMoverFoto}>
                <Ocultos p={p} seccion={seccion} /><input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="de" value={de} /><input type="hidden" name="hacia" value="arriba" />
                <button disabled={i === 0} className={`${SUAVE} !px-2 !py-1 disabled:opacity-40`} aria-label="Mover antes">◀</button>
              </form>
              <form action={accionMoverFoto}>
                <Ocultos p={p} seccion={seccion} /><input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="de" value={de} /><input type="hidden" name="hacia" value="abajo" />
                <button disabled={i === fotos.length - 1} className={`${SUAVE} !px-2 !py-1 disabled:opacity-40`} aria-label="Mover después">▶</button>
              </form>
            </span>
            <TachoConfirmar accion={accionBorrarFoto} campos={ocultos(p, seccion, { id: f.id, de })} pregunta="¿Borrar?" />
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export async function SeccionFotos({ s, p, seccion }: Props) {
  const fotos = await consulta<Foto>(
    "select id::int, url, producto_id::int dueno from producto_foto where producto_id = $2 and organizacion_id = $1 order by orden, id", [s.org.id, p.id]);
  const conVariaciones = p.tipo === "con_variaciones";
  const variaciones = conVariaciones ? await variacionesDe(s.org.id, p.id) : [];
  const deVariaciones = conVariaciones ? await consulta<Foto>(`
    select f.id::int, f.url, f.variacion_id::int dueno from variacion_foto f join variacion v on v.id = f.variacion_id
     where v.producto_id = $2 and f.organizacion_id = $1 order by f.orden, f.id`, [s.org.id, p.id]) : [];
  return (
    <div className="space-y-4">
      <section className={CAJA}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold">Fotos del producto</h2>
          <SubirFoto orgId={s.org.id} productoId={p.id} />
        </div>
        {fotos.length ? <TiraFotos p={p} seccion={seccion} fotos={fotos} de="producto" />
          : <p className="text-xs text-[#5C6B76]">Todavía no hay fotos. La primera es la principal.</p>}
      </section>
      {variaciones.map((v) => {
        const propias = deVariaciones.filter((f) => f.dueno === v.id);
        return (
          <section key={v.id} className={CAJA}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-bold"><span className="font-mono text-[#5C6B76]">{v.sku}</span> {v.atributos ?? v.titulo_efectivo}</h2>
              <SubirFoto orgId={s.org.id} productoId={p.id} variacionId={v.id} texto="Fotos propias" />
            </div>
            {propias.length ? <TiraFotos p={p} seccion={seccion} fotos={propias} de="variacion" />
              : <p className="text-xs text-[#5C6B76]">Sin fotos propias: usa las del producto.</p>}
          </section>
        );
      })}
    </div>
  );
}

// ── Cucardas ──────────────────────────────────────────────

export async function SeccionCucardas({ s, p, seccion, editando }: Props) {
  const filas = await consulta<{ id: number; nombre: string; color: string; estado: string; tiene: boolean; desde: string | null; hasta: string | null }>(`
    select c.id::int, c.nombre, c.color, c.estado, pc.id is not null tiene,
           to_char(pc.desde, 'YYYY-MM-DD') desde, to_char(pc.hasta, 'YYYY-MM-DD') hasta
      from cucarda c left join producto_cucarda pc on pc.cucarda_id = c.id and pc.producto_id = $2
     where c.organizacion_id = $1 and (c.estado = 'activa' or pc.id is not null)
     order by c.orden, c.nombre`, [s.org.id, p.id]);
  if (!filas.length) {
    return <p className="text-xs text-[#5C6B76]">No hay cucardas cargadas. Se crean en <Link href="/catalogo/cucardas" className="text-[#16577F]">Cucardas</Link>.</p>;
  }
  const fechaAR = (f: string | null) => (f ? f.split("-").reverse().join("/") : "—");
  const tabla = (
    <div className={CAJA_TABLA}>
      <table className={TABLA}>
        <thead className={THEAD}><tr><th className={TH}>Lleva</th><th className={TH}>Cucarda</th><th className={TH}>Desde</th><th className={TH}>Hasta</th></tr></thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.id} className={TR}>
              <td className={TD}>
                {editando
                  ? <input type="checkbox" name={`c${c.id}`} defaultChecked={c.tiene} className="h-4 w-4 accent-[#16577F]" aria-label={c.nombre} />
                  : <input type="checkbox" disabled checked={c.tiene} className="h-4 w-4 accent-[#16577F]" aria-label={c.nombre} />}
              </td>
              <td className={TD}>
                <span className="inline-block rounded px-2 py-0.5 text-white text-[11px] font-bold" style={{ background: c.color }}>{c.nombre}</span>
                {c.estado !== "activa" && <span className="ml-2"><Estado texto="Archivada" /></span>}
              </td>
              <td className={TD}>{editando ? <input type="date" name={`desde${c.id}`} defaultValue={c.desde ?? ""} className={`${CAMPO} w-36`} /> : <ValorVista className="w-36">{c.tiene && c.desde ? fechaAR(c.desde) : null}</ValorVista>}</td>
              <td className={TD}>{editando ? <input type="date" name={`hasta${c.id}`} defaultValue={c.hasta ?? ""} className={`${CAMPO} w-36`} /> : <ValorVista className="w-36">{c.tiene && c.hasta ? fechaAR(c.hasta) : null}</ValorVista>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (!editando) {
    return (
      <div className="max-w-2xl">
        <p className="text-xs text-[#5C6B76] mb-2">Las que lleva este producto (sin fechas, rige siempre). Además hereda las de su familia. Se cambian con el lápiz.</p>
        {tabla}
      </div>
    );
  }
  return (
    <form id="ficha" action={accionGuardarCucardas} className="max-w-2xl">
      <Ocultos p={p} seccion={seccion} />
      <p className="text-xs text-[#5C6B76] mb-2">Tildá las que lleva este producto. Sin fechas, rige siempre. Además hereda las de su familia.</p>
      {tabla}
    </form>
  );
}

// ── Kit ───────────────────────────────────────────────────

export async function SeccionKit({ s, p, sp, seccion }: Props) {
  const kit = p.variacion_default;
  if (!kit) return <p className="text-xs text-[#5C6B76]">El kit no tiene su variación todavía.</p>;
  const editar = Number(sp.editar) || 0;
  const [componentes, depositos] = await Promise.all([
    consulta<{ id: number; cantidad: number; sobrante: boolean; variacion_id: number; producto_id: number; sku: string; titulo: string; disponible: number }>(`
      select k.id::int, k.cantidad, k.sobrante, v.id::int variacion_id, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo,
             (select coalesce(sum(stock_disponible_deposito(k.organizacion_id, v.id, d.id)), 0) from deposito d
               where d.organizacion_id = k.organizacion_id and d.estado = 'activo')::int disponible
        from kit_componente k join variacion v on v.id = k.variacion_componente_id
       where k.variacion_kit_id = $2 and k.organizacion_id = $1 order by k.sobrante, v.sku`, [s.org.id, kit]),
    consulta<{ id: number; nombre: string; disponible: number }>(`
      select d.id::int, d.nombre, stock_disponible_deposito(d.organizacion_id, $2, d.id) disponible
        from deposito d where d.organizacion_id = $1 and d.estado = 'activo' order by d.nombre, d.id`, [s.org.id, kit]),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <AltaNueva texto="Nuevo componente" sinBoton className="mb-3">
          <form action={accionAgregarComponente} className="flex flex-wrap items-center gap-2">
            <Ocultos p={p} seccion={seccion} />
            <input name="sku" placeholder="SKU del componente" className={`${CAMPO} w-48 font-mono`} autoFocus />
            <CampoNumero name="cantidad" valor={1} tipo="entero" className={`${CAMPO} w-20`} />
            <label className="flex items-center gap-1.5 text-xs text-[#5C6B76]">
              <input type="checkbox" name="sobrante" value="1" />
              Sobra al armarlo (entra al stock al vender el kit)
            </label>
            <button className={PRIMARIO}>Agregar componente</button>
          </form>
        </AltaNueva>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Componente</th><th className={THN}>Cantidad</th><th className={THN}>Disponible</th><th /></tr></thead>
            <tbody>
              {componentes.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>El kit todavía no tiene componentes.</td></tr>}
              {componentes.map((c) => editar === c.id ? (
                <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                  <td className={`${TD} font-mono`}>{c.sku}</td>
                  <td className={TD}>{c.titulo}</td>
                  <td colSpan={3} className={TD}>
                    <form action={accionGuardarComponente} className="flex items-center justify-end gap-2">
                      <Ocultos p={p} seccion={seccion} />
                      <input type="hidden" name="id" value={c.id} />
                      <CampoNumero name="cantidad" valor={c.cantidad} tipo="entero" className={`${CAMPO} w-20`} />
                      <button className={VERDE}>Guardar</button>
                      <Link href={aqui(p, seccion)} className={SUAVE} scroll={false}>Cancelar</Link>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={TR}>
                  <td className={`${TD} font-mono`}><Link href={`/catalogo/productos/${c.producto_id}`} className="text-[#16577F]">{c.sku}</Link></td>
                  <td className={TD}>{c.titulo}{c.sobrante && <span className="block text-[11px] text-[#167655]">Sobra al armarlo: entra al stock cuando se vende el kit</span>}</td>
                  <td className={TDN}>{c.sobrante ? `+${c.cantidad}` : c.cantidad}</td>
                  <td className={TDN}>{c.sobrante ? "—" : c.disponible.toLocaleString("es-AR")}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <span className="inline-flex gap-1">
                      <Lapiz href={aqui(p, seccion, { editar: c.id })} />
                      <TachoConfirmar accion={accionBorrarComponente} campos={ocultos(p, seccion, { id: c.id })} pregunta="¿Sacar?" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <section className="max-w-md">
        <h2 className="text-sm font-bold mb-1">Stock del kit por depósito</h2>
        <p className="text-xs text-[#5C6B76] mb-2">No se guarda: sale de cuántos kits completos se pueden armar con los componentes.</p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Depósito</th><th className={THN}>Kits disponibles</th></tr></thead>
            <tbody>
              {depositos.length === 0 && <tr><td colSpan={2} className={`${TD} text-[#5C6B76]`}>No hay depósitos activos.</td></tr>}
              {depositos.map((d) => <tr key={d.id} className={TR}><td className={TD}>{d.nombre}</td><td className={TDN}>{d.disponible.toLocaleString("es-AR")}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Precios ───────────────────────────────────────────────

export async function SeccionPrecios({ s, p, sp, seccion }: Props) {
  const [listas, variaciones] = await Promise.all([listasDePrecios(s.org.id), variacionesDe(s.org.id, p.id)]);
  const activas = listas.filter((l) => l.estado === "activa");
  if (!activas.length) {
    return <p className="text-xs text-[#5C6B76]">No hay listas de precios. Se crean en <Link href="/catalogo/precios" className="text-[#16577F]">Listas de precios</Link>.</p>;
  }
  const precios = new Map<string, Awaited<ReturnType<typeof precioDe>>>();
  await Promise.all(activas.flatMap((l) => variaciones.map(async (v) => {
    precios.set(`${l.id}-${v.id}`, await precioDe(s.org.id, v.id, l.id));
  })));
  const editar = sp.editar ?? "";
  const vista = s.moneda;
  return (
    <div className="space-y-4">
      <p className="text-xs text-[#5C6B76]">Importes en {vista === "USD" ? "dólares" : "pesos"}. Precio de lista (el tachado), descuento que rige y precio de venta. Un precio nuevo rige desde hoy.</p>
      {activas.map((l) => (
        <section key={l.id}>
          <h2 className="text-sm font-bold mb-1">{l.nombre} <span className="text-[11px] font-normal text-[#5C6B76]">· base {l.moneda_base}</span></h2>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr><th className={TH}>Variación</th><th className={THN}>Lista</th><th className={THN}>Descuento</th><th className={THN}>Venta</th><th className={TH}>Desde</th><th /></tr>
              </thead>
              <tbody>
                {variaciones.map((v) => {
                  const clave = `${l.id}-${v.id}`;
                  const pr = precios.get(clave) ?? null;
                  const nombre = <><span className="font-mono">{v.sku}</span>{v.atributos && <span className="text-[#5C6B76]"> · {v.atributos}</span>}</>;
                  return editar === clave ? (
                    <tr key={v.id} className={`${TR} bg-[#FAFBFC]`}>
                      <td className={TD}>{nombre}</td>
                      <td colSpan={5} className={TD}>
                        <form action={accionGuardarPrecio} className="flex flex-wrap items-center justify-end gap-2">
                          <Ocultos p={p} seccion={seccion} />
                          <input type="hidden" name="lista_id" value={l.id} />
                          <input type="hidden" name="variacion_id" value={v.id} />
                          <span className="text-[11px] text-[#5C6B76]">Precio de lista nuevo</span>
                          <CampoNumero name="importe" tipo="pesos" className={`${CAMPO} w-32`}
                            valor={pr ? (pr.monedaOrigen === "USD" ? pr.lista.usd : pr.lista.ars) : null} />
                          <select name="moneda" defaultValue={pr?.monedaOrigen ?? vista} className={CAMPO} aria-label="Moneda">
                            <option value="ARS">ARS</option><option value="USD">USD</option>
                          </select>
                          <button className={VERDE}>Guardar</button>
                          <Link href={aqui(p, seccion)} className={SUAVE} scroll={false}>Cancelar</Link>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={v.id} className={TR}>
                      <td className={TD}>{nombre}</td>
                      {pr ? (
                        <>
                          <td className={`${TDN} text-[#5C6B76] ${pr.descuentoPct > 0 ? "line-through" : ""}`}>{enVista(pr.lista, vista)}</td>
                          <td className={TDN}>{pct(pr.descuentoPct)}</td>
                          <td className={`${TDN} font-semibold`}>{enVista(pr.venta, vista)}</td>
                          <td className={`${TD} text-[#5C6B76] whitespace-nowrap`}>{pr.vigenteDesde.split("-").reverse().join("/")} · cargado en {pr.monedaOrigen}</td>
                        </>
                      ) : (
                        <td colSpan={4} className={`${TD} text-[#5C6B76]`}>Sin precio en esta lista.</td>
                      )}
                      <td className={`${TD} text-right`}><Lapiz href={aqui(p, seccion, { editar: clave })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Stock ─────────────────────────────────────────────────

export async function SeccionStock({ s, p }: Props) {
  const [variaciones, depositos] = await Promise.all([variacionesDe(s.org.id, p.id), depositosActivos(s.org.id)]);
  const celdas = await consulta<{ v: number; d: number; n: number }>(`
    select v.id::int v, d.id::int d, stock_disponible_deposito(v.organizacion_id, v.id, d.id) n
      from variacion v cross join deposito d
     where v.producto_id = $2 and v.organizacion_id = $1 and d.organizacion_id = $1 and d.estado = 'activo'`, [s.org.id, p.id]);
  const valor = (v: number, d: number) => celdas.find((c) => c.v === v && c.d === d)?.n ?? 0;
  if (!depositos.length) return <p className="text-xs text-[#5C6B76]">No hay depósitos activos.</p>;
  return (
    <>
      <p className="text-xs text-[#5C6B76] mb-2">
        Disponible (lo que hay menos lo reservado) por depósito.{p.stock_minimo != null && <> Stock mínimo: {p.stock_minimo}.</>}
        {p.tipo === "kit" && " El de un kit sale de sus componentes."}
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Variación</th>{depositos.map((d) => <th key={d.id} className={THN}>{d.nombre}</th>)}<th className={THN}>Total</th><th /></tr>
          </thead>
          <tbody>
            {variaciones.map((v) => {
              const total = depositos.reduce((t, d) => t + valor(v.id, d.id), 0);
              return (
                <tr key={v.id} className={TR}>
                  <td className={TD}><span className="font-mono">{v.sku}</span>{v.atributos && <span className="text-[#5C6B76]"> · {v.atributos}</span>}</td>
                  {depositos.map((d) => {
                    const n = valor(v.id, d.id);
                    return <td key={d.id} className={`${TDN} ${n < 0 ? "text-[#C03420]" : ""}`}>{n.toLocaleString("es-AR")}</td>;
                  })}
                  <td className={`${TDN} font-semibold ${p.stock_minimo != null && total < p.stock_minimo ? "text-[#C03420]" : ""}`}>{total.toLocaleString("es-AR")}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}><Link href={`/stock/consulta?v=${v.id}`} className={SUAVE}>Ver detalle</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Publicaciones ─────────────────────────────────────────

export async function SeccionPublicaciones({ s, p, sp }: Props) {
  const webs = await canalesWebDe(s.org.id, p.id);
  // Los precios de las publicaciones son en pesos: en dólares, al tipo de cambio de hoy.
  const tcHoy = await tcParaVista(s.org.id, s.moneda);
  const todasLasFilas = await consulta<{ id: number; sku: string; canal: string; canal_id: number; canal_tipo: string; catalogo: boolean; id_externo: string | null; titulo: string; tipo_publicacion: string | null; plan: string | null; cuotas_visibles: number | null; estado: string;
    precio: number | null; precio_tachado: number | null; campana: string | null; stock_ml: number | null; estado_ml: string | null; enlace: string | null; disp_web: number | null; vendidos: number | null; motivo: string | null; por_precio: boolean | null;
    paga_ml: number | null; tachado_ml: number | null; leido_ml: string | null; campana_ml: string | null }>(`
    select pu.id::int, v.sku, ${CAMPOS_PRECIO_COMPRADOR}, c.nombre canal, pu.canal_id::int, c.tipo canal_tipo, ${ES_CATALOGO} catalogo, pu.id_externo,
           -- La publicación en ML (Fer, 5/10): su dirección, o la que arma ML con el número.
           case when c.tipo = 'mercadolibre' and pu.id_externo is not null
                then coalesce(mi.permalink, 'https://articulo.mercadolibre.com.ar/' || regexp_replace(pu.id_externo, '^([A-Z]{3})(\\d+)$', '\\1-\\2')) end enlace, coalesce(pu.titulo, titulo_variacion(v.id)) titulo, pu.tipo_publicacion,
           -- El plan de cuotas (Fer, 7/10), para empatarlo con lo que se ve en ML.
           ${PLAN_PUBLICACION} plan, ${CUOTAS_VISIBLES_PUBLICACION}::int cuotas_visibles, pu.estado,
           -- En campaña (Fer, 8/10): ML deja el precio de la publicación en el tachado y el de la campaña
           -- lo informa aparte; el que paga el comprador es el menor de las campañas en curso (leídas por Laucen).
           case when cp.precio < pu.precio_canal then cp.precio else pu.precio_canal end::float8 precio,
           case when cp.precio < pu.precio_canal then pu.precio_canal else pu.precio_tachado end::float8 precio_tachado, cp.nombre campana,
           mi.stock stock_ml, mi.estado estado_ml,
           -- Vendidos en ML (lo que informa ML de la publicación); sin ventas, 0. La web no tiene.
           case when c.tipo = 'mercadolibre' then coalesce(mi.vendidos, 0) end::int vendidos,
           -- En revisión en ML: el motivo que informa ML (lib/mercadolibre/moderaciones.ts).
           mm.motivo, mm.por_precio,
           -- En la web: lo disponible para ese canal (con 0, la publicación activa se muestra "Sin stock").
           case when c.tipo in ('web_minorista', 'web_mayorista') then stock_disponible_canal(pu.organizacion_id, v.id, pu.canal_id)::int end disp_web
      from publicacion pu join variacion v on v.id = pu.variacion_id join canal c on c.id = pu.canal_id
      ${UNIR_MELI_ITEM}
      ${UNIR_MODERACION}
      ${UNIR_PRECIO_COMPRADOR}
      left join lateral (select min(m.precio) precio, string_agg(distinct coalesce(m.nombre, m.tipo), ' · ') nombre from ml_promo_item m
                          where m.canal_id = pu.canal_id and m.item_id = pu.id_externo and m.estado = 'started'
                            and m.precio > 0 and (m.hasta is null or m.hasta > now())) cp on c.tipo = 'mercadolibre'
     where v.producto_id = $2 and pu.organizacion_id = $1 order by c.nombre, v.sku`, [s.org.id, p.id]);
  // Filtro por canal (Fer, 8/10); de entrada, todos.
  const canalesPub = [...new Map(todasLasFilas.map((f) => [f.canal_id, f.canal])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const canalFiltro = Number(sp.pcanal) || 0;
  const filas = canalFiltro ? todasLasFilas.filter((f) => f.canal_id === canalFiltro) : todasLasFilas;
  const tono = (e: string) => (e === "activa" ? "verde" : e === "pausada" ? "amarillo" : "gris") as "verde" | "amarillo" | "gris";
  // Se ordena tocando el título de la columna (Fer, 7/10); son pocas filas, en memoria.
  const CLAVES: Record<string, (f: (typeof filas)[number]) => string | number | null> = {
    canal: (f) => `${f.canal_tipo === "mercadolibre" ? 1 : 0} ${f.canal}`, sku: (f) => f.sku, id: (f) => f.id_externo, titulo: (f) => f.titulo, plan: (f) => rangoPlan(f.plan),
    precio: (f) => f.paga_ml ?? f.precio, estado: (f) => f.estado, stock: (f) => f.stock_ml, ventas: (f) => f.vendidos,
  };
  const clave = sp.orden && Object.hasOwn(CLAVES, sp.orden) ? CLAVES[sp.orden] : null;
  // Sin elegir (Fer, 8/10): arriba la web; después cada cuenta de ML y, adentro, del plan más barato al más
  // caro (Clásica, 3x, Premium, 9x, 12x), la de catálogo después de la común del mismo plan.
  filas.sort((a, b) => Number(a.canal_tipo === "mercadolibre") - Number(b.canal_tipo === "mercadolibre") || a.canal.localeCompare(b.canal, "es")
    || a.sku.localeCompare(b.sku, "es", { numeric: true }) || rangoPlan(a.plan) - rangoPlan(b.plan) || Number(a.catalogo) - Number(b.catalogo) || a.id - b.id);
  if (clave) {
    const signo = sp.dir === "desc" ? -1 : 1;
    filas.sort((a, b) => {
      const x = clave(a), y = clave(b);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
      return signo * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true }));
    });
  }
  return (
    <>
      <div className={`${CAJA} mb-3 grid gap-2 max-w-md`}>
        {/* Insumo o parte de otro (ej. la unidad "-U" que sólo se vende en pack): no va a ML ni a la web. */}
        <Interruptor accion={accionNoPublicable} prendido={p.no_publicable}
          campos={{ producto_id: String(p.id), seccion: "publicaciones" }}
          etiqueta="No publicable (insumo o parte de otro)"
          ayuda={p.no_publicable ? "No va a Mercado Libre ni a la web y no aparece en \"sin publicar\"." : "Prendelo si este producto no se vende solo (ej. la unidad de un pack)."} />
      </div>
      {webs.length > 0 && !p.no_publicable && (
        <div className={`${CAJA} mb-3 grid gap-2 max-w-md`}>
          {/* La web es un canal más: el producto se ve en la tienda sólo si está publicado ahí. */}
          {webs.map((w) => (
            <Interruptor key={w.id} accion={accionPublicarWeb} prendido={w.publicado}
              campos={{ producto_id: String(p.id), canal: String(w.id), seccion: "publicaciones" }}
              etiqueta={`Publicado en ${w.nombre}`}
              ayuda={w.publicado ? "Se ve en la tienda (si tiene precio en la lista del canal)." : "No se ve en la tienda."} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 mb-2">
        {/* El total de ventas en ML del producto (Fer, 5/10): la suma de lo vendido de sus publicaciones; sin ventas, 0. */}
        <span className="mr-auto inline-flex items-center gap-3 text-xs text-[#5C6B76]">
          <FiltroVivo parametro="pcanal" valor={canalFiltro ? String(canalFiltro) : ""} etiqueta="Canal">
            <option value="">Todos los canales ({todasLasFilas.length})</option>
            {canalesPub.map(([id, nombre]) => <option key={id} value={id}>{nombre} ({todasLasFilas.filter((f) => f.canal_id === id).length})</option>)}
          </FiltroVivo>
          <span>Vendidos en Mercado Libre: <b className="text-[#1F2A33] tabular-nums">{filas.reduce((t, f) => t + (f.vendidos ?? 0), 0).toLocaleString("es-AR")}</b></span>
        </span>
        {/* Publicarlo en una cuenta de ML copiando una publicación parecida (queda esperando el clic en la cola). */}
        {!p.no_publicable && <Link href={`/catalogo/productos/${p.id}/publicar-ml`} className={SUAVE}>Publicar en ML copiando otra</Link>}
        {/* Directo a la publicación nueva armada con los datos de Laucen y la IA (Fer, 5/10). */}
        {!p.no_publicable && <Link href={`/catalogo/productos/${p.id}/publicar-ml?ver=nueva`} className={PRIMARIO}>Nueva desde Laucen con IA</Link>}
        {/* Todas las cuentas con sus planes de cuotas, copiando la que ya tiene (Fer, 8/10). */}
        {!p.no_publicable && <Link href={`/catalogo/productos/${p.id}/publicar-ml?ver=todas`} className={PRIMARIO}>Publicar en todas las cuentas</Link>}
        <Link href="/catalogo/publicaciones" className={SUAVE}>Ir a Publicaciones</Link>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><ThOrden col="canal" porDefecto>Canal</ThOrden><ThOrden col="sku">Variación</ThOrden><ThOrden col="id">Id externo</ThOrden><ThOrden col="titulo">Título</ThOrden>
              <ThOrden col="plan">Plan</ThOrden><ThOrden col="precio" n>Precio</ThOrden><ThOrden col="estado">Estado</ThOrden>
              <ThOrden col="stock" n title="Lo que Mercado Libre tiene cargado como disponible">Stock</ThOrden><ThOrden col="ventas" n title="Vendidos en Mercado Libre">Ventas</ThOrden></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>Ninguna variación de este producto está publicada.</td></tr>}
            {filas.map((f) => (
              <tr key={f.id} data-canal={f.canal_id} className={TR}>
                <td className={TD}>{f.canal}</td>
                <td className={`${TD} font-mono`}>{f.sku}</td>
                {/* El número abre el historial de la publicación; la flechita, Mercado Libre en otra pestaña. */}
                <td className={`${TD} font-mono whitespace-nowrap`}>{f.enlace && f.id_externo
                  ? <><Link href={historialPublicacion(f.id_externo)} className="text-[#16577F] hover:underline" title="Historial de esta publicación">{f.id_externo}</Link> <a href={f.enlace} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline" title="Ver en Mercado Libre">↗</a></>
                  : f.id_externo ?? "—"}</td>
                <td className={TD}>{f.enlace
                  ? <a href={f.enlace} target="_blank" rel="noopener noreferrer" className="hover:text-[#16577F] hover:underline">{f.titulo} ↗</a>
                  : f.titulo}</td>
                <td className={`${TD} whitespace-nowrap`}>{f.plan ? <PlanPublicacion plan={f.plan} cuotas={f.cuotas_visibles} /> : f.tipo_publicacion ?? "—"}{f.catalogo && <span className="block mt-0.5"><MarcaCatalogo /></span>}</td>
                <td className={TDN}>
                  {/* Como en ML (Fer, 8/10): grande lo que paga el cliente con su plan, el de lista chico y tachado, % OFF y la campaña chiquita. */}
                  {/* Lo que informa ML (según ML, hace …) si ya se leyó; si no, la cuenta con la campaña en curso. */}
                  {f.paga_ml != null
                    ? <PrecioPublicacion paga={f.paga_ml} lista={f.tachado_ml} campana={f.campana_ml} texto={(n) => enMoneda(n, s.moneda, tcHoy)} leido={f.leido_ml} />
                    : f.precio != null
                    ? <PrecioPublicacion paga={f.precio} lista={f.precio_tachado} campana={f.campana} texto={(n) => enMoneda(n, s.moneda, tcHoy)} />
                    : <span className="text-[#5C6B76]">—</span>}
                </td>
                <td className={TD}>
                  {/* Web (Fer, 5/10): activa pero sin stock disponible → "Sin stock"; con el interruptor apagado, "Pausada". */}
                  {f.disp_web != null && f.estado === "activa" && f.disp_web <= 0
                    ? <Estado texto="Sin stock" tono="ambar" />
                    : <Estado texto={f.estado.charAt(0).toUpperCase() + f.estado.slice(1)} tono={tono(f.estado)} />}
                  {f.estado_ml && <span className="block text-[10px] text-[#5C6B76]">En ML: {textoEstadoMl(f.estado_ml)}</span>}
                  {f.estado_ml === "under_review" && (
                    <span className="mt-0.5 block max-w-64 whitespace-normal text-[10px] leading-3 text-[#8a6100]" title={f.motivo ?? undefined}>
                      {f.por_precio && <span className="mr-1"><Estado texto="Por precio" tono="rojo" /></span>}
                      {f.motivo ? (f.motivo.length > 140 ? `${f.motivo.slice(0, 140)}…` : f.motivo) : "Motivo todavía no leído"}
                    </span>
                  )}
                </td>
                {/* Lo que ML tiene cargado como disponible (también si está pausada), de la copia local meli_item. */}
                <td className={TDN}>{f.stock_ml != null ? f.stock_ml : <span className="text-[#5C6B76]">—</span>}</td>
                <td className={TDN}>{f.vendidos != null ? f.vendidos.toLocaleString("es-AR") : <span className="text-[#5C6B76]">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
