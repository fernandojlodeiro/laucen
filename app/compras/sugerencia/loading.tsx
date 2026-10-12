// Mientras se calcula la sugerencia de compra (puede tardar unos segundos la primera vez): un aviso en vez de la pantalla quieta.

export default function Cargando() {
  return (
    <main className="max-w-[96rem] mx-auto p-4 sm:p-6">
      <h1 className="text-lg font-bold">Sugerencia de compra</h1>
      <p className="mt-3 text-xs rounded-lg px-3 py-2 bg-[#EEF3F8] text-[#16577F] inline-block">
        Calculando el ritmo de venta de cada producto en la historia… La primera vez puede tardar unos segundos; después queda guardado 30 minutos.
      </p>
    </main>
  );
}
