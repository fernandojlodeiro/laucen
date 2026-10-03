"use client";

// El botón "Crear" de "Nueva cuenta" en la vista previa de ARCA. Los campos
// (los arma la página) y este botón son del formulario "importar" (atributo
// `form`), así la acción recibe también las cuentas que ya se eligieron en
// los desplegables y vuelve con ellas: crear una cuenta no borra lo elegido.
// Enter en un campo crea la cuenta (sin esto, mandaría "Importar").

import { useRef, type ReactNode } from "react";
import { PRIMARIO } from "@/app/botones";

export default function NuevaCuenta({ accion, children }: { accion: (fd: FormData) => Promise<void>; children: ReactNode }) {
  const boton = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex flex-wrap items-end gap-2" onKeyDown={(e) => {
      if (e.key === "Enter" && e.target instanceof HTMLInputElement) { e.preventDefault(); boton.current?.click(); }
    }}>
      {children}
      <button ref={boton} type="submit" form="importar" formAction={accion} className={PRIMARIO}>Crear</button>
    </div>
  );
}
