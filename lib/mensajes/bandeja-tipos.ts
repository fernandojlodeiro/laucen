// Tipos y filtros de la carpeta de mensajes, sin base: los usa también la
// pantalla (componente de cliente).

export type FiltroBandeja = "todos" | "sin_responder" | "en_espera" | "persona";

export const FILTROS: { clave: FiltroBandeja; texto: string }[] = [
  { clave: "todos", texto: "Todos" },
  { clave: "sin_responder", texto: "Sin responder" },
  { clave: "en_espera", texto: "En espera" },
  { clave: "persona", texto: "Con persona" },
];

export const esFiltro = (x: unknown): x is FiltroBandeja => FILTROS.some((f) => f.clave === x);

export type FilaBandeja = {
  id: number; canal: "whatsapp" | "prueba"; nombre: string; telefono: string; clienteId: number | null; clienteNombre: string | null;
  ultimo: string; ultimoClase: string; ultimoTs: string; sinResponder: boolean; casos: number; atiendePersona: boolean;
};

export type MensajeVista = {
  id: number; clase: "entrante" | "ia" | "operador" | "desde_el_telefono"; texto: string; ts: string;
  estado: string | null; motivo: string | null; quien: string | null; usd: number; herramientas: string[];
};

export type CasoVista = { id: number; asunto: string; motivo: string; abiertoTs: string; asignado: string | null };

export type ChatAbierto = {
  id: number; canal: "whatsapp" | "prueba"; nombre: string; telefono: string; clienteId: number | null; clienteNombre: string | null;
  atiendePersona: boolean; notas: string; ventanaAbierta: boolean; mensajes: MensajeVista[]; casos: CasoVista[];
};

export type FotoBandeja = {
  sello: string; filas: FilaBandeja[]; cuantos: Record<FiltroBandeja, number>; abierto: ChatAbierto | null;
  iaActiva: boolean; nombreIa: string; conectado: boolean;
};
