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

export const dynamic = "force-dynamic";
export const metadata = { title: "Para hacer" };

export default async function Panel() {
  const sesion = await sesionRequerida();
  if (!tienePermiso(sesion.permisos, "panel_ver")) redirect("/radar");
  return (
    <Pantalla titulo="Para hacer" ancho="max-w-[2200px]" subtitulo="Lo que espera tu atención hoy, por cuenta, la web y el resto">
      <Tablero org={sesion.org.id} modo="hacer" />
    </Pantalla>
  );
}
