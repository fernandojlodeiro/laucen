// Ventas › Mensajes › Datos de internet: lo que la IA buscó en internet porque no estaba en la ficha del producto y
// agregó sola a sus datos técnicos (lib/datos-internet.ts).

import { entrarErp, Pantalla } from "@/app/componentes/erp";
import DatosInternet from "@/app/componentes/DatosInternet";
import { PestanasMensajes } from "../comun";

export const dynamic = "force-dynamic";

export default async function DatosDeInternet({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const s = await entrarErp("preguntas_ver");
  const sp = await searchParams;
  return (
    <Pantalla titulo="Mensajes" subtitulo="Lo que la IA buscó en internet porque no estaba en la ficha del producto" ancho="max-w-7xl">
      <PestanasMensajes org={s.org.id} permisos={s.permisos} superadmin={s.superadmin} activa="internet" />
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Lo agregó sola a los datos técnicos del producto; si algo está mal, el lápiz abre la ficha para corregirlo.
      </p>
      <DatosInternet org={s.org.id} sp={sp} />
    </Pantalla>
  );
}
