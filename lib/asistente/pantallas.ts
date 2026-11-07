// Lo que el asistente sabe de la pantalla en la que está la persona, además del manual (Fer, 7/11): en Market Pro,
// qué hay en sus tablas y el informe de la categoría elegida, para que pueda seguir investigando lo que dice el informe
// con consultas a la base. Nunca tira: si algo falla, el asistente sigue sin esto.

import { tienePermiso, type Permisos } from "@/lib/permisos";
import { DICCIONARIO_MPRO } from "@/lib/marketpro/diccionario";
import { extrasDe, informeGuardado } from "@/lib/marketpro/informe";
import { DICCIONARIO_ANALISIS, extrasAnalisis } from "@/lib/analisis-diario/extras";
import { analisisDe } from "@/lib/analisis-diario/correr";
import { resumenOfertas } from "@/lib/analisis-diario/calcular";

export async function contextoDePantalla(ruta: string, org: string, permisos: Permisos, superadmin: boolean): Promise<string> {
  try {
    const u = new URL(ruta, "https://x");
    if (u.pathname.startsWith("/market-pro") && (superadmin || tienePermiso(permisos, "market_pro_ver"))) {
      const cat = Number(u.searchParams.get("cat")) || 0;
      let texto = `\n\nEstá en Market Pro. Si te pide analizar, investigar o «fijate vos» algo de estos datos, hacelo vos mismo con consultar_sql (varias consultas si hace falta) y contestá con los números; no le devuelvas la tarea.\n${DICCIONARIO_MPRO}`;
      if (u.pathname === "/market-pro/informe") {
        const [inf, extras] = await Promise.all([informeGuardado(org, cat), extrasDe(org, cat)]);
        texto += `\n\nEstá mirando el informe de la categoría ${cat || "(todas las bajadas)"}${cat ? ` (en SQL: cat in (select category_id from mpro_categoria where pais = 'ar' and (category_id = ${cat} or ${cat} = any(padres))))` : ""}. Lo que dice el informe (escrito por la IA el ${inf?.generado_ts ?? "—"}, con datos hasta ${inf?.datos_hasta?.slice(0, 7) ?? "—"}):\n${inf?.texto ?? "(todavía no hay informe escrito)"}`;
        if (extras.length) texto += `\n\nLo que ya se agregó al informe desde el asistente:\n${extras.map((e) => `### ${e.pregunta ?? "Agregado"}\n${e.texto}`).join("\n\n")}`.slice(0, 30_000);
        texto += "\n\nDebajo de cada respuesta tuya hay un botón «Agregar al informe»: si la persona quiere guardar lo que encontraste, que lo toque. Escribí las respuestas de análisis como para que queden bien en el informe (títulos cortos, números con su período).";
      }
      return texto;
    }
    if (u.pathname === "/informes/analisis-diario" && (superadmin || tienePermiso(permisos, "analisis_diario_ver"))) {
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("fecha") ?? "") ? u.searchParams.get("fecha") : null;
      const a = await analisisDe(org, fecha);
      let texto = `\n\nEstá en Informes › Análisis semanal (campañas de Mercado Libre, ofertas relámpago y compartidas, publicidad en ML, Google y Meta, y visitas de la tienda). Si te pide analizar, investigar, reanalizar o «investigalo vos» algo, hacelo vos mismo con consultar_sql (varias consultas si hace falta: por cuenta, por producto, por día, la semana contra la anterior) y contestá con los números y la causa que encontraste; no le devuelvas la tarea. Si no podés llegar a la causa con los datos, decí qué miraste y qué falta.\n${DICCIONARIO_ANALISIS}`;
      if (a) {
        const d = a.datos;
        const corto = {
          fecha: a.fecha, familias: d.config.familias, topeBajaPct: d.config.maxBajaPct, urgentes: d.urgentes,
          publicidad: { periodo: [d.publicidad.desde, d.publicidad.hasta], anterior: [d.publicidad.desdeAntes, d.publicidad.hastaAntes], canales: d.publicidad.canales, campanasGoogleMeta: d.publicidad.campanas, mlAds: d.publicidad.mlAds.slice(0, 15) },
          visitas: { total: d.visitas.total, antes: d.visitas.antes, origenes: d.visitas.origenes },
          relampagoPorProducto: resumenOfertas(d.ofertas, true), compartidasPorProducto: resumenOfertas(d.ofertas, false),
          campanas: { publicaciones: d.campanas.publicaciones, enCampana: d.campanas.enCampana, filas: d.campanas.filas.slice(0, 40).map((f) => ({ estado: f.estado, sku: f.sku, cuenta: f.cuenta, item: f.itemId, plan: f.plan, pagaHoy: f.pagaHoy, esquema: f.venta, detalle: f.detalle })) },
        };
        texto += `\n\nEstá mirando el análisis del ${a.fecha}. Lo que escribió la IA:\n${a.resumen ?? "(sin resumen)"}\n\nLos datos del análisis (JSON):\n${JSON.stringify(corto)}`.slice(0, 40_000);
        const extras = await extrasAnalisis(org, a.fecha);
        if (extras.length) texto += `\n\nLo que ya se agregó al análisis desde el asistente:\n${extras.map((e) => `### ${e.pregunta ?? "Agregado"}\n${e.texto}`).join("\n\n")}`.slice(0, 20_000);
        texto += "\n\nDebajo de cada respuesta tuya hay un botón «Agregar al informe»: si la persona quiere guardar lo que encontraste en este análisis, que lo toque. Escribí las respuestas de análisis como para que queden bien ahí (títulos cortos, números con su período).";
      } else texto += "\n\nTodavía no hay ningún análisis guardado: se hace con «Volver a analizar».";
      return texto;
    }
  } catch (e) {
    console.error("[asistente] contexto de pantalla", e);
  }
  return "";
}
