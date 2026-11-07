// Lo que el asistente sabe de la pantalla en la que está la persona, además del manual (Fer, 7/11): en Market Pro,
// qué hay en sus tablas y el informe de la categoría elegida, para que pueda seguir investigando lo que dice el informe
// con consultas a la base. Nunca tira: si algo falla, el asistente sigue sin esto.

import { tienePermiso, type Permisos } from "@/lib/permisos";
import { DICCIONARIO_MPRO } from "@/lib/marketpro/diccionario";
import { extrasDe, informeGuardado } from "@/lib/marketpro/informe";

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
  } catch (e) {
    console.error("[asistente] contexto de pantalla", e);
  }
  return "";
}
