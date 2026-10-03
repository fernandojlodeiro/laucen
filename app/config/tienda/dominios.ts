"use server";

// Dominios propios de la tienda (bitácora #281): alta, verificar y borrar.
// Cada alta se agrega al proyecto de Vercel por API (lib/tienda/vercel.ts); si
// todavía no hay llave de Vercel, queda anotado ("sin conectar") y se conecta
// con "Verificar" cuando esté. Permiso «Configurar dominios de la tienda».

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, id } from "@/lib/erp/acciones";
import { tienePermiso } from "@/lib/permisos";
import { esDelSistema, normalizarDominio } from "@/lib/tienda/dominios";
import { olvidarDominios } from "@/lib/tienda/dominios-tienda";
import { agregarEnVercel, quitarDeVercel, estadoEnVercel, tieneCertificado, hayLlaveVercel } from "@/lib/tienda/vercel";

const VOLVER = "/config/tienda";

async function entrar() {
  const s = await entrarErp("tienda_config");
  if (!tienePermiso(s.permisos, "tienda_dominios")) throw new ErrorErp("No tenés permiso para configurar los dominios de la tienda.");
  return s;
}

type Fila = { id: number; dominio: string; principal: boolean; canal_id: number; principal_de: string | null };

const filaDe = (org: string, domId: number) => una<Fila>(`
  select d.id::int, d.dominio, d.principal, d.canal_id::int,
         (select p.dominio from tienda_dominio p where p.canal_id = d.canal_id and p.principal) principal_de
    from tienda_dominio d where d.id = $1 and d.organizacion_id = $2`, [domId, org]);

/** Pregunta a Vercel cómo está y lo guarda: registros DNS que faltan y estado. */
async function revisar(f: Fila, agregado = false): Promise<string> {
  const v = await estadoEnVercel(f.dominio);
  if (!v.existe) {
    if (agregado) throw new ErrorErp("Vercel no lo muestra en el proyecto todavía.");
    await agregarEnVercel(f.dominio, f.principal ? null : f.principal_de);
    return revisar(f, true);
  }
  const estado = !v.verificado || !v.dnsBien ? "esperando_dns" : (await tieneCertificado(f.dominio)) ? "con_certificado" : "verificado";
  await consulta("update tienda_dominio set estado = $2, dns = $3::jsonb, detalle = null, revisado_ts = now() where id = $1",
    [f.id, estado, JSON.stringify(v.registros)]);
  olvidarDominios();
  return estado;
}

const TEXTO_ESTADO: Record<string, string> = {
  esperando_dns: "Todavía espera el DNS: cargá los registros que se ven abajo (puede tardar unas horas en propagarse).",
  verificado: "El DNS está bien. Falta que Vercel emita el certificado (unos minutos).",
  con_certificado: "Listo: el dominio ya abre la tienda.",
};

export async function accionNuevoDominio(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    await entrar();
    const canalId = id(fd, "canal_id");
    const canal = await una("select 1 from canal where id = $1 and organizacion_id = $2 and tipo = 'web_minorista' and estado <> 'archivado'", [canalId, s.org.id]);
    if (!canal) throw new ErrorErp("La tienda no existe.");
    const dominio = normalizarDominio(texto(fd, "dominio") ?? "");
    if (!dominio) throw new ErrorErp("Escribí un dominio válido, sin https:// (ej. mitienda.com.ar).");
    if (esDelSistema(dominio)) throw new ErrorErp("Ese dominio es del sistema: no se puede usar para una tienda.");
    const ya = await una<{ organizacion_id: string }>("select organizacion_id from tienda_dominio where dominio = $1", [dominio]);
    if (ya) throw new ErrorErp(ya.organizacion_id === s.org.id ? "Ese dominio ya está cargado." : "Ese dominio ya lo usa otra organización.");

    const principal = texto(fd, "tipo") !== "redirige";
    const actual = await una<{ dominio: string }>("select dominio from tienda_dominio where canal_id = $1 and principal", [canalId]);
    if (principal && actual) throw new ErrorErp(`La tienda ya tiene dominio principal (${actual.dominio}). Para cambiarlo, borralo primero.`);
    if (!principal && !actual) throw new ErrorErp("Primero cargá el dominio principal de la tienda: los demás redirigen a él.");

    const nuevo = await una<{ id: number }>(`insert into tienda_dominio (organizacion_id, canal_id, dominio, principal)
                                             values ($1, $2, $3, $4) returning id::int`, [s.org.id, canalId, dominio, principal]);
    olvidarDominios();
    revalidatePath(VOLVER);
    if (!hayLlaveVercel()) return `${dominio} quedó anotado, pero falta la llave de Vercel para conectarlo. Cuando esté, apretá "Verificar".`;
    try {
      const f = (await filaDe(s.org.id, nuevo!.id))!;
      // Si ya estaba en Vercel (los cargados a mano), se toma como está y se le acomoda la redirección.
      await agregarEnVercel(f.dominio, f.principal ? null : f.principal_de);
      const estado = await revisar(f, true);
      return `${dominio} agregado. ${TEXTO_ESTADO[estado]}`;
    } catch (e) {
      const motivo = e instanceof ErrorErp ? e.message : "Vercel no respondió.";
      await consulta("update tienda_dominio set detalle = $2, revisado_ts = now() where id = $1", [nuevo!.id, motivo]);
      return `${dominio} quedó anotado, pero no se pudo conectar: ${motivo} Probá con "Verificar".`;
    }
  });
}

export async function accionVerificarDominio(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    await entrar();
    const f = await filaDe(s.org.id, id(fd, "id"));
    if (!f) throw new ErrorErp("El dominio no existe.");
    const estado = await revisar(f);
    revalidatePath(VOLVER);
    return `${f.dominio}: ${TEXTO_ESTADO[estado]}`;
  });
}

export async function accionBorrarDominio(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    await entrar();
    const f = await filaDe(s.org.id, id(fd, "id"));
    if (!f) throw new ErrorErp("El dominio no existe.");
    if (f.principal) {
      const otros = await una("select 1 from tienda_dominio where canal_id = $1 and not principal", [f.canal_id]);
      if (otros) throw new ErrorErp("Primero borrá los dominios que redirigen a éste.");
    }
    if (hayLlaveVercel()) await quitarDeVercel(f.dominio);
    await consulta("delete from tienda_dominio where id = $1 and organizacion_id = $2", [f.id, s.org.id]);
    olvidarDominios();
    revalidatePath(VOLVER);
    return hayLlaveVercel() ? `${f.dominio} borrado (también de Vercel).` : `${f.dominio} borrado. Falta la llave de Vercel: sacalo también de Vercel.`;
  });
}
