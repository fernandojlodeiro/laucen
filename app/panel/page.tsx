// Dashboard › Para hacer: la pantalla de inicio. Sólo lo que hay para
// atender (etiquetas para imprimir, pedidos para preparar, preguntas,
// mensajes, reclamos y devoluciones), por cuenta de Mercado Libre, la web y
// el resto, con enlaces a donde se resuelve. El detalle completo (reputación,
// publicaciones, alertas) está en Dashboard › Relevamiento completo.

import { redirect } from "next/navigation";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { Pantalla } from "@/app/componentes/erp";
import { Tablero } from "@/app/mercadolibre/Tablero";
import { monedaVista } from "@/lib/moneda";
import Link from "next/link";
import { enCortar } from "@/lib/publicidad/avisos";

export const dynamic = "force-dynamic";

export default async function Panel() {
  const sesion = await sesionRequerida();
  if (!tienePermiso(sesion.permisos, "panel_ver")) redirect("/radar");
  // Publicidad (orden 596): lo que pasó a CORTAR, que no se pase por alto.
  const cortar = tienePermiso(sesion.permisos, "publicidad_ver") ? await enCortar(sesion.org.id).catch(() => []) : [];
  return (
    <Pantalla titulo="Para hacer" ancho="max-w-[2200px]" subtitulo="Lo que espera tu atención hoy, por cuenta, la web y el resto">
      {cortar.length > 0 && (
        <Link href="/ventas/campanas-ml?veredicto=cortar" className="block mb-4 rounded-xl border-2 border-[#C03420] bg-[#FDF1EF] px-4 py-3 text-sm text-[#C03420] hover:bg-[#FBE4DF]">
          <b>Publicidad: {cortar.length === 1 ? "1 producto para CORTAR" : `${cortar.length} productos para CORTAR`}</b> — sigue gastando sin rendir hasta que lo pauses en el panel de Mercado Libre.
          <span className="block text-xs mt-1">{cortar.slice(0, 5).map((c) => c.clave).join(" · ")}{cortar.length > 5 ? " · …" : ""} — ver en Ventas › Publicidad en Mercado Libre</span>
        </Link>
      )}
      <Tablero org={sesion.org.id} modo="hacer" moneda={await monedaVista(sesion.usuario.id, sesion.org.id).catch(() => "ARS" as const)} />
    </Pantalla>
  );
}
