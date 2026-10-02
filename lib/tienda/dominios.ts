// Dominios propios de las tiendas: el middleware reescribe <dominio>/… a
// /tienda/<slug>/… (sin que el comprador vea /tienda en la dirección).
// Vacío hasta que Fer decida qué dominio va a la tienda (laucen.com o
// laucen.com.ar); mientras, la tienda está en laucen.vercel.app/tienda/<slug>.
export const DOMINIOS_TIENDA: Record<string, string> = {
  // "laucen.com": "laucen",
  // "www.laucen.com": "laucen",
};
