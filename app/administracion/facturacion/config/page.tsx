// Configuración de facturación: los datos fiscales de quien factura, la
// facturación automática y el certificado de ARCA del ambiente elegido.

import Link from "next/link";
import { emisorDe } from "@/lib/arca/facturar";
import { estadoCredencial } from "@/lib/arca/credenciales";
import { ESTADOS_PEDIDO } from "@/lib/pedidos";
import { VERDE, SUAVE, PRIMARIO, APAGAR } from "@/app/botones";
import { BotonEnviar, BotonConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, Estado, CAMPO, ETIQUETA, CAJA } from "@/app/componentes/erp";
import {
  accionGuardarEmisor, accionFacturarAutomatico, accionGenerarCsr, accionGuardarCertificado, accionProbarConexion,
} from "./acciones";
import SubirCertificado from "./SubirCertificado";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const AYUDA = "block text-[10px] text-[#5C6B76] mt-0.5";
const fechaAR = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

export default async function ConfigFacturacion({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("facturacion_ver");
  const sp = await searchParams;
  const e = await emisorDe(s.org.id);
  const ambiente = e?.ambiente ?? "homologacion";
  const cred = e ? await estadoCredencial(s.org.id, ambiente) : null;
  const vencido = cred?.cert_vence ? new Date(cred.cert_vence).getTime() < Date.now() : false;
  const porVencer = cred?.cert_vence ? new Date(cred.cert_vence).getTime() < Date.now() + 30 * 864e5 : false;
  const nombreAmbiente = ambiente === "produccion" ? "Producción" : "Homologación";

  return (
    <Pantalla titulo="Configuración de facturación" ancho="max-w-4xl"
      subtitulo={<><Link href="/administracion/facturacion" className="text-[#16577F] hover:underline">← Facturación</Link> · factura electrónica de ARCA</>}>
      <Avisos sp={sp} />

      <h2 className="text-sm font-bold mb-2">Datos del emisor</h2>
      <form action={accionGuardarEmisor} className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-4`}>
        <label><span className={ETIQUETA}>CUIT</span>
          <input name="cuit" defaultValue={e?.cuit ?? ""} placeholder="30-12345678-9" className={`${CAMPO} w-full`} /></label>
        <label className="sm:col-span-2"><span className={ETIQUETA}>Razón social</span>
          <input name="razon_social" defaultValue={e?.razon_social ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Condición IVA</span>
          <select name="condicion_iva" defaultValue={e?.condicion_iva ?? "responsable_inscripto"} className={`${CAMPO} w-full`}>
            <option value="responsable_inscripto">Responsable inscripto</option>
            <option value="monotributo">Monotributo</option>
            <option value="exento">Exento</option>
          </select>
          <span className={AYUDA}>Responsable inscripto factura A y B; los demás, C.</span></label>
        <label className="sm:col-span-2"><span className={ETIQUETA}>Domicilio comercial</span>
          <input name="domicilio" defaultValue={e?.domicilio ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Ingresos Brutos</span>
          <input name="iibb" defaultValue={e?.iibb ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Inicio de actividades</span>
          <input type="date" name="inicio_actividades" defaultValue={e?.inicio_actividades ?? ""} className={`${CAMPO} w-full`} /></label>
        <label><span className={ETIQUETA}>Punto de venta</span>
          <CampoNumero name="punto_venta" valor={e?.punto_venta ?? 1} tipo="entero" className={`${CAMPO} w-full`} />
          <span className={AYUDA}>Tiene que estar habilitado en ARCA para &quot;Factura electrónica – Web services&quot;.</span></label>
        <label><span className={ETIQUETA}>Ambiente</span>
          <select name="ambiente" defaultValue={ambiente} className={`${CAMPO} w-full`}>
            <option value="homologacion">Homologación (pruebas, sin validez fiscal)</option>
            <option value="produccion">Producción (facturas de verdad)</option>
          </select>
          <span className={AYUDA}>Cada ambiente lleva su propio certificado.</span></label>
        <label><span className={ETIQUETA}>Facturar al llegar el pedido a</span>
          <select name="facturar_al" defaultValue={e?.facturar_al ?? "preparado"} className={`${CAMPO} w-full`}>
            {(["pagado", "preparado", "despachado"] as const).map((k) => <option key={k} value={k}>{ESTADOS_PEDIDO[k]}</option>)}
          </select>
          <span className={AYUDA}>Sólo cuenta si la facturación automática está prendida.</span></label>
        <div className="sm:col-span-3"><button className={VERDE}>Guardar</button></div>
      </form>

      <div className={`${CAJA} mb-4`}>
        <Interruptor accion={accionFacturarAutomatico} prendido={!!e?.facturar_automatico} campos={{}} deshabilitado={!e}
          etiqueta="Facturar automáticamente"
          ayuda={e
            ? `Factura sola cada pedido que llega a "${ESTADOS_PEDIDO[e.facturar_al as keyof typeof ESTADOS_PEDIDO] ?? e.facturar_al}". Al prenderla, los pedidos que ya habían pasado no se facturan: sólo los que lleguen de ahora en adelante.`
            : "Primero guardá los datos del emisor."} />
      </div>

      <h2 className="text-sm font-bold mb-2">Certificado de ARCA · {nombreAmbiente}</h2>
      <div className={`${CAJA} grid gap-3`}>
        {!e && <p className="text-xs text-[#5C6B76]">Primero guardá los datos del emisor: el pedido de certificado lleva el CUIT y la razón social.</p>}

        {e && !cred && (
          <>
            <p className="text-xs">Todavía no hay certificado para {nombreAmbiente.toLowerCase()}. El primer paso es generar el pedido (CSR) que se sube en ARCA.</p>
            <form action={accionGenerarCsr}>
              <BotonEnviar clase={PRIMARIO} corriendo="Generando… (tarda unos segundos)">Generar pedido de certificado (CSR)</BotonEnviar>
            </form>
          </>
        )}

        {e && cred && !cred.tiene_certificado && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs"><Estado texto="Falta el certificado" tono="amarillo" /> El pedido (CSR) ya está generado.</span>
              <a href={`/administracion/facturacion/config/csr?ambiente=${ambiente}`} className={SUAVE}>Bajar laucen-{ambiente}.csr</a>
            </div>
            <textarea readOnly value={cred.csr} rows={6} aria-label="Pedido de certificado (CSR)"
              className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-[11px] bg-[#FAFBFC] font-mono w-full" />
            <Pasos ambiente={ambiente} />
            <div>
              <span className={ETIQUETA}>Certificado que dio ARCA</span>
              <SubirCertificado accion={accionGuardarCertificado} />
            </div>
            <div className="border-t border-[#E3E9F0] pt-2">
              <BotonConfirmar accion={accionGenerarCsr} campos={{}} clase={SUAVE} texto="Generar otro pedido"
                pregunta="¿Generar otro? El anterior deja de servir." corriendo="Generando…" />
            </div>
          </>
        )}

        {e && cred?.tiene_certificado && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {vencido ? <Estado texto="Vencido" tono="rojo" /> : porVencer ? <Estado texto="Por vencer" tono="amarillo" /> : <Estado texto="Cargado" tono="verde" />}
              <span>Vale hasta el <b>{cred.cert_vence ? fechaAR(new Date(cred.cert_vence)) : "—"}</b>.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form action={accionProbarConexion}>
                <BotonEnviar clase={PRIMARIO} corriendo="Preguntando a ARCA…">Probar conexión con ARCA</BotonEnviar>
              </form>
              <BotonConfirmar accion={accionGenerarCsr} campos={{}} clase={APAGAR} texto="Generar otro pedido"
                pregunta="¿Seguro? Reemplaza el certificado actual hasta que cargues el nuevo." corriendo="Generando…" />
            </div>
          </>
        )}
      </div>
    </Pantalla>
  );
}

/** Los pasos en ARCA para convertir el CSR en certificado. */
function Pasos({ ambiente }: { ambiente: "homologacion" | "produccion" }) {
  const pasos = ambiente === "homologacion" ? [
    "Entrá a ARCA con clave fiscal y abrí \"WSASS – Autogestión Certificados Homologación\" (si no aparece, adherilo en el Administrador de Relaciones).",
    "Nuevo certificado: poné un nombre (ej. laucen) y pegá el CSR de arriba. Copiá el certificado que te da y pegalo abajo.",
    "En WSASS, \"Crear autorización a servicio\": autorizá ese certificado para \"wsfe\" y para \"ws_sr_constancia_inscripcion\".",
  ] : [
    "Entrá a ARCA con clave fiscal y abrí \"Administración de Certificados Digitales\".",
    "Agregá un alias (ej. laucen), subí el archivo .csr y bajá el certificado. Subilo o pegalo abajo.",
    "Abrí \"Administrador de Relaciones de Clave Fiscal\" → Nueva relación: elegí los servicios \"Facturación electrónica\" (wsfe) y \"Consulta de constancia de inscripción\", y como representante, ese certificado (el alias).",
  ];
  return (
    <ol className="list-decimal pl-5 text-xs grid gap-1">
      {pasos.map((p, i) => <li key={i}>{p}</li>)}
    </ol>
  );
}
