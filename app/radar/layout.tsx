import Link from "next/link";
import { SUAVE } from "@/app/botones";
import { Pestanas } from "./Cliente";

// Radar: tendencias de Mercado Libre. Tres pestañas.

export const metadata = { title: "Radar", robots: { index: false, follow: false } };

export default function RadarLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6">
      <Link href="/panel" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
      <h1 className="text-lg font-bold">📡 Radar</h1>
      <p className="text-xs text-[#5C6B76] mb-3">Tendencias de Mercado Libre</p>
      <Pestanas items={[
        { href: "/radar", texto: "Tendencias" },
        { href: "/radar/seguidas", texto: "Mis categorías seguidas" },
        { href: "/radar/historial", texto: "Historial" },
        { href: "/radar/configuracion", texto: "Configuración" },
        { href: "/radar/ayuda", texto: "Ayuda" },
      ]} />
      {children}
    </main>
  );
}
