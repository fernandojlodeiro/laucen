// Tipos y reglas de los avisos de la barra de estado, sin base: los usa
// también el navegador (app/componentes/marco/AvisosVivos.tsx).

export type ClaveContador = "reclamos" | "mensajes" | "preguntas" | "whatsapp" | "pedidos" | "facturas";

/** Un contador de la barra de estado. `marca` crece cuando entra algo nuevo;
 *  `nuevo`: hay algo que el usuario todavía no vio (se pinta distinto); `persona`: cuántas esperan a una persona
 *  del equipo porque la IA las derivó (van aparte, en amarillo). */
export type Contador = { clave: ClaveContador; texto: string; n: number | null; href?: string; marca: number; nuevo: boolean; persona?: number };

/** Lo que la ventana muestra de prepo: un pedido nuevo, o algo que la IA no contestó. */
export type AvisoIa = {
  tipo: ClaveContador;
  id: string;
  marca: number;
  titulo: string;   // "Pregunta en Daitom", "WhatsApp de Juan", "Reclamo en Daitom"…
  detalle: string;  // sobre qué es (la publicación, el pedido, el asunto)
  texto: string;    // lo que escribió el cliente
  motivo: string;   // por qué no contestó la IA (vacío en un pedido)
  propuesta: string | null;
  href: string;
  /** Un mensaje de Mercado Libre que la IA derivó a una persona (para los equipos que reciben sólo derivaciones). */
  derivada?: boolean;
};

/** Lo que la IA (o el sistema) pasó a una persona: los equipos «sólo derivaciones» reciben sólo esto (Fer, 25/10). */
export const esDerivacion = (a: AvisoIa) => a.tipo === "whatsapp" || a.tipo === "reclamos" || (a.tipo === "mensajes" && !!a.derivada);

/** En el orden de la barra de estado (Fer, 11/10). */
export const TIPOS_AVISO: ClaveContador[] = ["reclamos", "mensajes", "preguntas", "whatsapp", "pedidos", "facturas"];

/** `ventana`: de qué tipos avisa (ventana de prepo y avisos de Windows).
 *  `pedidoDetalle`: un pedido nuevo abre la ventana con su detalle; si no, sólo un cartel de que llegó.
 *  `cadaMin`: como mucho un sonido (y un aviso de Windows) cada tantos minutos. */
export type Prefs = { sonido: boolean; ventana: Record<ClaveContador, boolean>; pedidoDetalle: boolean; cadaMin: number };

export const VENTANA_TODO: Record<ClaveContador, boolean> = { reclamos: true, mensajes: true, preguntas: true, whatsapp: true, pedidos: true, facturas: true };

export const CADA_MIN_MAX = 60;
export const cadaMinValido = (n: unknown) => Math.min(CADA_MIN_MAX, Math.max(1, Math.round(Number(n) || 1)));

export type EstadoAvisos = { contadores: Contador[]; ventana: AvisoIa[]; prefs: Prefs };

/** ¿La pantalla en la que está el usuario es la de ese contador? (entrar ahí = verlo) */
export function esPantallaDe(clave: ClaveContador, ruta: string, ver: string | null): boolean {
  switch (clave) {
    case "reclamos": return ruta === "/ventas/reclamos" && (ver === null || ver === "abiertos" || ver === "mediacion");
    case "pedidos": return ruta === "/ventas/pedidos" && ver !== "facturas";
    // Facturas retenidas por la revisión antes de facturar (lib/facturacion/revision.ts).
    case "facturas": return ruta === "/ventas/pedidos" && ver === "facturas";
    case "preguntas":
    case "mensajes":
    case "whatsapp": return ruta === "/ventas/mensajes";
    // La bandeja de Mensajes junta todo (Fer, 25/10): los avisos de derivaciones se ven ahí.
  }
}
