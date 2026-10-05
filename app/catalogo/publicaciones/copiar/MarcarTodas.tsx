"use client";

/** Caja del encabezado que marca o desmarca todas las casillas de publicación de la tabla. */
export default function MarcarTodas() {
  return (
    <input type="checkbox" aria-label="Marcar todas las de la página" className="h-4 w-4 accent-[#16577F]"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>('input[name="item"]:not(:disabled)').forEach((c) => { c.checked = e.target.checked; });
      }} />
  );
}
