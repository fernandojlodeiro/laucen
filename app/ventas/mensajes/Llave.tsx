// El interruptor dibujado (sin formulario), para los componentes de cliente.

export default function Llave({ prendido }: { prendido: boolean }) {
  return (
    <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${prendido ? "bg-[#167655]" : "bg-[#C9D3DD]"}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${prendido ? "translate-x-4" : "translate-x-0.5"}`} />
    </span>
  );
}
