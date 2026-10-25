"use client";

// "Se ven en": filtra la lista de banners por la tienda donde se ven (los de
// esa tienda más los de todas). Cambia la dirección al elegir, como el buscador.

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function FiltroDonde({ opciones, valor, clase }: { opciones: { valor: string; texto: string }[]; valor: string; clase: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const sp = useSearchParams();
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <span className="font-semibold text-[#5C6B76]">Se ven en</span>
      <select value={valor} className={clase} onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        if (e.target.value) p.set("donde", e.target.value); else p.delete("donde");
        p.delete("editar");
        router.push(`${ruta}?${p}`, { scroll: false });
      }}>
        <option value="">Cualquier tienda</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </label>
  );
}
