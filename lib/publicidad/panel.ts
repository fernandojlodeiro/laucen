// Publicidad: los enlaces al panel de Mercado Ads (las direcciones las verificó Cowork en el panel; el id de la
// campaña en el panel es el mismo que el de la API).

export const enlacePanelPublicidad = () => "https://ads.mercadolibre.com.ar/product-ads/admin/campaigns";
export const enlaceCampana = (campanaId: number | string) =>
  `https://ads.mercadolibre.com.ar/product-ads/admin/campaigns/${encodeURIComponent(String(campanaId))}/dashboard`;
