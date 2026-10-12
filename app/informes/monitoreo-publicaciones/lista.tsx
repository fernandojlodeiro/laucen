// Monitoreo de precios y publicaciones como lista configurable: «Descargar Excel»
// baja una fila por publicación activa (con los mismos filtros de la pantalla).

import type { Lista, SP } from "@/lib/listas/tipos";
import { monitoreo, nombrePlan, type FiltroMonitoreo } from "@/lib/monitoreo/publicaciones";

export const filtrosMonitoreo = (sp: SP): FiltroMonitoreo => ({
  q: sp.q ?? "", contiene: sp.contiene !== "1", familia: Number(sp.familia) || null, canal: Number(sp.canal) || null, raro: sp.raro === "1",
});

export const LISTA_MONITOREO: Lista = {
  pantalla: "monitoreo_publicaciones",
  titulo: "Monitoreo de precios y publicaciones",
  ruta: "/informes/monitoreo-publicaciones",
  permiso: "informes_publicaciones_ver",
  campos: [
    { clave: "sku", titulo: "SKU", ancho: 16 },
    { clave: "titulo", titulo: "Producto", ancho: 45 },
    { clave: "clasica", titulo: "Clásica de la lista $", formato: "pesos" },
    { clave: "plan", titulo: "Plan", ancho: 12 },
    { clave: "cuenta", titulo: "Cuenta", ancho: 18 },
    { clave: "publicacion", titulo: "Publicación", ancho: 16 },
    { clave: "precio", titulo: "Paga el comprador $", formato: "pesos" },
    { clave: "tachado", titulo: "Tachado $", formato: "pesos" },
    { clave: "off", titulo: "% OFF (cucarda)", formato: "entero" },
    { clave: "gana", titulo: "Gana el plan", formato: "sino" },
    { clave: "deberia", titulo: "Según el esquema gana", ancho: 18 },
    { clave: "catalogo", titulo: "De catálogo", formato: "sino" },
    { clave: "recuadro", titulo: "Recuadro de catálogo", ancho: 16 },
    { clave: "raro", titulo: "Para mirar", ancho: 50 },
  ],
  enPantalla: ["sku", "titulo", "clasica", "plan", "cuenta", "publicacion", "precio", "tachado", "off", "gana", "deberia", "catalogo", "recuadro", "raro"],
  filas: async (ctx, sp) => {
    const { bloques, cuentas } = await monitoreo(ctx.org, filtrosMonitoreo(sp));
    const nombre = new Map(cuentas.map((c) => [c.id, c.nombre]));
    return bloques.flatMap((b) => b.planes.flatMap((pl) => Object.values(pl.celdas).flat().map((c) => ({
      sku: b.sku, titulo: b.titulo, clasica: b.clasica, plan: nombrePlan(pl.plan), cuenta: nombre.get(c.canalId) ?? c.canalId, publicacion: c.itemId,
      precio: c.precio, tachado: c.tachado, off: c.off, gana: c.gana, deberia: pl.deberia && !pl.conExcepcion ? nombre.get(pl.deberia) ?? "" : "",
      catalogo: c.catalogo, recuadro: TEXTO_RECUADRO[c.recuadro ?? ""] ?? c.recuadro ?? "", raro: b.raro.join(" · "),
    }))));
  },
};

export const TEXTO_RECUADRO: Record<string, string> = {
  winning: "Gana", sharing_first_place: "Comparte el primer lugar", competing: "Compite (no gana)", listed: "Listada", not_listed: "No figura",
};
