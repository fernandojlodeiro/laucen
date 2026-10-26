// Política de privacidad del sistema (Laucen), pública: la piden Google (Google Drive, Google Ads) y Meta (Instagram,
// anuncios) para publicar las aplicaciones con las que cada organización conecta sus cuentas. Dice qué hace el sistema
// con los datos de cada uno, y cómo pedir que se borren (#eliminacion, la dirección que se carga en Meta).

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de privacidad — Laucen" };

export default function Privacidad() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm leading-relaxed text-[#1F2A33] grid gap-3 bg-white">
      <h1 className="text-xl font-bold">Política de privacidad de Laucen</h1>
      <p>Laucen es un sistema de gestión para empresas (ventas, compras, stock, administración e impuestos). Esta política explica qué datos trata y para qué.</p>
      <h2 className="font-bold mt-2">Datos que se cargan en el sistema</h2>
      <p>Los datos que cada empresa carga (clientes, proveedores, productos, comprobantes) son de esa empresa y sólo los ven los usuarios que ella habilita. Se usan únicamente para prestar el servicio y se tratan conforme a la Ley 25.326 de Protección de los Datos Personales.</p>
      <h2 className="font-bold mt-2">Google Drive</h2>
      <p>Si una empresa conecta su cuenta de Google, Laucen pide acceso a su Google Drive y el mail de la cuenta (para mostrar cuál está conectada). Lo usa sólo para <b>dejar los archivos que el usuario manda desde el sistema</b> (por ejemplo, los del Libro de IVA Digital) en la carpeta que la empresa indica y para <b>leer las declaraciones juradas</b> que su contador deja en las carpetas de cada mes de ese mismo camino: recorre únicamente ese camino de carpetas, crea las del año y el mes si faltan, sube ahí los archivos y lee las declaraciones para cargarlas en el sistema de la empresa. No lee, no copia ni modifica ningún otro archivo del Drive, no usa esos datos para publicidad ni los comparte con terceros.</p>
      <p>El uso de la información recibida de las API de Google cumple la <a className="text-[#16577F] underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Política de datos de usuario de los servicios de API de Google ↗</a>, incluidos los requisitos de uso limitado.</p>
      <p>La conexión se puede cortar en cualquier momento desde Laucen (Configuración › Google Drive › Desconectar) o desde la cuenta de Google (Seguridad › Apps con acceso a tu cuenta). Al desconectar, Laucen borra la llave de acceso; los archivos quedan en el Drive de la empresa.</p>
      <h2 className="font-bold mt-2">Instagram</h2>
      <p>Si una empresa conecta la cuenta de Instagram de su negocio, Laucen recibe los mensajes directos que le escriben a esa cuenta y manda las respuestas que la empresa escribe (o que aprueba) desde el sistema. Guarda esas conversaciones —el nombre de usuario de quien escribe y los mensajes— sólo para que la empresa las atienda, y si el mensaje llegó desde un anuncio, de qué anuncio vino. No publica nada en la cuenta, no lee otras partes del perfil y no usa esos datos para publicidad ni los comparte con terceros.</p>
      <h2 className="font-bold mt-2">Anuncios de Meta (Facebook e Instagram) y Google Ads</h2>
      <p>Si una empresa conecta sus cuentas publicitarias, Laucen <b>sólo lee</b> lo que gastó cada anuncio, cuántas veces se vio y cuántos clics tuvo, para mostrarle a la empresa cuánto vendió por lo que invirtió. No crea, cambia ni pausa anuncios, no lee datos de las personas que los vieron y no comparte esa información con terceros.</p>
      <p>El uso de la información recibida de las API de Google, incluida la de Google Ads, cumple la misma política de datos de usuario de Google mencionada arriba.</p>
      <p>Cada conexión se puede cortar en cualquier momento desde Laucen (Ventas › Mensajes › Configuración para Instagram; Informes › Embudo de publicidad para los anuncios) o desde la propia cuenta de Meta o de Google. Al desconectar, Laucen deja de usar la llave de acceso.</p>
      <h2 className="font-bold mt-2">Medición y publicidad en las tiendas web</h2>
      <p>Las tiendas web de las empresas que usan Laucen pueden guardar, con un identificador anónimo del navegador, cómo llegó cada visitante (un anuncio, un buscador, otra página) y qué miró, y avisarle a Google y a Meta las visitas, las compras y los clics en WhatsApp para medir sus anuncios y mostrar publicidad. Cada empresa puede exportar el teléfono y el mail de quienes le consultaron y no compraron para subirlos, cifrados, a Google Ads o a Meta. Cada tienda lo informa en su propia política de privacidad.</p>
      <h2 id="eliminacion" className="font-bold mt-2">Cómo pedir que se borren tus datos</h2>
      <p>Si le escribiste a una empresa que usa Laucen (por Instagram, WhatsApp o Mercado Libre) y querés que se borren tus mensajes y tus datos, escribí a fernandojlodeiro@gmail.com diciendo tu nombre de usuario y a qué empresa le escribiste. Se borran en un plazo de 30 días y te avisamos por mail cuando esté hecho. Una empresa que usa Laucen también puede pedir que se borren todos los datos de su cuenta por el mismo medio.</p>
      <h2 className="font-bold mt-2">Contacto</h2>
      <p>Por cualquier consulta sobre estos datos: fernandojlodeiro@gmail.com.</p>
    </main>
  );
}
