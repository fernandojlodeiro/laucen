"use client";

// La caja donde se escribe la respuesta (a una pregunta o a un mensaje de ML). Con "#" se buscan publicaciones propias.

import { useState } from "react";
import CajaConPublicaciones from "@/app/componentes/CajaConPublicaciones";

export default function CajaRespuesta({ name, defaultValue, rows, maxLength, className, canalId, plan }: {
  name: string; defaultValue: string; rows: number; maxLength: number; className: string; canalId: number | null; plan?: string | null;
}) {
  const [texto, setTexto] = useState(defaultValue);
  return <CajaConPublicaciones name={name} value={texto} onChange={setTexto} rows={rows} maxLength={maxLength} className={className} canalId={canalId} plan={plan} />;
}
