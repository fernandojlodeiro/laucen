// Tipos de método de envío y las 24 provincias (las claves de
// metodo_envio.tarifas; "*" = resto del país). El checkout de la tienda tiene
// que ofrecer las provincias con estos mismos nombres.

export const TIPOS_ENVIO = {
  retiro: { texto: "Retiro en el local", disponible: true },
  tarifa_fija: { texto: "Tarifa fija", disponible: true },
  por_provincia: { texto: "Por provincia", disponible: true },
  a_convenir: { texto: "A convenir", disponible: true },
  oca: { texto: "OCA (próximamente)", disponible: false },
  andreani: { texto: "Andreani (próximamente)", disponible: false },
} as const;
export type TipoEnvio = keyof typeof TIPOS_ENVIO;
export const esTipoEnvio = (x: unknown): x is TipoEnvio => typeof x === "string" && Object.hasOwn(TIPOS_ENVIO, x);

export const PROVINCIAS = [
  "Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos",
  "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis",
  "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
] as const;
