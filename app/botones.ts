// Las clases de los botones. Portado de src/app/botones.ts de CadaMes, con
// sólo las que usan la bitácora y "para probar". El resto del archivo
// original tiene más (pestañas, iconos de editar/borrar de fila) que podés
// sumar cuando hagan falta en otra pantalla.
//
// Regla que sostiene esto (AGENTS.md de CadaMes): si se puede clickear,
// parece un botón. Nada de texto suelto que resulta ser una acción.

/** Lo que hace que se vea apretable: la tipografía, el redondeo y el aire. */
export const BOTON = "text-xs font-bold rounded-lg px-3 py-2";

/** La acción principal de un bloque. Una por bloque, no cinco. */
export const PRIMARIO = `${BOTON} bg-[#16577F] text-white`;

/** Botón fuerte de confirmar/guardar/cargar. */
export const VERDE = `${BOTON} bg-[#167655] text-white`;

/** Todo lo demás: guardar un renglón, cancelar, volver, abrir. */
export const SUAVE = `${BOTON} bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F]`;

/** Apagar sin borrar: queda pero no se ofrece. */
export const APAGAR = `${BOTON} bg-[#EEF3F8] border border-[#E3E9F0] text-[#8a6100]`;

/** Borrar de verdad. Blanco con borde rojo, no rojo lleno. */
export const BORRAR = `${BOTON} bg-white border border-[#EFD3CE] text-[#C03420]`;

export const ICONO_BORRAR =
  "text-sm leading-none rounded-lg px-2 py-1.5 bg-white border border-[#EFD3CE] text-[#C03420]";

/** El "desplegable" que se abre en el lugar (un `<details>`), no un botón que
 *  navega: abrir un panel no puede mover la vista. */
export const DESPLEGABLE =
  "flex items-center gap-2 w-full cursor-pointer list-none select-none " +
  "bg-[#EEF3F8] border border-[#E3E9F0] rounded-lg px-3 py-2 text-sm font-semibold text-[#16577F]";

export const DESPLEGABLE_CHICO =
  "inline-flex items-center gap-2 cursor-pointer list-none select-none " +
  "bg-[#EEF3F8] border border-[#E3E9F0] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#16577F]";

export const FLECHA = "ml-auto text-[#5C6B76] text-xs transition group-open:rotate-180";
