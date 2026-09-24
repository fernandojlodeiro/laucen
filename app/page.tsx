// Landing pública. Pedido de Fer: sitio en construcción, con un solo botón
// de acceso al panel. Nada más — el panel de verdad vive en /panel.

import Link from "next/link";
import { VERDE, SUAVE } from "@/app/botones";

export default function Landing() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-bold">Laucen</h1>
        <p className="text-sm text-[#5C6B76] mt-2">Sitio en construcción.</p>
        <div className="flex flex-col gap-2 mt-6">
          <Link href="/login" className={`${VERDE} py-2.5`}>Iniciar sesión</Link>
          <Link href="/registro" className={`${SUAVE} py-2.5`}>Registrarse</Link>
        </div>
      </div>
    </main>
  );
}
