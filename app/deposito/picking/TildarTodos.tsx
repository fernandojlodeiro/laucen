"use client";

// "Tildar todos" (Fer, 6/10): tilda o destilda de una todos los pedidos de la
// lista que se pueden tildar (los carritos de ML en espera quedan como están).

export default function TildarTodos({ total }: { total: number }) {
  function cambiar(e: React.ChangeEvent<HTMLInputElement>) {
    const form = e.currentTarget.form;
    if (!form) return;
    for (const c of form.querySelectorAll<HTMLInputElement>('input[type=checkbox][name="p"]')) if (!c.disabled) c.checked = e.currentTarget.checked;
  }
  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-1 mb-2 cursor-pointer">
      <input type="checkbox" onChange={cambiar} className="h-6 w-6 accent-[#16577F]" />
      Tildar todos ({total})
    </label>
  );
}
