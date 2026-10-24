// Configuración › Google Drive (Fer, 23/10): conectar el Google Drive de la organización y decir, por razón social,
// dónde van los archivos de cada mes dentro del árbol de carpetas que ya se usa con el contador (se pega la ruta de un
// mes cualquiera: año › mes › carpeta). Después, desde Libros de IVA, «Mandar al Drive» deja ahí los TXT del Libro de
// IVA Digital. La conexión y las subidas: lib/google/drive.ts; la ruta: lib/google/ruta.ts.

import Link from "next/link";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonConfirmar, BotonEnviar, TachoConfirmar } from "@/app/radar/Cliente";
import { carpetasFacturas } from "@/lib/compras/drive-facturas";
import { entrarErp, Pantalla, Avisos, Dato, TituloSeccion, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { sosVos } from "@/lib/admin";
import { emisoresDe } from "@/lib/arca/facturar";
import { nombreRs } from "@/lib/razon-social";
import { hoyArgentina } from "@/lib/rango-fechas";
import { appGoogle, conexionDrive, rutasDe } from "@/lib/google/drive";
import { rutaDeMes } from "@/lib/google/ruta";
import { accionRutaDrive, accionDesconectarDrive, accionAgregarCarpetaFacturas, accionQuitarCarpetaFacturas } from "./acciones";

export const dynamic = "force-dynamic";

const fechaHora = (t: string | null) => (t ? new Date(t).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }) : null);

