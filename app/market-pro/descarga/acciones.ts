"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, consulta } from "@/lib/erp/base";
import { intentar } from "@/lib/erp/acciones";
import { deFondo } from "@/lib/tareas-fondo";
import { borrarLlave, cargarLlave, pausarMotor } from "@/lib/marketpro/llave";
import { actualizarTodo, llamarMotor, planificarCategoria } from "@/lib/marketpro/motor";
import { descubrirVendedores } from "@/lib/marketpro/vendedores";

const VOLVER = "/market-pro/descarga";

export async function accionGrabarLlave(fd: FormData) {
  const s = await entrarErp("market_pro_config");
  await intentar(VOLVER, async () => {
    const llave = String(fd.get("llave") ?? "").trim();
    if (!llave) throw new ErrorErp("Pegá la llave.");
    const motivo = await cargarLlave(s.org.id, llave, s.usuario.id);
    if (motivo) throw new ErrorErp(motivo);
    revalidatePath("/market-pro", "layout");
    return "Llave grabada: Market Pro la aceptó. La descarga arrancó de fondo.";
  });
}

export async function accionBorrarLlave() {
  const s = await entrarErp("market_pro_config");
  await intentar(VOLVER, async () => {
    await borrarLlave(s.org.id);
    revalidatePath("/market-pro", "layout");
    return "Llave borrada. Lo ya bajado queda.";
  });
}

export async function accionPausar(fd: FormData) {
  const s = await entrarErp("market_pro_config");
  await intentar(VOLVER, async () => {
    const pausar = fd.get("pausar") === "1";
    await pausarMotor(s.org.id, pausar);
    return pausar ? "Descarga en pausa." : "La descarga sigue.";
  });
}

/** Suma lo nuevo (días y mes en curso) de todas las categorías y arranca. */
export async function accionActualizar(fd: FormData) {
  void fd;
  const s = await entrarErp("market_pro_config");
  return deFondo(s, "marketpro-actualizar", "Market Pro: sumar lo nuevo", async () => {
    await actualizarTodo(s.org.id);
    await llamarMotor(s.org.id);
    return "Listo: se sumó a la cola lo que faltaba bajar.";
  });
}

/** Sumar a mano una categoría (por número), por si la llave ve otra además de las que encontró sola. */
export async function accionSumarCategoria(fd: FormData) {
  const s = await entrarErp("market_pro_config");
  await intentar(VOLVER, async () => {
    const id = Number(String(fd.get("categoria") ?? "").replace(/\D/g, ""));
    if (!id) throw new ErrorErp("Elegí la categoría.");
    await consulta(`insert into mpro_seguida (organizacion_id, category_id, ruta, habilitada)
                    select $1, $2, (select ruta from mpro_categoria where pais = 'ar' and category_id = $2), true
                    on conflict (organizacion_id, category_id) do update set habilitada = true`, [s.org.id, id]);
    await planificarCategoria(s.org.id, id);
    await llamarMotor(s.org.id);
    return "Categoría sumada: se baja de fondo.";
  });
}

export async function accionQuitarCategoria(fd: FormData) {
  const s = await entrarErp("market_pro_config");
  await intentar(VOLVER, async () => {
    const id = Number(fd.get("categoria"));
    await consulta("delete from mpro_descarga where organizacion_id = $1 and category_id = $2 and estado in ('pendiente', 'corriendo', 'error')", [s.org.id, id]);
    await consulta("delete from mpro_seguida where organizacion_id = $1 and category_id = $2", [s.org.id, id]);
    return "Categoría sacada: no se baja más (lo ya bajado queda).";
  });
}

/** Quién es cada vendedor, por la API de catálogo de Mercado Libre (también corre solo con cada vuelta de la descarga). */
export async function accionVendedores(fd: FormData) {
  void fd;
  const s = await entrarErp("market_pro_config");
  return deFondo(s, "marketpro-vendedores", "Market Pro: descubrir vendedores", async () => {
    const r = await descubrirVendedores(s.org.id, 240);
    return `Leídos ${r.catalogos} catálogos de Mercado Libre; vendedores identificados: ${r.ok}.`;
  });
}
