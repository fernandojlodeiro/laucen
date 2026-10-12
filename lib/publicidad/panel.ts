// Publicidad: los enlaces al panel de Mercado Libre (los cambios se hacen ahí: la API sólo deja leer).
// La dirección exacta de una campaña en el panel la confirma Cowork con el Chrome de Fer (hilo 596).

export const enlacePanelPublicidad = () => "https://ads.mercadolibre.com.ar/";
export const enlaceCampana = (campanaId: number | string) => `https://ads.mercadolibre.com.ar/product-ads/campaigns/${encodeURIComponent(String(campanaId))}`;
