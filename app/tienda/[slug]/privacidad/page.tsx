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
      </ul>
      <p>No guardamos los datos de tu tarjeta: el pago se procesa en la plataforma de pago.</p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Procesar y entregar tus pedidos, y emitir la factura.</li>
        <li>Atender consultas, reclamos, cambios, devoluciones y garantías.</li>
        <li>Cumplir obligaciones legales, fiscales y contables.</li>
        <li>Prevenir fraudes y mantener la seguridad del sitio.</li>
      </ul>

      <h2>Con quién los compartimos</h2>
      <p>Sólo con quienes hacen falta para cumplir tu compra: empresas de transporte y correo, plataformas de pago, ARCA (por la facturación electrónica) y proveedores de servicios tecnológicos que trabajan para nosotros. No vendemos tus datos.</p>

      <h2>Cuánto tiempo los conservamos</h2>
      <p>Mientras sea necesario para las finalidades anteriores y durante los plazos que exigen las normas fiscales y de defensa del consumidor.</p>

      <h2>Tus derechos</h2>
      <p>Podés acceder a tus datos, rectificarlos, actualizarlos o pedir su supresión escribiéndonos{p.email ? <> a <a href={`mailto:${p.email}`} className={link}>{p.email}</a></> : ""}. El acceso es gratuito a intervalos no inferiores a seis meses, salvo interés legítimo acreditado (art. 14 de la Ley 25.326).</p>
      <p>La Agencia de Acceso a la Información Pública, como órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan por incumplimiento de las normas sobre protección de datos personales.</p>

      <h2>Cookies</h2>
      <p>Usamos cookies propias para recordar tu carrito, tu código postal y tu sesión. Podés bloquearlas desde tu navegador, pero algunas funciones de la tienda dejarían de andar.</p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, publicamos la nueva versión en esta página.</p>
    </PaginaLegal>
  );
}
