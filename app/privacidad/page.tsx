// Política de privacidad del sistema (Laucen), pública: la pide Google para publicar la aplicación con la que cada
// organización conecta su Google Drive (Configuración › Google Drive). Dice qué hace el sistema con los datos de
// Google: sólo crea una carpeta y sube los archivos que el usuario manda.

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
      <p>Si una empresa conecta su cuenta de Google, Laucen pide sólo el permiso de <b>crear archivos y ver los archivos que crea él mismo</b> en Google Drive (permiso «drive.file») y el mail de la cuenta para mostrar cuál está conectada. Con ese permiso Laucen crea una carpeta, la comparte con quien la empresa indica (por ejemplo, su contador) y sube ahí los archivos que el usuario manda desde el sistema. No lee, no copia ni modifica ningún otro archivo del Drive, no usa esos datos para publicidad ni los comparte con terceros.</p>
      <p>El uso de la información recibida de las API de Google cumple la <a className="text-[#16577F] underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Política de datos de usuario de los servicios de API de Google ↗</a>, incluidos los requisitos de uso limitado.</p>
      <p>La conexión se puede cortar en cualquier momento desde Laucen (Configuración › Google Drive › Desconectar) o desde la cuenta de Google (Seguridad › Apps con acceso a tu cuenta). Al desconectar, Laucen borra la llave de acceso; la carpeta y los archivos quedan en el Drive de la empresa.</p>
      <h2 className="font-bold mt-2">Contacto</h2>
      <p>Por cualquier consulta sobre estos datos: fernandojlodeiro@gmail.com.</p>
    </main>
  );
}
