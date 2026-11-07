"use server";
// Informes › Análisis diario: volver a analizar, entrar a las ofertas que cumplen, preparar el lote de campañas y la
// configuración. Lo que va a Mercado Libre sale sólo con el clic (AGENTS.md): las ofertas, directo a la cola (como el
// «Entrar» de Precios en ML › Relámpago); las campañas, como lote preparado que se manda desde la Cola de Mercado Libre.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, numero, tildado } from "@/lib/erp/acciones";
import { deFondo } from "@/lib/tareas-fondo";
import { ErrorErp } from "@/lib/erp/base";
import { encolar, encolarLoteConBoton, type CambioMl } from "@/lib/mercadolibre/cola";
import { cambioEntrar, elegirOfertas, enviosRelampago, relampagos, stockAuto } from "@/lib/precios-ml/relampago";
import { cadenaFamilias } from "@/lib/precios-ml/motor";
import { familiasDe } from "@/lib/precios-ml/datos";
import { analizarCampanas, evaluarOferta } from "@/lib/analisis-diario/calcular";
import { configAnalisis, guardarConfigAnalisis } from "@/lib/analisis-diario/config";
import { correrAnalisis, PANTALLA } from "@/lib/analisis-diario/correr";

const pesos = (x: number) => `$ ${Math.round(x).toLocaleString("es-AR")}`;

/** «Volver a analizar»: el análisis de hoy, de nuevo (pisa el de hoy; sin aviso al celular). */
export async function accionAnalizar() {
  const s = await entrarErp("analisis_diario_ver");
  return deFondo(s, "analisis-diario", "Análisis diario", async () => {
    const r = await correrAnalisis(s.org.id, { avisar: false });
    revalidatePath(PANTALLA);
    return r.urgentes ? `Listo: ${r.urgentes === 1 ? "1 cosa" : `${r.urgentes} cosas`} para mirar.` : "Listo: nada urgente.";
  });
}

/** «Entrar a las ofertas que cumplen»: las relámpago y compartidas de las familias del análisis que bajan hasta el % de la
 *  configuración, llegan al piso y tienen el stock que piden (de las relámpago, una por producto), con todas las unidades
 *  disponibles. Recalculado en el momento (no lo de la mañana). Van directo a la cola de ML. */
export async function accionEntrarOfertas() {
  const s = await entrarErp("analisis_diario_ver");
  return deFondo(s, "analisis-ofertas", "Entrar a las ofertas que cumplen", async () => {
    const cfg = await configAnalisis(s.org.id);
    const [todas, familias, envios] = await Promise.all([relampagos(s.org.id, null), familiasDe(s.org.id), enviosRelampago(s.org.id)]);
    const elegidas = new Set(cfg.familias);
    const candidatas = todas.filter((f) => cadenaFamilias(f.familia_id, familias.padres).some((x) => elegidas.has(x)) && evaluarOferta(f, cfg.maxBajaPct).entra);
    const ofertas = elegirOfertas(candidatas, todas, envios);
    if (!ofertas.length) throw new ErrorErp("Ahora no hay ninguna oferta que cumpla (o ya se pidieron todas).");
    await encolar(s.org.id, ofertas.map((f) => cambioEntrar(f, stockAuto(f))), { origen: "boton", usuarioId: s.usuario.id });
    revalidatePath(PANTALLA);
    return `Listo: ${ofertas.length === 1 ? "1 oferta va" : `${ofertas.length} ofertas van`} a Mercado Libre por la cola.`;
  });
}

/** «Preparar lote de campañas»: las publicaciones al tachado sin campaña que pueden entrar a una de ML bajando hasta el %
 *  de la configuración, un lote por cuenta. Recalculado en el momento. Nada sale hasta «Mandar a Mercado Libre» en la cola. */
export async function accionPrepararCampanas() {
  const s = await entrarErp("analisis_diario_ver");
  return deFondo(s, "analisis-campanas", "Preparar lote de campañas", async () => {
    const cfg = await configAnalisis(s.org.id);
    const { filas } = await analizarCampanas(s.org.id, cfg);
    const porCanal = new Map<number, { cuenta: string; cambios: CambioMl[] }>();
    for (const f of filas) {
      if (f.estado !== "oportunidad" || !f.campana) continue;
      const c = f.campana;
      const g = porCanal.get(f.canalId) ?? { cuenta: f.cuenta, cambios: [] };
      g.cambios.push({
        canalId: f.canalId, itemId: f.itemId, tipo: "campana", antes: { precio: f.pagaHoy },
        payload: {
          descripcion: `Entrar a «${c.nombre ?? c.tipo}» a ${pesos(c.precio)} (${f.sku}${f.plan ? `, ${f.plan}` : ""}${c.bajaPct > 0 ? `; ${c.bajaPct.toLocaleString("es-AR")} % menos que el esquema` : ""})`,
          venta: c.precio,
          pedidos: [{ metodo: "POST", ruta: `/seller-promotions/items/${f.itemId}?app_version=v2`, cuerpo: { promotion_id: c.id, promotion_type: c.tipo, deal_price: c.precio } }],
        },
      });
      porCanal.set(f.canalId, g);
    }
    if (!porCanal.size) throw new ErrorErp("Ahora no hay ninguna publicación sin campaña que pueda entrar a una.");
    const lotes: number[] = [];
    for (const [canal, g] of porCanal) {
      lotes.push(await encolarLoteConBoton(s.org.id, canal, g.cambios,
        `Análisis diario: campañas para las que estaban sin campaña · ${g.cuenta} · ${g.cambios.length} publicaci${g.cambios.length === 1 ? "ón" : "ones"}`, s.usuario.id));
    }
    revalidatePath(PANTALLA);
    return `Listo: ${lotes.length === 1 ? `lote ${lotes[0]} preparado` : `lotes ${lotes.join(", ")} preparados`}. Se mandan desde Configuración › Cola de Mercado Libre, pestaña Lotes preparados.`;
  });
}

/** La configuración: familias (las tildadas siguen, más la que se elija para sumar), el % máximo y el aviso. */
export async function accionGuardarConfig(fd: FormData) {
  const s = await entrarErp("analisis_diario_ver");
  await intentar(`${PANTALLA}?ver=config`, async () => {
    const familias = fd.getAll("familia").map(Number).filter((x) => Number.isInteger(x) && x > 0);
    const nueva = Number(fd.get("familia_nueva"));
    if (Number.isInteger(nueva) && nueva > 0) familias.push(nueva);
    const max = numero(fd, "max_baja");
    if (max == null) throw new ErrorErp("Poné lo más que puede bajar una oferta (en %).");
    await guardarConfigAnalisis(s.org.id, { familias, maxBajaPct: max, avisar: tildado(fd, "avisar") });
    revalidatePath(PANTALLA);
    return { ir: `${PANTALLA}?ver=config&ok=${encodeURIComponent("Configuración grabada. Vale desde el próximo análisis (o apretá «Volver a analizar»).")}` };
  });
}
