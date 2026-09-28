import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { asegurarEsquema } from "@/lib/costos-ml/esquema";
import { FASES, ultimasCorridas } from "@/lib/costos-ml/proceso";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { accionCorrerAhora } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Costos ML", robots: { index: false, follow: false } };

// Costos de vender en Mercado Libre (interno, sólo Fer): cómo vienen las
// corridas diarias. Los datos quedan en las tablas ml_costos_* para las
// sesiones que calculan costos.

const NOMBRES: Record<string, string> = {
  referencias: "Referencias", cargo_fijo: "Cargo fijo", envio_gratis: "Envío gratis",
  envio_destino: "Envío por destino", comisiones: "Comisiones por categoría",
};

const hora = (d: Date | null) =>
  d ? new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function CostosML() {
  if (!(await sosVos())) redirect("/panel");
  await asegurarEsquema();
  const lista = await ultimasCorridas();

  return (
    <main className="max-w-3xl mx-auto p-6">
      <Link href="/panel" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
      <h1 className="text-lg font-bold mb-1">Costos de vender en Mercado Libre</h1>
      <p className="text-xs text-[#5C6B76] mb-4">
        Todos los días a las 6:30 se le pregunta a la API de Mercado Libre, con tu cuenta, la comisión de cada categoría y tipo de publicación,
        el cargo fijo por unidad, lo que pagás por el envío gratis (por peso, precio y logística, Full incluido) y lo que paga el comprador
        según el destino. Queda guardado con fecha y hora para las sesiones que calculan costos.
      </p>
      <form action={accionCorrerAhora} className="mb-6">
        <BotonEnviar clase={PRIMARIO}>Correr ahora</BotonEnviar>
        <span className="text-[11px] text-[#9AA7B3] ml-2">Si hoy ya corrió, sigue lo que falte. Lo que no entre sigue solo cada 5 minutos.</span>
      </form>

      {lista.length === 0 ? (
        <p className="text-sm text-[#5C6B76]">Todavía no hay corridas.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#5C6B76]">
              <th className="py-1 pr-3">Fecha</th><th className="pr-3">Empezó</th><th className="pr-3">Terminó</th>
              <th className="pr-3 text-right">Categorías</th><th>Partes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-t border-[#E3E9F0] align-top">
                <td className="py-1 pr-3">{new Date(c.fecha).toISOString().slice(0, 10)}</td>
                <td className="pr-3">{hora(c.iniciada)}</td>
                <td className="pr-3">{hora(c.terminada)}</td>
                <td className="pr-3 text-right">{c.comisiones.toLocaleString("es-AR")} / {c.hojas.toLocaleString("es-AR")}</td>
                <td className="text-xs">
                  {FASES.map((f) => (
                    <span key={f} className={`inline-block mr-1 mb-1 rounded px-1.5 py-0.5 ${c.fases.includes(f) ? "bg-[#E7F4EE] text-[#167655]" : "bg-[#EEF3F8] text-[#9AA7B3]"}`}>
                      {NOMBRES[f]}
                    </span>
                  ))}
                  {c.error && <div className="text-[#C03420]">No se pudo seguir: {c.error.includes("cuenta") ? c.error : "Mercado Libre no respondió bien; se reintenta solo."}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
