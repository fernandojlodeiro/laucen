// Política de privacidad: tratamiento de datos personales según la Ley 25.326
// (Protección de los Datos Personales). Modelo general; los datos del
// responsable salen de lo cargado.

import type { Metadata } from "next";
import { cargarTienda } from "../catalogo";
import { DatosProveedor, PaginaLegal, proveedorDe } from "../legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Política de privacidad" };

export default async function Privacidad({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const p = await proveedorDe(t);
  const link = "text-[var(--boton)] hover:underline";
  return (
    <PaginaLegal titulo="Política de privacidad" ultima>
      <p>Cuidamos tus datos personales y los tratamos conforme a la Ley 25.326 de Protección de los Datos Personales y sus normas complementarias.</p>

      <h2>Responsable de la base de datos</h2>
      <DatosProveedor p={p} />

      <h2>Qué datos recolectamos</h2>
      <ul>
        <li>Datos de identificación y contacto: nombre, documento o CUIT, mail, teléfono.</li>
        <li>Datos de entrega y facturación: domicilio, código postal, condición frente al IVA.</li>
        <li>Datos de tus compras y de tu cuenta, si te registrás.</li>
        <li>Datos técnicos mínimos del navegador y cookies necesarias para que funcione el carrito y tu sesión.</li>
        <li>Cómo llegaste a la tienda (por ejemplo, desde un anuncio o un buscador) y qué páginas y productos miraste, asociados a un identificador anónimo de tu navegador.</li>
      </ul>
      <p>No guardamos los datos de tu tarjeta: el pago se procesa en la plataforma de pago.</p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Procesar y entregar tus pedidos, y emitir la factura.</li>
        <li>Atender consultas, reclamos, cambios, devoluciones y garantías.</li>
        <li>Cumplir obligaciones legales, fiscales y contables.</li>
        <li>Prevenir fraudes y mantener la seguridad del sitio.</li>
        <li>Medir qué anuncios funcionan y mostrarte publicidad de nuestros productos en otros sitios (por ejemplo, en Google, Facebook e Instagram), incluso si nos consultaste y no compraste.</li>
      </ul>

      <h2>Con quién los compartimos</h2>
      <p>Sólo con quienes hacen falta para cumplir tu compra: empresas de transporte y correo, plataformas de pago, ARCA (por la facturación electrónica) y proveedores de servicios tecnológicos que trabajan para nosotros. Para medir y mostrar publicidad compartimos con Google y Meta (Facebook e Instagram) lo que hiciste en la tienda y, si consultaste o compraste, tu mail y tu teléfono cifrados, para que puedan reconocerte en sus plataformas. No vendemos tus datos.</p>

      <h2>Cuánto tiempo los conservamos</h2>
      <p>Mientras sea necesario para las finalidades anteriores y durante los plazos que exigen las normas fiscales y de defensa del consumidor.</p>

      <h2>Tus derechos</h2>
      <p>Podés acceder a tus datos, rectificarlos, actualizarlos o pedir su supresión escribiéndonos{p.email ? <> a <a href={`mailto:${p.email}`} className={link}>{p.email}</a></> : ""}. El acceso es gratuito a intervalos no inferiores a seis meses, salvo interés legítimo acreditado (art. 14 de la Ley 25.326).</p>
      <p>La Agencia de Acceso a la Información Pública, como órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan por incumplimiento de las normas sobre protección de datos personales.</p>

      <h2>Cookies</h2>
      <p>Usamos cookies propias para recordar tu carrito, tu código postal y tu sesión, y para saber cómo llegaste a la tienda. También usamos cookies y etiquetas de Google (Google Ads y Google Analytics) y de Meta (el píxel de Meta) para medir las visitas y las compras y mostrarte publicidad. Podés bloquearlas desde tu navegador, pero algunas funciones de la tienda dejarían de andar.</p>
      <p>Si nos escribís por WhatsApp desde el botón de la tienda, el mensaje lleva un código que no se ve, para saber desde qué página o anuncio nos escribiste.</p>
      <p>Si no querés que usemos tus datos para publicidad, o querés que los borremos, escribinos{p.email ? <> a <a href={`mailto:${p.email}`} className={link}>{p.email}</a></> : ""} y lo hacemos dentro de los 30 días.</p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, publicamos la nueva versión en esta página.</p>
    </PaginaLegal>
  );
}
