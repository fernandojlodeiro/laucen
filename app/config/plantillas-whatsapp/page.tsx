// Configuración › Plantillas de WhatsApp (Fer, 25/10): las plantillas que usa Laucen para escribirle a un
// cliente fuera de las 24 h, con su texto, el botón para mandarlas a Meta y el estado de cada una
// (aprobada, en revisión, rechazada). Abajo, las otras plantillas que tenga la cuenta, sólo para ver.

import { PRIMARIO, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, TituloSeccion, Estado, CAJA, CAJA_TABLA, TABLA, THEAD, TH, TR, TD } from "@/app/componentes/erp";
import { BotonEnviar } from "@/app/radar/Cliente";
import { PLANTILLAS, cuerpoDe, botonDe, estadoLegible, motivoRechazoLegible } from "@/lib/mensajes/plantillas";
import { contextoDe } from "@/lib/mensajes/plantillas-cuenta";
import type { PlantillaMeta } from "@/lib/mensajes/meta";
import { accionMandarPlantilla } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

export default async function PlantillasWhatsapp({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("empresa_config");
  const sp = await searchParams;
  const { credencialDeOrg } = await import("@/lib/mensajes/chats");
  const cred = await credencialDeOrg(s.org.id);
  let enMeta: PlantillaMeta[] = [];
  let sinLeer = false;
  if (cred) {
    const { listarPlantillas } = await import("@/lib/mensajes/meta");
    try { enMeta = await listarPlantillas(cred.wabaId, cred.token); } catch { sinLeer = true; }
  }
  const ctx = await contextoDe(s.org.id);
  const nuestras = new Set(PLANTILLAS.map((p) => p.nombre));
  const otras = enMeta.filter((m) => !nuestras.has(m.nombre));

  return (
    <Pantalla titulo="Plantillas de WhatsApp" subtitulo="Los mensajes que Laucen le manda a un cliente que no escribió en las últimas 24 horas. Meta tiene que aprobar cada uno antes de que salga.">
      <Avisos sp={sp} />
      {!cred && <p role="alert" className="mb-3 rounded-lg px-3 py-2 bg-[#FDE7B0] text-[#3D2600] border border-[#C98A00]">No hay una línea de WhatsApp conectada: conectala en Mensajes para poder mandar las plantillas.</p>}
      {sinLeer && <p role="alert" className="mb-3 rounded-lg px-3 py-2 bg-[#FDE7B0] text-[#3D2600] border border-[#C98A00]">No se pudo leer el estado de las plantillas en Meta. Probá de nuevo en un rato.</p>}

      <TituloSeccion titulo="Las de Laucen" />
      <div className="grid gap-2 mb-6">
        {PLANTILLAS.map((p) => {
          const m = enMeta.find((x) => x.nombre === p.nombre) ?? null;
          const e = estadoLegible(sinLeer ? "?" : m?.estado ?? null);
          const boton = botonDe(p, ctx);
          const mandar = cred && !sinLeer && (!m || m.estado === "REJECTED" || m.estado === "PAUSED");
          return (
            <div key={p.nombre} className={CAJA}>
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm">{p.titulo}</b>
                {!sinLeer && <Estado texto={e.texto} tono={e.tono} />}
                {m?.categoria === "MARKETING" && <Estado texto="Meta la pasó a publicidad" tono="naranja" />}
                <span className="text-[11px] text-[#5C6B76]">{p.cuando}</span>
                {mandar && (
                  <form action={accionMandarPlantilla} className="ml-auto">
                    <input type="hidden" name="nombre" value={p.nombre} />
                    <BotonEnviar clase={m ? SUAVE : PRIMARIO} corriendo="Mandando…">{m ? "Volver a mandar a Meta" : "Mandar a Meta"}</BotonEnviar>
                  </form>
                )}
              </div>
              <p className="mt-2 text-xs whitespace-pre-wrap rounded-lg bg-[#F7F9FB] border border-[#E3E9F0] px-2 py-1.5">
                {cuerpoDe(p, ctx).replace("{{1}}", "Juan").replace("{{2}}", p.nombre === "factura_emitida" ? "Factura B 00003-00000123" : "150420").replace("{{3}}", "el martes 28/10")}
                {boton && <span className="block mt-1 font-semibold text-[#16577F]">[ {boton} ]</span>}
              </p>
              {m?.estado === "REJECTED" && (
                <p className="mt-1 text-[11px] text-[#C03420]">Motivo: {motivoRechazoLegible(m.motivoRechazo)}. Si querés, cambiamos el texto y la volvés a mandar.</p>
              )}
            </div>
          );
        })}
      </div>

      {otras.length > 0 && (
        <>
          <TituloSeccion titulo="Otras plantillas de la cuenta" />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Nombre</th><th className={TH}>Estado</th><th className={TH}>Texto</th></tr></thead>
              <tbody>
                {otras.map((m) => {
                  const e = estadoLegible(m.estado);
                  return (
                    <tr key={m.id} className={TR}>
                      <td className={`${TD} font-mono whitespace-nowrap`}>{m.nombre}</td>
                      <td className={TD}><Estado texto={e.texto} tono={e.tono} /></td>
                      <td className={`${TD} text-[#5C6B76]`}>{m.cuerpo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Pantalla>
  );
}
