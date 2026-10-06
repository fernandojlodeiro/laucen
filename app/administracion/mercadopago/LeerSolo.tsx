"use client";

// Al abrir la pantalla, si la última lectura tiene más de 10 minutos, se
// lanza sola una nueva de fondo (la pantalla muestra la guardada mientras tanto).

import { useEffect, useRef } from "react";
import { accionLeerMercadoPago } from "./acciones";

export default function LeerSolo({ vieja }: { vieja: boolean }) {
  const hecho = useRef(false);
  useEffect(() => {
    if (!vieja || hecho.current) return;
    hecho.current = true;
    accionLeerMercadoPago(new FormData()).then(() => window.dispatchEvent(new Event("laucen-tarea-lanzada"))).catch(() => {});
  }, [vieja]);
  return null;
}
