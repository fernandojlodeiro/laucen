"use server";

// La lupa de la familia (FamiliaConLupa.tsx): qué categoría sugiere Mercado
// Libre para el título, y elegir una (lib/catalogo/categoria-ml.ts).

import { entrarErp } from "@/app/componentes/erp";
import { motivoErp } from "@/lib/erp/base";
import { sugerirCategoriasMl, familiaDeCategoriaMl, categoriaDeFamilia, type CategoriaSugerida } from "@/lib/catalogo/categoria-ml";

export type RespuestaSugerencia = { sugerencias: CategoriaSugerida[]; actual: string | null } | { error: string };

export async function accionSugerirCategoria(titulo: string, familia: number | null): Promise<RespuestaSugerencia> {
  const s = await entrarErp("productos_ver");
  try {
    const [sugerencias, actual] = await Promise.all([sugerirCategoriasMl(s.org.id, titulo), categoriaDeFamilia(s.org.id, familia)]);
    return { sugerencias, actual };
  } catch (e) {
    return { error: motivoErp(e) };
  }
}

export async function accionUsarCategoria(categoria: string): Promise<{ id: number; camino: string } | { error: string }> {
  const s = await entrarErp("productos_ver");
  try {
    return await familiaDeCategoriaMl(s.org.id, categoria);
  } catch (e) {
    return { error: motivoErp(e) };
  }
}
