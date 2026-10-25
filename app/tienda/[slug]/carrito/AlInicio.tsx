"use client";

// Al llegar al carrito (después de «Agregar al carrito»), arriba de todo: ahí está el producto recién
// agregado, la cantidad y lo que falta para el envío gratis. Sin esto quedaba a la altura donde estaba
// la ficha, que en el celular es el pie (Fer, 25/10).

import { useEffect } from "react";

export default function AlInicio() {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  return null;
}
