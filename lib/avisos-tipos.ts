// Tipos y reglas de los avisos de la barra de estado, sin base: los usa
// también el navegador (app/componentes/marco/AvisosVivos.tsx).

export type ClaveContador = "pedidos" | "preguntas" | "mensajes" | "whatsapp";

/** Un contador de la barra de estado. `marca` crece cuando entra algo nuevo;
 *  `nuevo`: hay algo que el usuario todavía no vio (se pinta distinto). */
export type Contador = { clave: ClaveContador; texto: string; n: number | null; href?: string; marca: number; nuevo: boolean };

/** Lo que la ventana muestra de prepo: un pedido nuevo, o algo que la IA no contestó. */
export type AvisoIa = {
  tipo: ClaveContador;
  id: string;
  marca: number;
  titulo: string;   // "Pregunta en Daitom", "WhatsApp de Juan"…
  detalle: string;  // sobre qué es (la publicación, el pedido, el asunto)
  texto: string;    // lo que escribió el cliente
  motivo: string;   // por qué no contestó la IA (vacío en un pedido)
  propuesta: string | null;
  href: string;
};

export const TIPOS_AVISO: ClaveContador[] = ["pedidos", "preguntas", "mensajes", "whatsapp"];

/** `ventana`: de qué tipos avisa (ventana de prepo y avisos de Windows).
 *  `pedidoDetalle`: un pedido nuevo abre la ventana con su detalle; si no, sólo un cartel de que llegó.
 *  `cadaMin`: como mucho un sonido (y un aviso de Windows) cada tantos minutos. */
export type Prefs = { sonido: boolean; ventana: Record<ClaveContador, boolean>; pedidoDetalle: boolean; cadaMin: number };

export const VENTANA_TODO: Record<ClaveContador, boolean> = { pedidos: true, preguntas: true, mensajes: true, whatsapp: true };

export const CADA_MIN_MAX = 60;
export const cadaMinValido = (n: unknown) => Math.min(CADA_MIN_MAX, Math.max(1, Math.round(Number(n) || 1)));

export type EstadoAvisos = { contadores: Contador[]; ventana: AvisoIa[]; prefs: Prefs };

/** ¿La pantalla en la que está el usuario es la de ese contador? (entrar ahí = verlo) */
export function esPantallaDe(clave: ClaveContador, ruta: string, ver: string | null): boolean {
  switch (clave) {
    case "pedidos": return ruta === "/ventas/pedidos";
    case "preguntas": return ruta === "/ventas/preguntas" && ver !== "mensajes";
    case "mensajes": return ruta === "/ventas/preguntas" && ver === "mensajes";
    case "whatsapp": return ruta === "/ventas/mensajes";
  }
}
