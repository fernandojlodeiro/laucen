"use client";

// El cuadro de búsqueda de la pestaña Seguimiento: el texto (de entrada, el
// título del producto) y el botón que lanza la búsqueda de fondo (cuesta: pregunta antes).

import { useState } from "react";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { PRIMARIO } from "@/app/botones";
import { accionBuscarSeguimiento } from "@/app/catalogo/productos/acciones-seguimiento";

export default function BuscarSeguimiento({ productoId, inicial }: { productoId: number; inicial: string }) {
  const [q, setQ] = useState(inicial);
  return (
    <div className="flex flex-wrap items-start gap-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qué buscar en Mercado Libre" className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white flex-1 min-w-64" />
      <BotonTarea accion={accionBuscarSeguimiento} tipo={`seguimiento-buscar-${productoId}`} clase={PRIMARIO} texto="🔍 Buscar en Mercado Libre"
        campos={{ producto_id: String(productoId), q }} pregunta="¿Buscar? Cuesta unos US$ 0,10" />
    </div>
  );
}
