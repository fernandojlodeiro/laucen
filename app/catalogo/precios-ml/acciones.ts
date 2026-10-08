"use server";

// Acciones de "Precios en Mercado Libre": las reglas (tachado, planes,
// márgenes, excepciones, volumen), los interruptores del canal y "Preparar
// cambios", que arma lotes preparados: nada sale a ML hasta que Fer aprieta
// "Mandar a Mercado Libre" en la cola (AGENTS.md).

import { lanzarTarea, deFondo } from "@/lib/tareas-fondo";
import { prepararPlanesFaltantes, textoFaltantes } from "@/lib/precios-ml/faltantes";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, texto, numero, entero, tildado } from "@/lib/erp/acciones";
import { ErrorErp, consulta } from "@/lib/erp/base";
import {
  guardarTachado, guardarPlan, borrarExcepcion, guardarVolumen, borrarVolumen, replicarVolumen, fijarInterruptor, productoPorSku, canalMl, canalesMl, campanasBajoPisoCanal,
  type Donde,
} from "@/lib/precios-ml/datos";
import { prepararCambios, sincronizarPreciosMl } from "@/lib/precios-ml/preparar";
import { PLANES, pedidoSalirCampana, tachadoDeDescuento } from "@/lib/precios-ml/motor";
import { encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { BASE_PML, PREVIA, limpiarCachePrevia } from "./lista";

/** El descuento que ve el comprador (lo que carga Fer) → el tachado % que se guarda. Vacío = hereda. */
function tachadoDelForm(fd: FormData): number | null {
  const d = numero(fd, "descuento_pct");
  if (d == null) return null;
  if (!(d >= 0 && d <= 75)) throw new ErrorErp("El descuento que ve el comprador tiene que estar entre 0 % y 75 %.");
  if (d > 0 && d < 5) throw new ErrorErp("Mercado Libre muestra el descuento sólo desde 5 %: poné 0 (sin descuento) o 5 % o más.");
  return tachadoDeDescuento(d);
}

const volver = (fd: FormData, base = BASE_PML) => {
  const v = texto(fd, "volver");
  return v && v.startsWith(BASE_PML) ? v : base;
};
const sinEditar = (v: string) => {
  const [b, q = ""] = v.split("?");
  const p = new URLSearchParams(q);
  p.delete("editar"); p.delete("nuevo");
  const s = p.toString();
  return s ? `${b}?${s}` : b;
};

/** Si el canal sincroniza precios solo, lo que cambió de las reglas se encola ya. */
async function siAutomatico(org: string, canal: number): Promise<string> {
  const c = await canalMl(org, canal);
  if (!c.sincronizarPrecios) return "";
  const r = await sincronizarPreciosMl(org, { canal });
  return r.encoladas ? ` «Sincronizar precios» está prendido: ${r.encoladas} cambio${r.encoladas === 1 ? "" : "s"} a la cola de ML.` : "";
}

/** De dónde es la excepción del formulario: categoría o producto (por SKU). */
async function dondeDe(org: string, fd: FormData): Promise<Donde> {
  const clave = texto(fd, "excepcion");
  if (clave) {
    const n = Number(clave.slice(1));
    if (clave[0] === "f" && n > 0) return { nivel: "familia", familiaId: n };
    if (clave[0] === "p" && n > 0) return { nivel: "producto", productoId: n };
  }
  const nivel = texto(fd, "nivel");
  if (nivel === "general") return { nivel: "general" };
  if (nivel === "familia") return { nivel: "familia", familiaId: id(fd, "familia_id") || null };
  if (nivel === "producto") return { nivel: "producto", productoId: await productoPorSku(org, texto(fd, "sku")) };
  throw new ErrorErp("Elegí a qué se aplica: una categoría o un producto.");
}

/** La caja general del canal: el descuento y «¿gana?» de la Clásica y de cada plan. */
export async function accionGuardarGeneral(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  const canal = id(fd, "canal");
  const v = volver(fd);
  await intentar(sinEditar(v), async () => {
    await guardarTachado(s.org.id, canal, { nivel: "general" }, tachadoDelForm(fd) ?? 0, numero(fd, "clasica_ajuste"));
    for (const p of PLANES) {
      // Qué planes, desde dónde, margen y cuotas: Precios en ML › Planes de cuotas. Acá, sólo «¿gana?».
      await guardarPlan(s.org.id, canal, p, { nivel: "general" }, { activo: null, precioMinimo: null, margenPct: null, cuotasVisibles: null, ajustePct: numero(fd, `${p}_ajuste`) });
    }
    revalidatePath(BASE_PML);
    return `Grabado.${await siAutomatico(s.org.id, canal)}`;
  });
}

/** Alta o cambio de una excepción (categoría o producto): descuento y «¿gana?»; vacío = hereda. */
export async function accionGuardarExcepcion(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  const canal = id(fd, "canal");
  const v = volver(fd);
  await intentar(sinEditar(v), async () => {
    const d = await dondeDe(s.org.id, fd);
    if (d.nivel === "general") throw new ErrorErp("Elegí una categoría o un producto.");
    await guardarTachado(s.org.id, canal, d, tachadoDelForm(fd), numero(fd, "clasica_ajuste"));
    for (const p of PLANES) {
      await guardarPlan(s.org.id, canal, p, d, { activo: null, precioMinimo: null, margenPct: null, ajustePct: numero(fd, `${p}_ajuste`) });
    }
    revalidatePath(BASE_PML);
    return `Grabado.${await siAutomatico(s.org.id, canal)}`;
  });
}

export async function accionBorrarExcepcion(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  const canal = id(fd, "canal");
  await intentar(volver(fd), async () => {
    await borrarExcepcion(s.org.id, canal, await dondeDe(s.org.id, fd));
    revalidatePath(BASE_PML);
    return `Borrada: vuelve a heredar.${await siAutomatico(s.org.id, canal)}`;
  });
}

/** Alta o cambio de un rango de descuento por volumen (hasta 5 escalones). */
export async function accionGuardarVolumen(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  const canal = id(fd, "canal");
  const v = volver(fd);
  await intentar(sinEditar(v), async () => {
    const fila = id(fd, "id") || null;
    const d: Donde = fila ? { nivel: "general" } : await dondeDe(s.org.id, fd);
    const escalones = [1, 2, 3, 4, 5].map((i) => ({ cantidad: entero(fd, `cant${i}`) ?? 0, pct: numero(fd, `pct${i}`) ?? 0 })).filter((e) => e.cantidad || e.pct);
    if (escalones.some((e) => !(e.cantidad >= 2) || !(e.pct > 0 && e.pct <= 90))) throw new ErrorErp("Cada escalón lleva una cantidad desde 2 y un % entre 0 y 90.");
    if (fila) {
      // El nivel no cambia al editar: se graba sobre la misma fila.
      const [f] = await consulta<{ nivel: Donde["nivel"]; familia_id: number | null; producto_id: number | null }>(
        "select nivel, familia_id::int, producto_id::int from ml_volumen_escala where id = $1 and organizacion_id = $2", [fila, s.org.id]);
      if (!f) throw new ErrorErp("Ese rango ya no existe.");
      await guardarVolumen(s.org.id, canal, { nivel: f.nivel, familiaId: f.familia_id, productoId: f.producto_id },
        { desde: numero(fd, "desde") ?? 0, hasta: numero(fd, "hasta"), escalones, sinDescuento: tildado(fd, "sin_descuento") }, fila);
    } else {
      await guardarVolumen(s.org.id, canal, d, { desde: numero(fd, "desde") ?? 0, hasta: numero(fd, "hasta"), escalones, sinDescuento: tildado(fd, "sin_descuento") });
    }
    revalidatePath(BASE_PML);
    return `Grabado.${await siAutomatico(s.org.id, canal)}`;
  });
}

export async function accionBorrarVolumen(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  await intentar(volver(fd), async () => {
    await borrarVolumen(s.org.id, id(fd, "id"));
    revalidatePath(BASE_PML);
    return "Borrado.";
  });
}

export async function accionReplicarVolumen(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  await intentar(volver(fd), async () => {
    const n = await replicarVolumen(s.org.id, id(fd, "canal"));
    revalidatePath(BASE_PML);
    return n ? `Copiado a ${n} cuenta${n === 1 ? "" : "s"} más (reemplazó lo que tenía${n === 1 ? "" : "n"}).` : "No hay otras cuentas de Mercado Libre.";
  });
}

const INTERRUPTORES = { sincronizar_precios: true, leer_precio_ganar: true, volumen_regla_stock: true } as const;

/** Prende o apaga un interruptor del canal. Prender "Sincronizar precios" es
 *  el clic de Fer que deja salir lo automático (AGENTS.md). */
export async function accionInterruptor(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  const canal = id(fd, "canal");
  const clave = texto(fd, "clave");
  await intentar(volver(fd), async () => {
    if (!clave || !Object.hasOwn(INTERRUPTORES, clave)) throw new ErrorErp("Ese interruptor no existe.");
    const prender = fd.get("valor") === "1";
    await fijarInterruptor(s.org.id, canal, clave as keyof typeof INTERRUPTORES, prender);
    revalidatePath(BASE_PML);
    if (clave === "sincronizar_precios") {
      if (!prender) return "Apagado: Laucen ya no manda precios solo a esta cuenta (lo preparado sigue esperando tu clic).";
      // La primera pasada corre de fondo: en una cuenta grande no entra en el tiempo de un clic (7/10).
      await lanzarTarea(s.org.id, s.usuario.id, `precios-ml:${canal}`, "Primera pasada de precios a Mercado Libre", async () => {
        const r = await sincronizarPreciosMl(s.org.id, { canal });
        return `Primera pasada: ${r.revisadas} variaciones revisadas, ${r.encoladas} cambios a la cola de ML (salen solos).`;
      });
      return "Prendido. La primera pasada corre de fondo: al terminar aparece el cartel abajo a la derecha.";
    }
    if (clave === "leer_precio_ganar") return prender ? "Prendido: Laucen lee el precio para ganar y las campañas de esta cuenta (sólo lectura)." : "Apagado: no se lee más el precio para ganar de esta cuenta.";
    return prender ? "Prendido: un escalón de volumen sólo si hay stock para su cantidad." : "Apagado: los escalones van aunque no haya stock para la cantidad.";
  });
}

/** "Preparar cambios": arma los lotes con el filtro de la vista previa. */
export async function accionPrepararCambios(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  const canal = id(fd, "canal");
  await intentar(volver(fd, PREVIA), async () => {
    // «Todas las cuentas»: un juego de lotes por cuenta.
    const canales = fd.get("todas") === "1" ? (await canalesMl(s.org.id)).map((c) => c.id) : [canal];
    const lotes = [];
    for (const c of canales) {
      lotes.push(...await prepararCambios(s.org.id, c, {
        familia: id(fd, "familia") || null, q: texto(fd, "q"), comienza: fd.get("contiene") !== "1",
      }, s.usuario.id, { precios: fd.get("precios") !== "0", volumen: fd.get("volumen") !== "0", crear: fd.get("crear") !== "0" }));
    }
    if (!lotes.length) return "No hay nada para cambiar: todo está como tiene que estar.";
    return {
      ir: `/config/canales/cola?ver=lotes&lote=${lotes[0].id}&ok=${encodeURIComponent(
        `Preparado, falta tu clic: ${lotes.map((l) => l.descripcion).join("; ")}. Revisá cada lote y apretá «Mandar a Mercado Libre».`)}`,
    };
  });
}

/** Alertas › «Sacar de la campaña»: arma un lote preparado (espera el clic de
 *  Fer en la cola) que saca la publicación de las campañas que la dejan
 *  debajo del piso. `clave` = "item|campaña" de una fila; sin clave, todas. */
export async function accionSacarCampanas(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  limpiarCachePrevia();
  const canal = id(fd, "canal");
  const clave = texto(fd, "clave");
  await intentar(volver(fd), async () => {
    const c = await canalMl(s.org.id, canal);
    const filas = (await campanasBajoPisoCanal(s.org.id, canal)).filter((f) => !clave || `${f.itemId}|${f.campanaId}` === clave);
    if (!filas.length) return "Ya no hay campañas debajo del piso para sacar (puede que ML las haya cambiado).";
    const cambios: CambioMl[] = filas.map((f) => ({
      canalId: canal, itemId: f.itemId, publicacionId: f.publicacionId, tipo: "campana",
      payload: {
        descripcion: `Salir de «${f.nombre ?? f.tipo}» (${f.sku}): con ella queda a $ ${f.precio.toLocaleString("es-AR")}, debajo del piso de $ ${Math.round(f.piso).toLocaleString("es-AR")}`,
        pedidos: [pedidoSalirCampana(f.itemId, { id: f.campanaId, tipo: f.tipo, estado: "started", precio: null, min: null, max: null })],
      },
    }));
    const lote = await encolarLoteConBoton(s.org.id, canal, cambios, `Salir de campañas debajo del piso · ${c.nombre} · ${cambios.length} publicaci${cambios.length === 1 ? "ón" : "ones"}`, s.usuario.id);
    return {
      ir: `/config/canales/cola?ver=lotes&lote=${lote}&ok=${encodeURIComponent("Preparado, falta tu clic: revisá el lote y apretá «Mandar a Mercado Libre».")}`,
    };
  });
}

/** Vista previa › «Crear los planes que faltan» (Fer, 8/10): en la cuenta elegida (y con el filtro de la
 *  pantalla), las publicaciones de planes de cuotas que le tocan según Precios en ML › Planes de cuotas y
 *  todavía no existen. Corre de fondo; arma un lote que espera tu clic. */
export async function accionCrearFaltantes(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  const canal = id(fd, "canal");
  return deFondo(s, `planes-faltantes:${canal}`, "Crear los planes de cuotas que faltan", async () => {
    const c = await canalMl(s.org.id, canal);
    const r = await prepararPlanesFaltantes(s.org.id, canal, { familia: id(fd, "familia") || null, q: texto(fd, "q"), comienza: fd.get("contiene") !== "1" }, s.usuario.id);
    limpiarCachePrevia();
    revalidatePath(PREVIA);
    revalidatePath("/config/canales/cola");
    return textoFaltantes(r, c.nombre);
  });
}
