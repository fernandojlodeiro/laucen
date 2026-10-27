// Casillas «L M M J V S D» para elegir los días de la semana en que vale algo (reglas comerciales,
// banners). Sin ninguna tildada, todos los días. Se leen con fd.getAll(name) y normalizarDias().

import { DIAS_SEMANA } from "@/lib/dias-semana";

export default function CasillasDias({ name = "dias", valor, form }: { name?: string; valor?: number[] | null; form?: string }) {
  return (
    <span className="inline-flex flex-wrap gap-1" title="Sin ninguno tildado, todos los días (hora argentina)">
      {DIAS_SEMANA.map((d) => (
        <label key={d.n} className="inline-flex flex-col items-center text-[10px] text-[#5C6B76]" title={d.nombre}>
          <input type="checkbox" name={name} value={d.n} form={form} defaultChecked={!!valor?.includes(d.n)} className="h-4 w-4" />
          {d.letra}
        </label>
      ))}
    </span>
  );
}
