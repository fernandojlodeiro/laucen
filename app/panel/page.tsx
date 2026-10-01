// El panel de inicio (orden 136, §2 bis): tarjetas con lo pendiente. Las
// tarjetas salen de lib/panel.ts; una que todavía no se puede calcular se
// muestra como "próximamente".

import Link from "next/link";
import { redirect } from "next/navigation";
import { sesionRequerida } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { TARJETAS, type Renglon } from "@/lib/panel";
import { motivoErp } from "@/lib/erp/base";

export const dynamic = "force-dynamic";

export default async function Panel() {
  const sesion = await sesionRequerida();
  if (!tienePermiso(sesion.permisos, "panel_ver")) redirect("/radar");
  const tarjetas = TARJETAS.filter((t) => !t.permiso || tienePermiso(sesion.permisos, t.permiso));
  const datos = await Promise.all(tarjetas.map(async (t) => {
    if (!t.calcular) return { t, renglones: null as Renglon[] | null, error: null as string | null };
    try {
      return { t, renglones: await t.calcular(sesion.org.id), error: null };
    } catch (e) {
      return { t, renglones: null, error: motivoErp(e) };
    }
  }));

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-lg font-bold mb-4">Panel</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {datos.map(({ t, renglones, error }) => (
          <section key={t.id} className={`rounded-xl border p-3 ${t.calcular ? "bg-white border-[#E3E9F0]" : "bg-[#F7F8F6] border-dashed border-[#D5DDE5]"}`}>
            <header className="flex items-center justify-between mb-2">
              <h2 className={`text-sm font-bold ${t.calcular ? "" : "text-[#9AA7B3]"}`}>{t.titulo}</h2>
              {t.href && <Link href={t.href} className="text-[11px] font-bold rounded-lg px-2 py-1 bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]">Ver</Link>}
            </header>
            {!t.calcular && <p className="text-xs text-[#9AA7B3] italic">Próximamente</p>}
            {error && <p className="text-xs text-[#C03420]">{error}</p>}
            {renglones && (
              <ul className="text-xs divide-y divide-[#EEF1F4]">
                {renglones.map((r, i) => {
                  const cuerpo = (
                    <>
                      <span className="truncate">{r.texto}</span>
                      <span className={`tabular-nums text-right font-bold ${r.alerta ? "text-[#C03420]" : ""}`}>{r.valor}</span>
                    </>
                  );
                  return (
                    <li key={i}>
                      {r.href
                        ? <Link href={r.href} className="flex justify-between gap-3 py-1.5 hover:text-[#16577F]">{cuerpo}</Link>
                        : <div className="flex justify-between gap-3 py-1.5 text-[#5C6B76]">{cuerpo}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
