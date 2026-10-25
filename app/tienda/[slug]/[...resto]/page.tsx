// Cualquier dirección de la tienda que no existe: la 404 de la tienda (not-found.tsx de al lado),
// con la marca del dominio, y nunca la del panel (bitácora #856).

import { notFound } from "next/navigation";

export default function NoExiste() {
  notFound();
}
