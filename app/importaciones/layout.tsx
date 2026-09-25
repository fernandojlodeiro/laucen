import Link from "next/link";
import { SUAVE } from "@/app/botones";
import { Pestanas } from "@/app/radar/Cliente";

// Importaciones: despachos de ARCA + enriquecimiento de Softrade.

export const metadata = { title: "Importaciones", robots: { index: false, follow: false } };

export default function ImportacionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <Link href="/panel" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
      <h1 className="text-lg font-bold">🚢 Importaciones</h1>
      <p className="text-xs text-[#5C6B76] mb-3">Despachos de importación argentinos (ARCA), enriquecidos con Softrade</p>
      <Pestanas items={[
        { href: "/importaciones", texto: "Buscar" },
        { href: "/importaciones/descubrir", texto: "Descubrir" },
        { href: "/importaciones/rubros", texto: "Rubros" },
        { href: "/importaciones/cargas", texto: "Cargas" },
      ]} />
      {children}
    </main>
  );
}
