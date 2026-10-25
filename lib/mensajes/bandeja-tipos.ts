// Tipos y filtros de la bandeja de Mensajes, sin base: los usa también la pantalla (componente de cliente).
//
// La bandeja junta todo lo que escriben los clientes (Fer, 25/10, como la Bandeja de CadaMes): WhatsApp, Instagram,
// los mensajes de posventa y las preguntas de Mercado Libre y los reclamos. Se mezcla la LISTA, no las charlas: cada
// conversación es una persona por un canal, con las reglas de su canal. La clave de una conversación dice de dónde es:
//   c:<chat>       WhatsApp, Instagram o la prueba (tabla chat)
//   m:<pack>       mensajes de posventa de Mercado Libre (meli_conversacion)
//   p:<pregunta>   una pregunta de Mercado Libre (meli_pregunta)
//   r:<reclamo>    un reclamo (reclamo)

export type Origen = "whatsapp" | "instagram" | "prueba" | "ml" | "pregunta" | "reclamo";

/** Qué hay que hacer: las pestañas de arriba de la lista. */
export type FiltroBandeja = "todos" | "en_espera" | "sin_responder" | "persona";

export const FILTROS: { clave: FiltroBandeja; texto: string; ayuda: string }[] = [
  { clave: "en_espera", texto: "En espera", ayuda: "Lo que la IA derivó a una persona, y los reclamos para atender" },
  { clave: "sin_responder", texto: "Sin responder", ayuda: "El último mensaje es del cliente" },
  { clave: "todos", texto: "Todos", ayuda: "Todas las conversaciones, la más nueva primero" },
  { clave: "persona", texto: "Con persona", ayuda: "Las que atiende una persona (la IA no contesta)" },
];

export const esFiltro = (x: unknown): x is FiltroBandeja => FILTROS.some((f) => f.clave === x);

/** De dónde viene: los botoncitos de arriba de la lista. */
export type FiltroOrigen = "todos" | "whatsapp" | "instagram" | "ml" | "pregunta" | "reclamo";

/** texto: lo que se lee al lado del logo (WhatsApp e Instagram van sólo con su logo, para que entren todos sin correr la
 *  fila; Fer, 25/10). nombre: el nombre entero, para quien no ve el logo. */
export const ORIGENES: { clave: FiltroOrigen; texto: string; nombre: string; icono: string }[] = [
  { clave: "todos", texto: "Todo", nombre: "Todo", icono: "" },
  { clave: "whatsapp", texto: "", nombre: "WhatsApp", icono: "🟢" },
  { clave: "instagram", texto: "", nombre: "Instagram", icono: "📷" },
  { clave: "ml", texto: "Mensajes", nombre: "Mensajes de Mercado Libre", icono: "🟡" },
  { clave: "pregunta", texto: "Preguntas", nombre: "Preguntas de Mercado Libre", icono: "❓" },
  { clave: "reclamo", texto: "Reclamos", nombre: "Reclamos", icono: "⚠️" },
];

export const esFiltroOrigen = (x: unknown): x is FiltroOrigen => ORIGENES.some((o) => o.clave === x);

export const ICONO_ORIGEN: Record<Origen, string> = { whatsapp: "🟢", instagram: "📷", prueba: "🧪", ml: "🟡", pregunta: "❓", reclamo: "⚠️" };
export const NOMBRE_ORIGEN: Record<Origen, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", prueba: "Prueba", ml: "Mensajes de Mercado Libre", pregunta: "Pregunta de Mercado Libre", reclamo: "Reclamo",
};

/** La clave que viaja en la dirección (?con=). Un número suelto es un chat (las direcciones de antes). */
export function partirClave(x: string | null | undefined): { tipo: "c" | "m" | "p" | "r"; id: string } | null {
  if (!x) return null;
  if (/^\d{1,18}$/.test(x)) return { tipo: "c", id: x };
  const m = /^([cmpr]):([\w-]{1,40})$/.exec(x);
  return m ? { tipo: m[1] as "c" | "m" | "p" | "r", id: m[2] } : null;
}

export type FilaBandeja = {
  clave: string; origen: Origen; nombre: string;
  /** Debajo del nombre: el teléfono, la cuenta de Mercado Libre, el pedido… */
  detalle: string;
  ultimo: string; ultimoClase: string; ultimoTs: string;
  sinResponder: boolean;
  /** Espera a una persona: la IA la derivó, o es un reclamo para atender. */
  enEspera: boolean;
  /** La atiende una persona: la IA no contesta sola. */
  atiendePersona: boolean;
};

export type MensajeVista = {
  id: string; clase: "entrante" | "ia" | "operador" | "desde_el_telefono" | "ml"; texto: string; ts: string;
  estado: string | null; motivo: string | null; quien: string | null; usd: number; herramientas: string[];
  /** Una respuesta de la IA que se puede corregir (lib/correccion-ia.ts). */
  corregir?: { origen: "pregunta" | "mensaje" | "whatsapp"; id: string };
};

export type CasoVista = { id: number; asunto: string; motivo: string; abiertoTs: string; asignado: string | null; resolver: boolean };

export type Enlace = { texto: string; href: string; afuera?: boolean };

export type ChatAbierto = {
  clave: string; origen: Origen; nombre: string; detalle: string; enlaces: Enlace[];
  /** El interruptor de la IA de esta conversación (null: no tiene, ej. un reclamo). */
  ia: { prendida: boolean } | null;
  /** Notas internas (sólo los chats de WhatsApp/Instagram). */
  notas: string | null;
  casos: CasoVista[];
  mensajes: MensajeVista[];
  /** Un cartel arriba de la caja (ej. «La IA no la mandó sola: le falta un dato»). */
  aviso: string | null;
  escribir: {
    puede: boolean; porQueNo: string | null; tope: number | null; ayuda: string | null;
    /** Se puede pedir una respuesta a la IA («Proponer con IA»). */
    proponer: boolean;
    /** Lo que ya propuso la IA (viene escrito en la caja). */
    sugerencia: string | null;
    /** Para citar publicaciones con # (las de esa cuenta de ML; null = todas). */
    canalId: number | null;
  };
};

export type FotoBandeja = {
  sello: string; filas: FilaBandeja[]; cuantos: Record<FiltroBandeja, number>; porOrigen: Record<FiltroOrigen, number>;
  abierto: ChatAbierto | null; iaActiva: boolean; nombreIa: string; conectado: boolean;
};
