// Lo que ve quien entra por un dominio que apunta a Laucen pero que ninguna
// tienda tiene cargado (el middleware reescribe acá). Nunca el panel.

import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function DominioNoConfigurado() {
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-bold mb-2">Este dominio todavía no está configurado</h1>
        <p className="text-sm text-[#5C6B76]">
          {host ? <><b>{host}</b> apunta a Laucen, pero ninguna tienda lo tiene cargado.</> : "Ninguna tienda tiene cargado este dominio."}
          {" "}Si es tuyo, cargalo en Configuración › Tienda web › Dominios.
        </p>
      </div>
    </main>
  );
}
