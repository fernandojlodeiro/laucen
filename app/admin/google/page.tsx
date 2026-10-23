// La aplicación de Google de Laucen (herramienta interna, sólo el dueño del sistema): con ella cada organización
// conecta su Google Drive desde Configuración › Google Drive. Se cargan el ID de cliente y el secreto una vez; nunca
// se vuelven a mostrar (sólo si están cargados). Abajo, los pasos para crearla en Google Cloud.

import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { VERDE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Estado, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { una } from "@/lib/erp/base";
import { urlVuelta } from "@/lib/google/drive";
import { urlPanel } from "@/lib/tienda/dominios";
import { accionGuardarAppGoogle } from "./acciones";

export const dynamic = "force-dynamic";

const LINK = "text-[#16577F] hover:underline";

export default async function AppGoogle({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await entrarErp("empresa_config");
  if (!(await sosVos())) redirect("/panel");
  const sp = await searchParams;
  const f = await una<{ actualizado_ts: Date }>("select actualizado_ts from plataforma_google where id = 1");
  const dominio = new URL(urlPanel() || "https://laucen.com").hostname;
  return (
    <Pantalla titulo="Aplicación de Google" subtitulo="La aplicación de Google con la que cada organización conecta su Google Drive (para mandarle archivos al contador)." ancho="max-w-3xl"
      acciones={<button type="submit" form="app-google" className={VERDE}>Grabar</button>}>
      <Avisos sp={sp} />
      <section className={`${CAJA} mb-4 text-xs grid gap-2`}>
        <div className="flex items-center gap-2">Estado: {f ? <Estado texto="Cargada" tono="verde" /> : <Estado texto="Sin cargar" tono="rojo" />}
          {f && <span className="text-[#5C6B76]">(última vez: {new Date(f.actualizado_ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })})</span>}</div>
        <p className="font-bold">Cómo se crea (una sola vez, con tu cuenta de Google):</p>
        <ol className="list-decimal pl-5 grid gap-1">
          <li>Entrá a <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer" className={LINK}>Google Cloud › Nuevo proyecto ↗</a>, ponele de nombre «Laucen» y apretá <b>Crear</b>.</li>
          <li>Con ese proyecto elegido, entrá a <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer" className={LINK}>Google Drive API ↗</a> y apretá <b>Habilitar</b>.</li>
          <li>Entrá a <a href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer" className={LINK}>Google Auth Platform › Branding ↗</a> (si te lo pide, <b>Comenzar</b>): nombre de la app «Laucen», tu mail de asistencia, público <b>Externo</b>, tu mail de contacto, aceptar y <b>Crear</b>. En <b>Dominios autorizados</b> agregá <span className="font-mono">{dominio}</span>.</li>
          <li>En <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer" className={LINK}>Público ↗</a>, apretá <b>Publicar la app</b> (en «prueba», Google corta la conexión cada 7 días). No hace falta verificación: Laucen sólo pide crear sus propios archivos.</li>
          <li>En <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer" className={LINK}>Clientes ↗</a>: <b>Crear cliente</b> → tipo <b>Aplicación web</b>, nombre «Laucen», y en <b>URI de redireccionamiento autorizados</b> agregá exactamente:</li>
        </ol>
        <p className="font-mono bg-[#FAFBFC] border border-[#E3E9F0] rounded-lg px-2 py-1.5 select-all">{urlVuelta()}</p>
        <p>Al crearlo, Google muestra el <b>ID de cliente</b> y el <b>Secreto del cliente</b>: pegalos acá abajo y apretá <b>Grabar</b> (arriba a la derecha). No se vuelven a mostrar.</p>
      </section>
      <form id="app-google" action={accionGuardarAppGoogle} className={`${CAJA} grid gap-3 text-xs`}>
        <label><span className={ETIQUETA}>ID de cliente</span>
          <input name="client_id" autoComplete="off" placeholder="123456789-abc….apps.googleusercontent.com" className={`${CAMPO} w-full font-mono`} required /></label>
        <label><span className={ETIQUETA}>Secreto del cliente</span>
          <input name="client_secret" type="password" autoComplete="off" className={`${CAMPO} w-full font-mono`} required /></label>
      </form>
    </Pantalla>
  );
}
