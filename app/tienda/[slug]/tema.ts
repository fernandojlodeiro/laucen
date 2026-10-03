// Colores de la tienda: TODOS salen de variables CSS que pone el layout en el
// marco de la tienda. Cada tienda los cambia en Configuración → Tienda web
// (canal.config.color_*); vacío = el de abajo. Las páginas nunca escriben un
// color de marca fijo: usan var(--marca), var(--boton), etc.

import type { Tienda } from "@/lib/tienda/tienda";

export const COLORES_POR_DEFECTO = {
  marca: "#FFE600",        // franja del encabezado
  marcaTexto: "#333333",   // texto sobre la franja
  boton: "#3483FA",        // botones, links, elegido
  verde: "#00A650",        // descuentos, cuotas sin interés, envío gratis
  fondo: "#EDEDED",        // fondo de la página
} as const;

const hex = (x: string | undefined, d: string) => (/^#[0-9a-f]{6}$/i.test(x ?? "") ? x! : d);

/** "#3483FA" + 0.15 → "rgba(52,131,250,0.15)" */
function conAlfa(color: string, alfa: number) {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/** Oscurece un color (para el hover de los botones). */
function oscuro(color: string, f = 0.85) {
  const n = parseInt(color.slice(1), 16);
  const c = (x: number) => Math.round(x * f).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

export function colores(t: Tienda) {
  const c = t.config;
  return {
    marca: hex(c.color_marca, COLORES_POR_DEFECTO.marca),
    marcaTexto: hex(c.color_marca_texto, COLORES_POR_DEFECTO.marcaTexto),
    boton: hex(c.color_boton, COLORES_POR_DEFECTO.boton),
    verde: hex(c.color_verde, COLORES_POR_DEFECTO.verde),
    fondo: hex(c.color_fondo, COLORES_POR_DEFECTO.fondo),
  };
}

/** Las variables CSS del marco de la tienda. */
export function variablesTema(t: Tienda): React.CSSProperties {
  const k = colores(t);
  return {
    "--marca": k.marca,
    "--marca-texto": k.marcaTexto,
    "--boton": k.boton,
    "--boton-hover": oscuro(k.boton),
    "--boton-claro": conAlfa(k.boton, 0.15),
    "--boton-claro-hover": conAlfa(k.boton, 0.25),
    "--verde": k.verde,
    "--fondo": k.fondo,
    // Fijos de la experiencia (no son de marca): texto, grises y etiquetas.
    "--texto": "rgba(0,0,0,.9)",
    "--texto-2": "rgba(0,0,0,.55)",
    "--linea": "rgba(0,0,0,.1)",
    "--menu-oscuro": "#333333",
    "--etiqueta-vendido": "#FF7733",
    "--etiqueta-oferta": k.boton,
    // Compatibilidad: lo que todavía usa --acento (pago con tarjeta, etc.) toma el color de los botones.
    "--acento": k.boton,
  } as React.CSSProperties;
}
