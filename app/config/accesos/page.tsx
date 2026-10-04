// Configuración › Mis accesos del celular: cada persona elige qué 4 botones
// quedan fijos en la barra de abajo del celular. Es sólo de quien la abre.

import Link from "next/link";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { accesosDe, opcionesDeAcceso, MAX_ACCESOS } from "@/lib/accesos";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { Pantalla, Avisos, CAJA } from "@/app/componentes/erp";
import { accionGuardarAccesos } from "./acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis accesos del celular" };

export default async function Accesos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await asegurarEsquemaErp();
  const s = await sesionRequerida();
  const sp = await searchParams;
  const puede = (p: Parameters<typeof tienePermiso>[1]) => tienePermiso(s.permisos, p);
  const [opciones, actuales] = await Promise.all([Promise.resolve(opcionesDeAcceso(puede)), accesosDe(s.usuario.id, s.org.id, puede)]);
  const elegidos = new Set(actuales.map((a) => a.href));
  return (
    <Pantalla titulo="Mis accesos del celular" subtitulo={`Elegí hasta ${MAX_ACCESOS} botones para la barra fija de abajo del celular`} ancho="max-w-xl">
      <Avisos sp={sp} />
      <form action={accionGuardarAccesos} className={`${CAJA} grid gap-1`}>
        {opciones.map((o) => (
          <label key={o.href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#F7F9FB] text-sm">
            <input type="checkbox" name="acceso" value={o.href} defaultChecked={elegidos.has(o.href)} className="h-5 w-5" />
            <span className="text-xl w-7 text-center">{o.icono}</span>{o.texto}
          </label>
        ))}
        <div className="flex gap-2 pt-3">
          <button className={PRIMARIO}>Guardar</button>
          <Link href="/panel" className={SUAVE}>Cancelar</Link>
        </div>
        <p className="text-[11px] text-[#5C6B76]">Si no tildás ninguno, quedan los de siempre. Se aplica sólo a tu usuario. El quinto botón siempre es «Menú».</p>
      </form>
    </Pantalla>
  );
}
