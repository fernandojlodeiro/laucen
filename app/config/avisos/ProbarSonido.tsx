"use client";

import { SUAVE } from "@/app/botones";
import { sonar } from "@/app/componentes/marco/AvisosVivos";

export default function ProbarSonido() {
  return <button type="button" onClick={() => sonar()} className={SUAVE}>🔔 Probar el sonido</button>;
}
