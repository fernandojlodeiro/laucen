// Piezas de pantalla del Radar que no necesitan JavaScript en el navegador:
// cada cosa dibujada como lo que es (AGENTS.md → Convenciones de interfaz).

/** Un interruptor de verdad (pista + perilla) que manda un formulario. */
export function Interruptor({ accion, prendido, campos, etiqueta, deshabilitado, ayuda }: {
  accion: (fd: FormData) => Promise<void>;
  prendido: boolean;
  campos: Record<string, string>;
  etiqueta: string;
  deshabilitado?: boolean;
  ayuda?: string;
}) {
  return (
    <form action={accion} className="flex items-center justify-between gap-3 text-xs">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="valor" value={prendido ? "0" : "1"} />
      <span>
        {etiqueta}
        {ayuda && <span className="block text-[11px] text-[#5C6B76]">{ayuda}</span>}
      </span>
      <button role="switch" aria-checked={prendido} aria-label={etiqueta} disabled={deshabilitado}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-40 ${prendido ? "bg-[#167655]" : "bg-[#C9D3DD]"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${prendido ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </form>
  );
}

/** Estrella para seguir / dejar de seguir una categoría. */
export function Estrella({ accion, prendida, campos }: {
  accion: (fd: FormData) => Promise<void>;
  prendida: boolean;
  campos: Record<string, string>;
}) {
  return (
    <form action={accion}>
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="valor" value={prendida ? "0" : "1"} />
      <button aria-pressed={prendida} title={prendida ? "Dejar de seguir" : "Seguir esta categoría"}
        className={`text-base leading-none px-1 rounded border ${prendida ? "text-[#C98A00] border-[#F1DFA8] bg-[#FFF8E5]" : "text-[#9AA7B3] border-[#E3E9F0] bg-white"}`}>
        {prendida ? "★" : "☆"}
      </button>
    </form>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "error" | "ok"; children: React.ReactNode }) {
  const colores = { info: "bg-[#EEF3F8] text-[#16577F]", error: "bg-[#FDF1EF] text-[#C03420]", ok: "bg-[#EEF7F1] text-[#1F6E4A]" };
  return <p className={`text-xs rounded-lg px-3 py-2 mb-3 ${colores[tipo]}`}>{children}</p>;
}

export const pesos = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`;

/** Interruptor que es un filtro de la pantalla (cambia la dirección, no guarda nada). */
export function InterruptorFiltro({ href, prendido, etiqueta }: { href: string; prendido: boolean; etiqueta: string }) {
  return (
    <a href={href} role="switch" aria-checked={prendido} className="inline-flex items-center gap-2 text-xs">
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${prendido ? "bg-[#167655]" : "bg-[#C9D3DD]"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${prendido ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
      {etiqueta}
    </a>
  );
}
