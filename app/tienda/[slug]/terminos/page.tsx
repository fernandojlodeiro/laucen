// Términos y condiciones de la compra en la tienda (modelo general para
// comercio electrónico en Argentina: Ley 24.240 de Defensa del Consumidor,
// Ley 25.326 de Datos Personales, Código Civil y Comercial). Los datos del
// proveedor, las devoluciones y la garantía salen de lo cargado.

import type { Metadata } from "next";
import Link from "next/link";
import { rutaTienda } from "@/lib/tienda/tienda";
import { cargarTienda } from "../catalogo";
import { CONSUMIDOR_URL, DatosProveedor, PaginaLegal, proveedorDe } from "../legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Términos y condiciones" };

export default async function Terminos({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const p = await proveedorDe(t);
  const c = t.config;
  const link = "text-[var(--boton)] hover:underline";
  return (
    <PaginaLegal titulo="Términos y condiciones" ultima>
      <p>Estos términos regulan el uso del sitio y las compras que se hacen en él. Al comprar aceptás estas condiciones; leelas antes de confirmar tu pedido.</p>

      <h2>1. Quién vende</h2>
      <DatosProveedor p={p} />

      <h2>2. Productos, precios y stock</h2>
      <ul>
        <li>Los precios están expresados en pesos argentinos e incluyen IVA, salvo que se indique otra cosa.</li>
        <li>Las imágenes y descripciones son orientativas. Hacemos lo posible por que sean exactas; si encontrás un error, escribinos.</li>
        <li>La disponibilidad se confirma al finalizar la compra. Si por un error de carga un producto no tuviera stock o tuviera un precio evidentemente equivocado, te avisamos y podés elegir otro producto o que te devolvamos lo pagado.</li>
        <li>Las ofertas y descuentos rigen mientras dure la promoción o el stock publicado.</li>
      </ul>

      <h2>3. Cómo se compra</h2>
      <p>La compra se perfecciona cuando recibís el mail o la pantalla de confirmación del pedido y, según el medio elegido, se acredita el pago. No hace falta tener cuenta. Los datos que cargues tienen que ser verdaderos y completos.</p>

      <h2>4. Medios de pago</h2>
      <p>Los medios disponibles, con sus descuentos o recargos, están en <Link href={`${rutaTienda(t, "/ayuda")}#pagos`} className={link}>Ayuda</Link> y en el checkout. Los pagos con tarjeta y por transferencia se procesan a través de plataformas de pago de terceros; no guardamos los datos de tu tarjeta. Las cuotas disponibles de cada producto figuran en su ficha. Si el pago no se acredita en el plazo indicado, el pedido se cancela y se libera el stock.</p>

      <h2>5. Facturación</h2>
      <p>Emitimos factura electrónica por cada compra, a nombre de la persona o empresa cuyos datos fiscales cargues en el pedido. Para factura A necesitamos el CUIT de un responsable inscripto.</p>

      <h2>6. Envíos y entrega</h2>
      <p>Los métodos, costos y plazos de envío y retiro figuran en <Link href={`${rutaTienda(t, "/ayuda")}#envios`} className={link}>Ayuda</Link> y se calculan en el checkout según tu código postal. Los plazos son estimados y empiezan a contarse desde que se acredita el pago. Es importante que haya alguien para recibir el paquete en el domicilio indicado; si el envío vuelve por una dirección incorrecta o falta de recepción, el nuevo envío puede tener costo.</p>

      <h2>7. Derecho de arrepentimiento</h2>
      <p>De acuerdo con el art. 34 de la Ley 24.240 y la Resolución 424/2020, podés revocar la compra dentro de los <b>10 días corridos</b> contados desde que recibís el producto o desde que se celebra el contrato, lo último que ocurra. La revocación es gratuita y no hace falta explicar los motivos. Se ejerce desde <Link href={rutaTienda(t, "/arrepentimiento")} className={link}>el botón de arrepentimiento</Link>. Reintegramos lo pagado por el mismo medio de pago, dentro de los 10 días de recibido el producto, que debe devolverse sin uso, completo y en su embalaje original. Los gastos de la devolución por arrepentimiento no están a tu cargo.</p>

      <h2>8. Devoluciones, cambios y garantía</h2>
      {c.devoluciones ? <p className="whitespace-pre-line"><b>Devoluciones.</b> {c.devoluciones}</p> : <p>Para cambios y devoluciones escribinos y lo resolvemos en conjunto.</p>}
      {c.garantia
        ? <p className="whitespace-pre-line"><b>Garantía.</b> {c.garantia}</p>
        : <p>Los productos tienen la garantía legal que establecen los arts. 11 a 18 de la Ley 24.240 (tres meses para cosas usadas y seis para cosas nuevas, como mínimo) o la del fabricante, la que sea mayor.</p>}
      <p>La garantía no cubre daños por mal uso, golpes, humedad, instalaciones o reparaciones hechas por terceros no autorizados. Para hacer valer la garantía, conservá la factura y escribinos por los canales de contacto.</p>

      <h2>9. Propiedad intelectual</h2>
      <p>Los textos, imágenes, logos y demás contenidos del sitio son de {p.nombre} o de sus proveedores y están protegidos por la ley. No se pueden copiar ni usar sin autorización. Las marcas de terceros que aparecen pertenecen a sus dueños y se mencionan sólo para identificar los productos.</p>

      <h2>10. Responsabilidad</h2>
      <p>Hacemos lo posible por mantener el sitio disponible y sin errores, pero no garantizamos que funcione sin interrupciones. No respondemos por demoras o fallas ajenas a nosotros (correos, plataformas de pago, caídas de internet). Nada de lo acá dispuesto limita los derechos que la ley te reconoce como consumidor.</p>

      <h2>11. Datos personales</h2>
      <p>El tratamiento de tus datos se explica en la <Link href={rutaTienda(t, "/privacidad")} className={link}>política de privacidad</Link>.</p>

      <h2>12. Ley aplicable y reclamos</h2>
      <p>Estos términos se rigen por las leyes de la República Argentina. Ante cualquier controversia, podés elegir la jurisdicción del lugar de tu domicilio o la del domicilio del proveedor, según el art. 36 de la Ley 24.240. {p.email ? <>Podés hacer tus reclamos escribiendo a <a href={`mailto:${p.email}`} className={link}>{p.email}</a>.</> : "Podés hacer tus reclamos por los canales de contacto de la tienda."}</p>
      <p><b>Defensa del consumidor.</b> Ante cualquier reclamo no resuelto, podés presentarlo en la <a href={CONSUMIDOR_URL} target="_blank" rel="noopener" className={link}>Dirección Nacional de Defensa del Consumidor</a> o en la oficina de defensa del consumidor de tu jurisdicción.</p>

      <h2>13. Cambios en los términos</h2>
      <p>Podemos actualizar estos términos. Rigen para las compras hechas después de la fecha de actualización.</p>
    </PaginaLegal>
  );
}
