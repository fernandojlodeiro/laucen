// Un manual de ayuda para leer entero (Fer, 8/10): se abre desde «Manuales de
// ayuda» de la barra de estado. Muestra las guías (manual/guia-*.md) con el
// mismo dibujo que las respuestas del asistente.

import { notFound } from "next/navigation";
import { entrarErp, Pantalla } from "@/app/componentes/erp";
import Texto from "@/app/componentes/asistente/Texto";
import { tienePermiso, type PermisoKey } from "@/lib/permisos";
import { guiasDelManual } from "@/lib/asistente/manual";

export const dynamic = "force-dynamic";

export default async function Manual({ params }: { params: Promise<{ archivo: string }> }) {
  const s = await entrarErp("panel_ver");
  const { archivo } = await params;
  const guia = (await guiasDelManual()).find((g) => g.archivo === archivo);
  if (!guia || (guia.permiso !== "todos" && guia.permiso !== "fer" && !tienePermiso(s.permisos, guia.permiso as PermisoKey))) notFound();
  return (
    <Pantalla titulo={guia.titulo} subtitulo={guia.resumen} camino={[{ texto: "Manuales de ayuda" }, { texto: guia.titulo }]}
      acciones={<span className="text-[11px] text-[#5C6B76]">Para imprimir: Ctrl + P</span>}>
      <article className="max-w-3xl text-sm leading-relaxed [&_p.font-bold]:text-base [&_p.font-bold]:text-[#16577F] [&_p.font-bold]:mt-4">
        <Texto texto={guia.cuerpo} />
      </article>
    </Pantalla>
  );
}