export default async function GoogleDrive({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("empresa_config");
  const sp = await searchParams;
  const [app, c, esDueno, rutas, razones, carpetas] = await Promise.all([appGoogle(), conexionDrive(s.org.id), sosVos(), rutasDe(s.org.id), emisoresDe(s.org.id), carpetasFacturas(s.org.id)]);
  const [año, mes] = hoyArgentina().slice(0, 7).split("-").map(Number);
  const listo = c.conectado && !c.permiso_viejo;
  return (
    <Pantalla titulo="Google Drive" ancho="max-w-3xl"
      subtitulo="Dónde deja Laucen los archivos de cada mes (los TXT del Libro de IVA Digital) en el árbol de carpetas que compartís con el contador">
      <Avisos sp={sp} />

      <section className={`${CAJA} mb-4 text-xs`}>
        <TituloSeccion titulo="1. Conexión">
          {c.conectado && !c.permiso_viejo && <BotonConfirmar accion={accionDesconectarDrive} campos={{}} clase={SUAVE} texto="Desconectar" pregunta="¿Desconectar Google Drive?" corriendo="Desconectando…" />}
          {app && (!c.conectado || c.permiso_viejo) && <a href="/config/google-drive/conectar" className={PRIMARIO}>{c.conectado ? "Volver a conectar" : "Conectar Google Drive"}</a>}
        </TituloSeccion>
        {c.conectado && (
          <div className="grid sm:grid-cols-2 gap-3 mb-2">
            <Dato etiqueta="Cuenta de Google">{c.cuenta_email}</Dato>
            <Dato etiqueta="Conectada el">{fechaHora(c.conectado_ts)}</Dato>
          </div>
        )}
        {c.conectado && c.permiso_viejo && (
          <p className="rounded-lg px-3 py-2 bg-[#FFF8E5] text-[#8a6100]">Esta conexión es del permiso anterior (sólo lo que crea Laucen) y no alcanza para usar tus carpetas. Apretá <b>Volver a conectar</b>, arriba a la derecha de este recuadro.</p>
        )}
        {!app ? (
          <p className="rounded-lg px-3 py-2 bg-[#FFF8E5] text-[#8a6100]">
            Falta cargar la aplicación de Google de Laucen (se hace una sola vez).{" "}
            {esDueno ? <Link href="/admin/google" className="underline">Cargala acá</Link> : "La carga el administrador del sistema."}
          </p>
        ) : !listo && (
          <p className="mt-1">
            Google te pide entrar con tu cuenta y aprobar el acceso al Drive: <b>tildá la casilla</b> y apretá «Continuar». Como Google no revisa aplicaciones chicas,
            la primera vez puede mostrar «Google no verificó esta app»: entrá en «Configuración avanzada» › «Ir a laucen.com». Laucen sólo recorre el camino que
            cargás abajo; el resto del Drive no lo toca.
          </p>
        )}
      </section>

      <section className={`${CAJA} mb-4 text-xs`}>
        <TituloSeccion titulo="2. Dónde van los TXT de cada mes" />
        {!listo ? <p className="text-[#5C6B76]">Primero conectá Google Drive.</p> : (
          <div className="grid gap-4">
            <p className="text-[#5C6B76]">
              Pegá la ruta de la carpeta de <b>un mes cualquiera</b>, tal como se ve en el Drive (por ejemplo
              <span className="font-mono"> \Mi unidad\Administracion\Impuestos\…\2026\09 Septiembre\IVA DIGITAL</span>). Laucen reconoce la carpeta del año y la del mes
              (la que empieza con su número) y cada mes busca las que correspondan; si todavía no existen, las crea con el mismo formato. La parte de antes del año
              tiene que existir.
            </p>
            {razones.map((r) => {
              const ruta = rutas[String(r.id)];
              return (
                <form key={r.id} action={accionRutaDrive} className="grid gap-1">
                  <input type="hidden" name="emisor" value={r.id} />
                  <label><span className={ETIQUETA}>{nombreRs(r)}</span>
                    <input name="ruta" defaultValue={ruta?.texto ?? ""} placeholder="\Mi unidad\Administracion\…\2026\09 Septiembre\IVA DIGITAL" className={`${CAMPO} w-full font-mono`} /></label>
                  <div className="flex flex-wrap items-center gap-2">
                    <BotonEnviar clase={PRIMARIO} corriendo="Buscando en el Drive…">Grabar</BotonEnviar>
                    {ruta
                      ? <span className="text-[#1F6E4A]">Este mes van a: {rutaDeMes(ruta.segmentos, año, mes)}</span>
                      : <span className="text-[#8a6100]">Sin ruta: no se le pueden mandar archivos.</span>}
                  </div>
                </form>
              );
            })}
          </div>
        )}
      </section>

      <section className={`${CAJA} mb-4 text-xs`}>
        <TituloSeccion titulo="3. Carpetas de facturas de compra" />
        {!listo ? <p className="text-[#5C6B76]">Primero conectá Google Drive.</p> : (
          <div className="grid gap-3">
            <p className="text-[#5C6B76]">
              Las carpetas donde dejás las facturas de gastos y servicios y las de Mercado Libre, ordenadas por año y mes adentro (por ejemplo
              <span className="font-mono"> \Mi unidad\Administracion\Deirolab\Servicios y Gastos Deirolab</span>, que tiene 2026 › 10 Octubre). Desde Compras › Facturas de compra,
              «Buscar facturas en el Drive» las lee y las carga a nombre de la razón social que figura en cada factura. Las subcarpetas del mes (una por cuenta, por ejemplo) también se leen.
            </p>
            {carpetas.length > 0 && (
              <ul className="grid gap-1">
                {carpetas.map((c, i) => (
                  <li key={c.texto} className="flex items-center gap-2">
                    <span className="font-mono">{c.texto}</span>
                    <span className="text-[#1F6E4A]">este mes: {rutaDeMes(c.segmentos, año, mes)}</span>
                    <TachoConfirmar accion={accionQuitarCarpetaFacturas} campos={{ indice: String(i) }} pregunta="¿Quitar esta carpeta?" />
                  </li>
                ))}
              </ul>
            )}
            <form action={accionAgregarCarpetaFacturas} className="flex flex-wrap items-end gap-2">
              <label className="grow"><span className={ETIQUETA}>Sumar una carpeta</span>
                <input name="ruta" required placeholder="\Mi unidad\Administracion\…\Servicios y Gastos" className={`${CAMPO} w-full font-mono`} /></label>
              <BotonEnviar clase={PRIMARIO} corriendo="Buscando en el Drive…">Sumar</BotonEnviar>
            </form>
          </div>
        )}
      </section>

      <section className={`${CAJA} text-xs`}>
        <TituloSeccion titulo="4. Mandar los archivos" />
        <p>En <Link href="/administracion/libros-iva" className="text-[#16577F] hover:underline">Administración › Libros de IVA</Link>, eligiendo el mes y la razón social, en el recuadro «Libro de IVA Digital (ARCA)»: botón <b>Mandar al Drive</b>.</p>
        {c.ultimo_envio_ts && <p className="mt-1 text-[#5C6B76]">Último envío: {fechaHora(c.ultimo_envio_ts)} · {c.ultimo_envio}</p>}
      </section>
    </Pantalla>
  );
}
