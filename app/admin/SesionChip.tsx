// La sesión que escribió algo (bitácora, para probar): muestra el título que
// Fer le puso en el panel de Claude y, al tocarla, abre esa sesión.

export default function SesionChip({ id, titulos }: { id: string | null | undefined; titulos: Map<string, string> }) {
  if (!id) return null;
  const titulo = titulos.get(id);
  const clase = "px-2 py-0.5 rounded bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F] font-semibold";
  if (!id.startsWith("session_")) return <span className={clase}>{titulo ?? id}</span>;
  return (
    <a href={`https://claude.ai/code/${id}`} target="_blank" rel="noreferrer" title={id} className={`${clase} hover:underline`}>
      {titulo ?? id}
    </a>
  );
}
