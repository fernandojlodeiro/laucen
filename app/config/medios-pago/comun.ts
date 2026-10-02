// Los cinco medios de pago de la tienda, con su nombre por defecto y la
// ayuda que se muestra en la pantalla.

export const TIPOS_MEDIO = {
  mercadopago: { nombre: "Mercado Pago", ayuda: "El access token se saca en mercadopago.com.ar/developers → Tus integraciones → Credenciales de producción." },
  payway: { nombre: "Tarjeta (Payway)", ayuda: "Las llaves te las da Payway al habilitar el e-commerce." },
  transferencia: { nombre: "Transferencia bancaria", ayuda: "En instrucciones poné CBU, alias, titular y CUIT: es lo que ve el comprador." },
  efectivo: { nombre: "Efectivo", ayuda: "Al retirar en el local: el pedido queda pendiente hasta que confirmás el pago." },
  cuenta_corriente: { nombre: "Cuenta corriente / a convenir", ayuda: "Sólo para clientes marcados con cuenta corriente en su ficha." },
} as const;
export type TipoMedio = keyof typeof TIPOS_MEDIO;
export const esTipoMedio = (x: unknown): x is TipoMedio => typeof x === "string" && Object.hasOwn(TIPOS_MEDIO, x);

/** Qué credenciales hacen falta para prender cada medio (los demás, ninguna). */
export const CREDENCIALES_REQUERIDAS: Partial<Record<TipoMedio, string[]>> = {
  mercadopago: ["access_token"],
  payway: ["public_key", "private_key"],
};
