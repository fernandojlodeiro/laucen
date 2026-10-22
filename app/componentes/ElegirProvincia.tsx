"use client";

// La provincia de una dirección (Fer, 22/10): una de las 24 (lib/provincias.ts), escribiendo un par
// de letras para filtrar (ElegirDeLista), nunca un desplegable largo ni texto libre. De entrada,
// Córdoba. Con `name` deja el nombre en un campo oculto para el <form>; con `alCambiar`, para un
// formulario con estado.

import { useState } from "react";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import { PROVINCIAS, PROVINCIA_POR_DEFECTO, DETALLE_PROVINCIA, provinciaNormal } from "@/lib/provincias";

const OPCIONES = PROVINCIAS.map((p, i) => ({ id: i + 1, texto: p, detalle: DETALLE_PROVINCIA[p] }));

export default function ElegirProvincia({ name, valor, alCambiar, className = "" }: {
  name?: string;
  /** La que tiene; undefined = una dirección nueva (sugiere Córdoba). Una que no es de la lista queda sin elegir. */
  valor?: string | null;
  alCambiar?: (provincia: string) => void;
  className?: string;
}) {
  const inicial = valor === undefined ? PROVINCIA_POR_DEFECTO : provinciaNormal(valor);
  // Una que no es de la lista (ej. de otro país) se conserva tal cual hasta que se elija otra.
  const [elegida, setElegida] = useState(inicial ?? valor ?? "");
  const id = OPCIONES.find((o) => o.texto === inicial)?.id ?? null;
  return (
    <>
      {name && <input type="hidden" name={name} value={elegida} />}
      <ElegirDeLista opciones={OPCIONES} valor={id} vacio="Sin provincia" placeholder="Escribí la provincia…" etiqueta="Provincia" className={className}
        alElegir={(o) => { setElegida(o?.texto ?? ""); alCambiar?.(o?.texto ?? ""); }} />
    </>
  );
}
