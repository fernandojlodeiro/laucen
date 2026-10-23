// Configuración › Google Drive (Fer, 23/10): conectar el Google Drive de la organización y crear la carpeta del
// contador, compartida con su mail. Después, desde Libros de IVA, «Mandar al Drive del contador» sube ahí los TXT
// del Libro de IVA Digital de cada mes. La conexión y las subidas: lib/google/drive.ts.

import Link from "next/link";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, Dato, TituloSeccion, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { sosVos } from "@/lib/admin";
import { appGoogle, conexionDrive, urlCarpeta } from "@/lib/google/drive";
import { accionCarpetaContador, accionDesconectarDrive } from "./acciones";

export const dynamic = "force-dynamic";

const fechaHora = (t: string | null) => (t ? new Date(t).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : null);

export default async function GoogleDrive({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("empresa_config");
  const sp = await searchParams;
  const [app, c, esDueno] = await Promise.all([appGoogle(), conexionDrive(s.org.id), sosVos()]);
  return (
    <Pantalla titulo="Google Drive" ancho="max-w-3xl"
      subtitulo="La carpeta del Drive donde Laucen deja los archivos para el contador (los TXT del Libro de IVA Digital de cada mes)">
      <Avisos sp={sp} />

      <section className={`${CAJA} mb-4 text-xs`}>
        <TituloSeccion titulo="1. Conexión">
          {c.conectado
            ? <BotonConfirmar accion={accionDesconectarDrive} campos={{}} clase={SUAVE} texto="Desconectar" pregunta="¿Desconectar Google Drive?" corriendo="Desconectando…" />
            : app ? <a href="/config/google-drive/conectar" className={PRIMARIO}>Conectar Google Drive</a> : null}
        </TituloSeccion>
        {c.conectado ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <Dato etiqueta="Cuenta de Google">{c.cuenta_email}</Dato>
            <Dato etiqueta="Conectada el">{fechaHora(c.conectado_ts)}</Dato>
          </div>
        ) : app ? (
          <p>Apretá <b>Conectar Google Drive</b> (arriba a la derecha de este recuadro): Google te pide entrar con tu cuenta y aprobar que Laucen <b>cree y suba archivos</b> en tu Drive. Laucen sólo ve lo que crea él; el resto de tu Drive no lo ve.</p>
        ) : (
          <p className="rounded-lg px-3 py-2 bg-[#FFF8E5] text-[#8a6100]">
            Falta cargar la aplicación de Google de Laucen (se hace una sola vez).{" "}
            {esDueno ? <Link href="/admin/google" className="underline">Cargala acá</Link> : "La carga el administrador del sistema."}
          </p>
        )}
      </section>

      <section className={`${CAJA} mb-4 text-xs`}>
        <TituloSeccion titulo={<>2. Carpeta del contador {c.carpeta_id && <Estado texto="Lista" tono="verde" />}</>}>
          {c.carpeta_id && <a href={urlCarpeta(c.carpeta_id)} target="_blank" rel="noreferrer" className={SUAVE}>Abrir la carpeta ↗</a>}
        </TituloSeccion>
        {!c.conectado ? <p className="text-[#5C6B76]">Primero conectá Google Drive.</p> : (
          <form action={accionCarpetaContador} className="flex flex-wrap items-end gap-3">
            <label><span className={ETIQUETA}>Nombre de la carpeta</span>
              <input name="nombre" required defaultValue={c.carpeta_nombre ?? "Laucen – Contador"} className={`${CAMPO} w-64`} /></label>
            <label><span className={ETIQUETA}>Mail del contador (se la comparte)</span>
              <input name="mail" type="email" defaultValue={c.compartida_con ?? ""} placeholder="contador@estudio.com" className={`${CAMPO} w-64`} /></label>
            <BotonEnviar clase={PRIMARIO} corriendo="Creando…">{c.carpeta_id ? "Grabar y compartir" : "Crear la carpeta"}</BotonEnviar>
            <p className="w-full text-[11px] text-[#5C6B76]">
              Laucen la crea en la raíz de tu Drive; después la podés mover adonde quieras dentro del Drive y sigue andando.
              Adentro, cada envío va a una subcarpeta por mes y razón social.
            </p>
          </form>
        )}
      </section>

      <section className={`${CAJA} text-xs`}>
        <TituloSeccion titulo="3. Mandar los archivos" />
        <p>En <Link href="/administracion/libros-iva" className="text-[#16577F] hover:underline">Administración › Libros de IVA</Link>, eligiendo el mes, en el recuadro «Libro de IVA Digital (ARCA)»: botón <b>Mandar al Drive del contador</b>.</p>
        {c.ultimo_envio_ts && <p className="mt-1 text-[#5C6B76]">Último envío: {fechaHora(c.ultimo_envio_ts)} · {c.ultimo_envio}</p>}
      </section>
    </Pantalla>
  );
}
