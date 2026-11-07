// Pantallas con informe (Fer, 7/11): en ellas el asistente sabe lo que hay en la pantalla (lib/asistente/pantallas.ts)
// y cada respuesta tiene el botón «Agregar al informe», que la guarda como una sección más de ese informe
// (/api/asistente/agregar). Sin dependencias de servidor: lo usa también el chat en el navegador.
// Para sumar otra pantalla (p. ej. Análisis diario): un caso acá, su contexto en pantallas.ts y su guardado en agregar.

export type Destino = { clave: string; etiqueta: string };

export function destinoDe(pathname: string, params: URLSearchParams): Destino | null {
  if (pathname === "/market-pro/informe") {
    const cat = Number(params.get("cat"));
    return { clave: `mpro:${Number.isInteger(cat) && cat > 0 ? cat : 0}`, etiqueta: "Agregar al informe" };
  }
  if (pathname === "/informes/analisis-diario") {
    const fecha = params.get("fecha");
    return { clave: `analisis:${fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "ultimo"}`, etiqueta: "Agregar al informe" };
  }
  return null;
}
