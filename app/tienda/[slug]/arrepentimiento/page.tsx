// Botón de arrepentimiento (Resolución 424/2020 de la Secretaría de Comercio
// Interior): el comprador pide revocar la compra dentro de los 10 días. El
// pedido le llega a la tienda por mail o WhatsApp, con los datos ya escritos.

import type { Metadata } from "next";
import { cargarTienda, linkWhatsapp } from "../catalogo";
import { BOTON, BOTON_SUAVE, IconoWhatsapp } from "../piezas";
import { CONSUMIDOR_URL, PaginaLegal, proveedorDe } from "../legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Botón de arrepentimiento" };

export default async function Arrepentimiento({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const p = await proveedorDe(t);
  const asunto = encodeURIComponent(`Arrepentimiento de compra - ${p.nombre}`);
  const cuerpo = encodeURIComponent("Quiero revocar mi compra (art. 34, Ley 24.240).\n\nNúmero de pedido:\nNombre y apellido:\nDocumento:\nProducto/s:\nFecha en que lo recibí:\n");
  const wa = linkWhatsapp(t, `Hola ${p.nombre}, quiero ejercer el arrepentimiento de mi compra. Número de pedido: `);
  return (
    <PaginaLegal titulo="Botón de arrepentimiento">
      <p>Si te arrepentiste de tu compra, podés revocarla dentro de los <b>10 días corridos</b> desde que recibiste el producto. Es gratis y no tenés que explicar el motivo (art. 34 de la Ley 24.240 y Resolución 424/2020).</p>
      <p>Mandanos tu número de pedido, tu nombre y documento. Te contestamos con la constancia y te indicamos cómo devolver el producto, que tiene que estar sin uso, completo y en su embalaje original. Te reintegramos lo pagado por el mismo medio de pago.</p>
      <div className="flex flex-wrap gap-3 pt-2">
        {p.email && <a href={`mailto:${p.email}?subject=${asunto}&body=${cuerpo}`} className={BOTON}>Quiero arrepentirme de mi compra</a>}
        {wa && <a href={wa} target="_blank" rel="noopener" className={BOTON_SUAVE}><IconoWhatsapp clase="h-5 w-5" /> Pedirlo por WhatsApp</a>}
      </div>
      {!p.email && !wa && <p>Escribinos por los canales de contacto de la tienda con tu número de pedido.</p>}
      <p className="text-sm text-[var(--texto-2)]">¿Algo no se resolvió? Podés hacer tu reclamo en la <a href={CONSUMIDOR_URL} target="_blank" rel="noopener" className="text-[var(--boton)] hover:underline">Dirección Nacional de Defensa del Consumidor</a>.</p>
    </PaginaLegal>
  );
}
