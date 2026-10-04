// Facturación electrónica (ARCA): conectar Laucen con ARCA para emitir
// facturas. Copia la experiencia de CadaMes: la clave privada la genera el
// servidor y no sale de ahí; la persona baja el archivo del trámite, lo lleva
// a ARCA con su clave fiscal y trae el permiso (certificado) que le dan.
//
// En pantalla no se dice "homologación" ni "producción": producción es
// "Facturación real" y homologación, "Prueba contra ARCA" (que es otro
// trámite, en WSASS, y va escondido en "Sólo para pruebas").

import Link from "next/link";
import { una } from "@/lib/erp/base";
import { emisorDe, emisoresDe, type Emisor } from "@/lib/arca/facturar";
import { estadoCredencial, type Ambiente } from "@/lib/arca/credenciales";
import { cuitLegible } from "@/lib/cuit";
import { ESTADOS_PEDIDO } from "@/lib/pedidos";
import { PRIMARIO, SUAVE, BORRAR, APAGAR, DESPLEGABLE_CHICO } from "@/app/botones";
import { BotonEnviar, BotonConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import { entrarErp, Pantalla, Avisos, Estado, Dato, BotonesFicha, editandoFicha, CAMPO, ETIQUETA, CAJA } from "@/app/componentes/erp";
import {
  accionPrepararTramite, accionConectar, accionDesconectar, accionFacturarAutomatico, accionFacturarAl, accionProbarConexion,
} from "./acciones";
import SubirCertificado from "./SubirCertificado";

export const dynamic = "force-dynamic";

type SP = { rs?: string; editar?: string; ok?: string; error?: string };

const MODO: Record<Ambiente, string> = { produccion: "Facturación real", homologacion: "Prueba contra ARCA" };
const fechaAR = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

export default async function ConfigArca({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("facturacion_ver");
  const sp = await searchParams;
  const razones = await emisoresDe(s.org.id);
  const e = await emisorDe(s.org.id, Number(sp.rs) || null);
  const rs = e?.id ?? 0;
  const cred = e ? await estadoCredencial(e.id, e.ambiente) : null;
  const conectado = !!e && !!cred?.tiene_certificado;
  // El trámite empezado (pedido generado, falta el certificado), si lo hay:
  // el más reciente, de cualquier ambiente.
  const pend = await una<{ ambiente: Ambiente }>(
    "select ambiente from arca_credencial where emisor_id = $1 and certificado is null order by actualizado_ts desc limit 1", [rs]);
  const pedido = pend && e ? { ambiente: pend.ambiente, cuit: e.cuit, razon: e.razon_social } : null;

  const vence = cred?.cert_vence ? new Date(cred.cert_vence) : null;
  const vencido = vence ? vence.getTime() < Date.now() : false;
  const porVencer = vence ? vence.getTime() < Date.now() + 30 * 864e5 : false;
  const estadoAl = e ? ESTADOS_PEDIDO[e.facturar_al as keyof typeof ESTADOS_PEDIDO] ?? e.facturar_al : "";

  return (
    <Pantalla titulo="Facturación electrónica (ARCA)" ancho="max-w-3xl"
      subtitulo={<>Para emitir facturas a tu nombre desde Laucen · <Link href="/administracion/facturacion" className="text-[#16577F] hover:underline">Ver facturas</Link></>}>
      <Avisos sp={sp} />

      {/* Cada razón social tiene su permiso de ARCA: se elige a cuál se refiere esta pantalla. */}
      {razones.length > 1 && e && (
        <div className="flex flex-wrap gap-1 mb-3 text-xs" role="tablist" aria-label="Razón social">
          {razones.map((x) => (
            <Link key={x.id} href={`/config/arca?rs=${x.id}`} role="tab" aria-selected={x.id === e.id}
              className={`px-3 py-1.5 rounded-t-lg border border-[#E3E9F0] ${x.id === e.id ? "bg-white font-semibold text-[#16577F] border-b-white" : "bg-[#EEF3F8] text-[#5C6B76] hover:text-[#16577F]"}`}>
              {x.nombre ?? x.razon_social}
            </Link>
          ))}
        </div>
      )}

      <section className={CAJA}>
        {conectado && e ? (
          <>
            <div className={`text-xs rounded-lg px-3 py-2 mb-3 ${vencido ? "bg-[#FDF1EF] text-[#C03420]" : "bg-[#EEF7F1] text-[#1F6E4A]"}`}>
              {vencido ? "El permiso de ARCA venció: hay que hacer el trámite de nuevo." : `Conectado como ${e.razon_social}.`}
              {e.ambiente === "homologacion" && !vencido && " Estás probando contra ARCA: los comprobantes salen pero no valen."}
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-[#5C6B76] mb-3">
              <div className="flex justify-between"><dt>CUIT</dt><dd className="text-[#0F1F2A]">{cuitLegible(e.cuit)}</dd></div>
              <div className="flex justify-between"><dt>Punto de venta</dt><dd className="text-[#0F1F2A] tabular-nums">{e.punto_venta}</dd></div>
              <div className="flex justify-between"><dt>Modo</dt><dd className="text-[#0F1F2A]">{MODO[e.ambiente]}</dd></div>
              <div className="flex justify-between items-center"><dt>El permiso vence</dt>
                <dd className="text-[#0F1F2A] flex items-center gap-1">
                  {vence ? fechaAR(vence) : "—"}
                  {vencido ? <Estado texto="Vencido" tono="rojo" /> : porVencer ? <Estado texto="Por vencer" tono="amarillo" /> : null}
                </dd></div>
            </dl>

            <form action={accionProbarConexion} className="mb-4">
              <input type="hidden" name="rs" value={rs} />
              <BotonEnviar clase={SUAVE} corriendo="Preguntando a ARCA…">Probar conexión con ARCA</BotonEnviar>
            </form>

            <div className="border-t border-[#E3E9F0] pt-3 mb-3 grid gap-3">
              <Interruptor accion={accionFacturarAutomatico} prendido={e.facturar_automatico} campos={{ rs: String(rs) }}
                etiqueta="Facturar automáticamente"
                ayuda={`Factura sola cada pedido que llega a "${estadoAl}". Al prenderla, los pedidos que ya habían pasado no se facturan: sólo los que lleguen de ahora en adelante.`} />
              {/* Se ve; el lápiz lo vuelve editable (?editar=facturar) y "Grabar" queda a su derecha. */}
              <div className="flex flex-wrap items-end justify-between gap-2">
                {editandoFicha(sp, "facturar") ? (
                  <form id="ficha-facturar" action={accionFacturarAl}>
                    <input type="hidden" name="rs" value={rs} />
                    <label><span className={ETIQUETA}>Facturar al llegar el pedido a</span>
                      <select name="facturar_al" defaultValue={e.facturar_al} className={CAMPO} autoFocus>
                        {(["pagado", "preparado", "despachado"] as const).map((k) => <option key={k} value={k}>{ESTADOS_PEDIDO[k]}</option>)}
                      </select></label>
                  </form>
                ) : <Dato etiqueta="Facturar al llegar el pedido a">{estadoAl}</Dato>}
                <span className="inline-flex gap-2">
                  <BotonesFicha editando={editandoFicha(sp, "facturar")} ver={`/config/arca?rs=${rs}`} editar={`/config/arca?rs=${rs}&editar=facturar`} form="ficha-facturar" />
                </span>
              </div>
            </div>

            <details className="group" open={!!pedido}>
              <summary className={DESPLEGABLE_CHICO}>Cambiar o desconectar</summary>
              <div className="mt-3 grid gap-4">
                <Tramite emisor={e} pedido={pedido} conectado rs={rs} />
                <div className="border-t border-[#E3E9F0] pt-3">
                  <BotonConfirmar accion={accionDesconectar} campos={{ rs: String(rs) }} clase={BORRAR} texto="Desconectar ARCA"
                    pregunta="¿Desconectar? Hasta hacer el trámite de nuevo no se puede facturar." corriendo="Desconectando…" />
                </div>
              </div>
            </details>
          </>
        ) : (
          <Tramite emisor={e} pedido={pedido} conectado={false} rs={rs} />
        )}
      </section>

      <p className="text-xs text-[#5C6B76] mt-4">
        El CUIT, la condición frente al IVA, el domicilio y Ingresos Brutos de cada razón social se cargan en{" "}
        <Link href="/config/razones-sociales" className="font-bold underline">Razones sociales</Link>; el logo de las facturas, en{" "}
        <Link href="/config/empresa" className="font-bold underline">Empresa</Link>.
      </p>
    </Pantalla>
  );
}

/** El trámite de ARCA, en tres pasos. Sin trámite empezado, el formulario
 *  para empezarlo; con uno empezado, los pasos y "Empezar de nuevo". */
function Tramite({ emisor, pedido, conectado, rs }: {
  rs: number;
  emisor: Emisor | null;
  pedido: { ambiente: Ambiente; cuit: string; razon: string } | null;
  conectado: boolean;
}) {
  const paso = "flex gap-3 items-start";
  const numero = "shrink-0 w-6 h-6 rounded-full bg-[#16577F] text-white text-xs font-bold grid place-items-center mt-0.5";

  if (!pedido) {
    return (
      <div>
        <div className="text-xs font-semibold text-[#16577F] mb-1">{conectado ? "Hacer el trámite de nuevo" : "Conectar con ARCA"}</div>
        <p className="text-xs text-[#5C6B76] mb-3">
          {conectado
            ? "Si cambió el CUIT o el punto de venta, o el permiso está por vencer, se hace otro trámite. El actual sigue andando hasta que conectes el nuevo."
            : "Para facturar a tu nombre hace falta un permiso de ARCA. Lo tramitás vos en el sitio de ARCA —te va a pedir tu clave fiscal— y son tres pasos. Laucen te prepara el archivo que hay que llevar."}
        </p>
        <FormTramite emisor={emisor} boton="Preparar el trámite en ARCA" />
      </div>
    );
  }

  const prueba = pedido.ambiente === "homologacion";
  return (
    <div className="grid gap-4">
      <div className="text-xs rounded-lg px-3 py-2 bg-[#FFF8E5] text-[#8a6100]">
        El trámite{prueba ? " de prueba contra ARCA" : ""} está empezado, a nombre de <b>{pedido.razon}</b> (CUIT {cuitLegible(pedido.cuit)}).
        Faltan estos tres pasos, que se hacen una sola vez.
      </div>

      <div className={paso}>
        <span className={numero}>1</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Bajá el archivo del trámite</div>
          <p className="text-xs text-[#5C6B76] mt-0.5 mb-2">Es el pedido que ARCA necesita para darte el permiso. No tiene nada secreto.</p>
          <a href={`/config/arca/csr?ambiente=${pedido.ambiente}&rs=${rs}`} download className={SUAVE}>Bajar el archivo</a>
        </div>
      </div>

      <div className={paso}>
        <span className={numero}>2</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Llevalo a ARCA y traé el permiso</div>
          {prueba ? (
            <ol className="list-disc pl-4 text-xs text-[#5C6B76] mt-0.5 grid gap-0.5">
              <li>Entrá a ARCA con tu clave fiscal y abrí <b>WSASS – Autogestión Certificados Homologación</b> (si no aparece, adherilo en el Administrador de Relaciones).</li>
              <li>Nuevo certificado: poné un nombre (ej. laucen), pegá el contenido del archivo y guardá el certificado que te da.</li>
              <li>En WSASS, &quot;Crear autorización a servicio&quot;: autorizá ese certificado para <b>wsfe</b> y para <b>ws_sr_constancia_inscripcion</b>.</li>
            </ol>
          ) : (
            <ol className="list-disc pl-4 text-xs text-[#5C6B76] mt-0.5 grid gap-0.5">
              <li>Entrá a ARCA con tu clave fiscal y abrí <b>Administración de Certificados Digitales</b>.</li>
              <li>Agregá un alias (ej. laucen), subí el archivo que bajaste y guardá el que te devuelven.</li>
              <li>En <b>Administrador de Relaciones de Clave Fiscal</b> → Nueva relación, autorizá ese alias para los servicios <b>Facturación electrónica</b> (wsfe) y <b>Consulta de constancia de inscripción</b> (ws_sr_constancia_inscripcion). Sin eso el permiso existe pero no puede facturar.</li>
              <li>El punto de venta tiene que estar dado de alta en <b>Administración de puntos de venta</b> como &quot;Factura electrónica – Web services&quot;.</li>
            </ol>
          )}
        </div>
      </div>

      <div className={paso}>
        <span className={numero}>3</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold mb-2">Subí acá lo que te dio ARCA</div>
          <SubirCertificado accion={accionConectar} ambiente={pedido.ambiente} rs={rs} />
        </div>
      </div>

      {/* Volver a empezar tiene que estar a mano: si se perdió el archivo o el
          CUIT quedó mal, el camino es generar otro, no quedarse trabado. */}
      <details className="group">
        <summary className={DESPLEGABLE_CHICO}>Empezar el trámite de nuevo</summary>
        <p className="text-xs text-[#5C6B76] mt-2 mb-2">
          Genera un archivo nuevo y descarta el anterior. Si ya hiciste el trámite con el viejo, el permiso que te dieron deja de servir y hay que hacerlo otra vez.
          {conectado && " Si el trámite nuevo es del mismo modo en que estás conectado, la conexión actual se corta hasta que conectes el nuevo."}
        </p>
        <FormTramite emisor={emisor} boton="Generar otro" />
      </details>
    </div>
  );
}

/** Los datos de la razón social (de Configuración → Razones sociales, sólo
 *  lectura) y el botón del trámite de facturación real. El de prueba contra
 *  ARCA es el mismo formulario con otro botón, escondido en "Sólo para pruebas". */
function FormTramite({ emisor, boton }: { emisor: Emisor | null; boton: string }) {
  if (!emisor) {
    return <p className="text-xs text-[#C03420]">Primero cargá la razón social (CUIT, condición de IVA y punto de venta) en <Link href="/config/razones-sociales" className="font-bold underline">Razones sociales</Link>.</p>;
  }
  return (
    <form action={accionPrepararTramite} className="grid gap-3">
      <input type="hidden" name="rs" value={emisor.id} />
      <div className="grid sm:grid-cols-4 gap-3 items-start">
        <Dato etiqueta="Razón social" className="sm:col-span-2">{emisor.razon_social}</Dato>
        <Dato etiqueta="CUIT con el que facturás">{cuitLegible(emisor.cuit)}</Dato>
        <Dato etiqueta="Punto de venta" numero>{String(emisor.punto_venta)}</Dato>
      </div>
      <p className="text-[11px] text-[#5C6B76] -mt-1">Si algo no está bien, corregilo en <Link href="/config/razones-sociales" className="font-bold underline">Razones sociales</Link> antes de seguir.</p>
      {/* El primer botón es el que dispara Enter: el trámite de facturación real. */}
      <div><button name="ambiente" value="produccion" className={PRIMARIO}>{boton}</button></div>
      <details>
        <summary className="text-[11px] text-[#5C6B76] cursor-pointer w-fit">Sólo para pruebas</summary>
        <div className="mt-2 border border-dashed border-[#E3E9F0] rounded-lg p-2">
          <p className="text-[11px] text-[#5C6B76] mb-2">
            Para probar el circuito contra ARCA sin que las facturas valgan. Es otro trámite, en otro sitio de ARCA (WSASS), y su permiso no sirve para facturar de verdad.
          </p>
          <button name="ambiente" value="homologacion" className={APAGAR}>Preparar trámite de prueba contra ARCA</button>
        </div>
      </details>
    </form>
  );
}
