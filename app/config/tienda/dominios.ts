"use server";

// Dominios propios de la tienda (bitácora #281): alta, verificar, cambiar (redirige u otra marca) y borrar.
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

// `destino`: a dónde redirige en Vercel (null = abre la tienda: el principal o el de otra marca).
type Fila = { id: number; dominio: string; principal: boolean; canal_id: number; destino: string | null };

const filaDe = (org: string, domId: number) => una<Fila>(`
  select d.id::int, d.dominio, d.principal, d.canal_id::int,
         case when d.principal or d.marca ->> 'nombre' is not null then null
              else coalesce((select r.dominio from tienda_dominio r where r.id = d.redirige_a_id and r.canal_id = d.canal_id),
                            (select p.dominio from tienda_dominio p where p.canal_id = d.canal_id and p.principal)) end destino
    from tienda_dominio d where d.id = $1 and d.organizacion_id = $2`, [domId, org]);

/** El dominio al que puede redirigir otro de esa tienda: el principal o uno de otra marca. */
async function destinoValido(org: string, canalId: number, domId: number | null, excepto: number | null) {
  if (!domId) return null;
  if (domId === excepto) throw new ErrorErp("Un dominio no puede redirigir a sí mismo.");
  const d = await una<{ id: number }>(`select id::int from tienda_dominio where id = $1 and organizacion_id = $2 and canal_id = $3
                                         and (principal or marca ->> 'nombre' is not null)`, [domId, org, canalId]);
  if (!d) throw new ErrorErp("Elegí a qué dominio redirige: el principal o el de otra marca.");
  return d.id;
}

/** Lo que se carga de una marca (nombre obligatorio; vacío = lo de la tienda). */
function marcaDe(fd: FormData) {
  const nombre = texto(fd, "marca_nombre");
  if (!nombre) throw new ErrorErp("Poné el nombre de la marca (lo que ve el comprador en ese dominio).");
  const color = (k: string) => { const v = texto(fd, k); return v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null; };
  const m: Record<string, string> = { nombre };
  for (const k of ["logo", "banner", "banner_2", "banner_3", "email"]) { const v = texto(fd, `marca_${k}`); if (v) m[k] = v; }
  for (const k of ["color_marca", "color_marca_texto"]) { const v = fd.get(`marca_${k}_usar`) ? color(`marca_${k}`) : null; if (v) m[k] = v; }
  return m;
}

/** Acomoda la redirección en Vercel (si hay llave). */
async function aVercel(org: string, domId: number) {
  if (!hayLlaveVercel()) return;
  const f = await filaDe(org, domId);
  if (f) await agregarEnVercel(f.dominio, f.destino);
}

/** Pregunta a Vercel cómo está y lo guarda: registros DNS que faltan y estado. */
async function revisar(f: Fila, agregado = false): Promise<string> {
  const v = await estadoEnVercel(f.dominio);
  if (!v.existe) {
    if (agregado) throw new ErrorErp("Vercel no lo muestra en el proyecto todavía.");
    await agregarEnVercel(f.dominio, f.destino);
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

    const tipo = texto(fd, "tipo") ?? "principal";
    const principal = tipo === "principal";
    const actual = await una<{ dominio: string }>("select dominio from tienda_dominio where canal_id = $1 and principal", [canalId]);
    if (principal && actual) throw new ErrorErp(`La tienda ya tiene dominio principal (${actual.dominio}). Para cambiarlo, borralo primero.`);
    if (!principal && !actual) throw new ErrorErp("Primero cargá el dominio principal de la tienda: los demás redirigen a él o son otra marca.");
    const marca = tipo === "marca" ? marcaDe(fd) : null;
    const redirigeA = tipo === "redirige" ? await destinoValido(s.org.id, canalId, Number(fd.get("redirige_a_id")) || null, null) : null;

    const nuevo = await una<{ id: number }>(`insert into tienda_dominio (organizacion_id, canal_id, dominio, principal, marca, redirige_a_id)
                                             values ($1, $2, $3, $4, $5::jsonb, $6) returning id::int`,
      [s.org.id, canalId, dominio, principal, marca ? JSON.stringify(marca) : null, redirigeA]);
    olvidarDominios();
    revalidatePath(VOLVER);
    if (!hayLlaveVercel()) return `${dominio} quedó anotado, pero falta la llave de Vercel para conectarlo. Cuando esté, apretá "Verificar".`;
    try {
      const f = (await filaDe(s.org.id, nuevo!.id))!;
      // Si ya estaba en Vercel (los cargados a mano), se toma como está y se le acomoda la redirección.
      await agregarEnVercel(f.dominio, f.destino);
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
      if (otros) throw new ErrorErp("Primero borrá los demás dominios de la tienda (redirigen a éste o dependen de él).");
    }
    if (await una("select 1 from tienda_dominio where redirige_a_id = $1", [f.id])) throw new ErrorErp("Primero borrá o cambiá los dominios que redirigen a éste.");
    if (hayLlaveVercel()) await quitarDeVercel(f.dominio);
    await consulta("delete from tienda_dominio where id = $1 and organizacion_id = $2", [f.id, s.org.id]);
    olvidarDominios();
    revalidatePath(VOLVER);
    return hayLlaveVercel() ? `${f.dominio} borrado (también de Vercel).` : `${f.dominio} borrado. Falta la llave de Vercel: sacalo también de Vercel.`;
  });
}

/** Cambia un dominio que no es el principal: que redirija (al principal o a otra
 *  marca) o que sea otra marca (nombre, logo, colores de la franja, banners y mail). */
export async function accionGuardarDominio(fd: FormData) {
  const s = await entrarErp("tienda_config");
  const domId = id(fd, "id");
  await intentar(VOLVER, async () => {
    await entrar();
    const f = await filaDe(s.org.id, domId);
    if (!f) throw new ErrorErp("El dominio no existe.");
    if (f.principal) throw new ErrorErp("El principal abre la tienda con lo de la ficha de abajo: no se cambia acá.");
    const tipo = texto(fd, "tipo");
    const marca = tipo === "marca" ? marcaDe(fd) : null;
    const redirigeA = tipo === "marca" ? null : await destinoValido(s.org.id, f.canal_id, Number(fd.get("redirige_a_id")) || null, f.id);
    if (!marca && await una("select 1 from tienda_dominio where redirige_a_id = $1", [f.id]))
      throw new ErrorErp("Hay dominios que redirigen a éste: cambialos primero (o dejalo como otra marca).");
    await consulta("update tienda_dominio set marca = $3::jsonb, redirige_a_id = $4 where id = $1 and organizacion_id = $2",
      [f.id, s.org.id, marca ? JSON.stringify(marca) : null, redirigeA]);
    olvidarDominios();
    // En Vercel se acomodan todos los de la tienda (el www de una marca redirige a ella).
    const todos = await consulta<{ id: number }>("select id::int from tienda_dominio where canal_id = $1 and not principal order by id", [f.canal_id]);
    for (const x of todos) {
      try { await aVercel(s.org.id, x.id); } catch (e) {
        const motivo = e instanceof ErrorErp ? e.message : "Vercel no respondió.";
        await consulta("update tienda_dominio set detalle = $2, revisado_ts = now() where id = $1", [x.id, motivo]);
      }
    }
    revalidatePath(VOLVER);
    return marca ? `${f.dominio} abre la tienda como «${marca.nombre}».` : `${f.dominio} redirige.`;
  });
}
