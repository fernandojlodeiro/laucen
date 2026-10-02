// "Mostrar inactivos": un producto inactivo (producto.estado = 'archivado') no
// aparece en ningún listado ni buscador del panel salvo que se tilde esta
// caja. Va por ?inactivos=1, dentro del formulario GET de cada buscador.

/** true si la dirección pide ver también los inactivos. */
export const verInactivos = (sp: { inactivos?: string | string[] }) => sp.inactivos === "1";

/** La caja para tildar (va adentro del <form> del buscador). */
export function MostrarInactivos({ activo }: { activo: boolean }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-[#5C6B76] py-1.5 whitespace-nowrap">
      <input type="checkbox" name="inactivos" value="1" defaultChecked={activo} className="h-4 w-4 accent-[#16577F]" />
      Mostrar inactivos
    </label>
  );
}
