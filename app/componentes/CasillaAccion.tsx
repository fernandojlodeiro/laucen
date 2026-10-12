"use client";

// Una caja para tildar que graba al momento (sin botón): al tocarla manda su
// formulario a la acción del servidor, con `campos` y `valor=1|0`.

export default function CasillaAccion({ accion, campos, activa, etiqueta, ayuda }: {
  accion: (fd: FormData) => Promise<void>; campos: Record<string, string>; activa: boolean; etiqueta: string; ayuda?: string;
}) {
  return (
    <form action={accion} className="inline-flex">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="inline-flex items-center gap-1 text-[11px] cursor-pointer" title={ayuda}>
        <input type="checkbox" name="valor" value="1" defaultChecked={activa} onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-3.5 w-3.5 accent-[#16577F]" />
        {etiqueta}
      </label>
    </form>
  );
}
