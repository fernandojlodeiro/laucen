// Usuarios y roles de la organización: quién está, con qué rol y en qué
// estado; invitar por mail; y el ABM de roles con sus permisos como cajas
// para tildar. Mirar pide "Usuarios y roles"; cambiar algo pide además
// "Gestionar equipo" (o ser Fer). Todo cambio pasa por el candado
// anti-encierro de lib/roles.ts (ver ./acciones.ts). Los roles piden
// «Administrar roles»; a un superadministrador sólo lo toca otro (y al dueño,
// nadie).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { PERMISOS, FUNCIONES, tienePermiso, type PermisoKey, type Permisos } from "@/lib/permisos";
import { MENU } from "@/lib/menu";
import { sosVos } from "@/lib/admin";
import { PRIMARIO, SUAVE, VERDE, APAGAR } from "@/app/botones";
import { TachoConfirmar, BotonConfirmar } from "@/app/radar/Cliente";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import {
  entrarErp, Pantalla, Avisos, Estado, Lapiz, url, coincideBusqueda, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";
import {
  accionCambiarRol, accionSuspender, accionReactivar, accionInvitar, accionCancelarInvitacion,
  accionCrearRol, accionGuardarRol, accionBorrarRol, accionHacerSuperadmin, accionQuitarSuperadmin,
} from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/config/usuarios";
const ESTADOS = { ACTIVO: ["Activo", "verde"], INVITADO: ["Invitado", "amarillo"], SUSPENDIDO: ["Suspendido", "rojo"] } as const;

type SP = { q?: string; contiene?: string; editar?: string; rol?: string; ok?: string; error?: string };

const ETIQUETA_PERMISO = new Map(PERMISOS.map((p) => [p.key, p]));

/** Los permisos agrupados como en la pantalla de edición: las funciones del
 *  menú, por sección del menú; después los demás permisos. */
function gruposDePermisos(): { titulo: string; claves: PermisoKey[] }[] {
  const usados = new Set<PermisoKey>();
  const grupos: { titulo: string; claves: PermisoKey[] }[] = [];
  for (const s of MENU) {
    if (s.soloFer) continue;
    const claves = [s.permiso, ...s.items.map((i) => i.permiso)]
      .filter((k): k is PermisoKey => !!k && FUNCIONES.includes(k) && !usados.has(k) && ETIQUETA_PERMISO.has(k));
    claves.forEach((k) => usados.add(k));
    if (claves.length) grupos.push({ titulo: s.texto, claves });
  }
  const sueltas = FUNCIONES.filter((k) => !usados.has(k) && ETIQUETA_PERMISO.has(k));
  if (sueltas.length) grupos.push({ titulo: "Otras funciones", claves: sueltas });
  grupos.push({ titulo: "Otros permisos (no son botones del menú)", claves: PERMISOS.map((p) => p.key).filter((k) => !FUNCIONES.includes(k)) });
  return grupos;
}

export default async function Usuarios({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("usuarios_ver");
  const sp = await searchParams;
  const esFer = await sosVos();
  const puedeEditar = tienePermiso(s.permisos, "gestionar_equipo") || esFer;
  const puedeRoles = puedeEditar && (tienePermiso(s.permisos, "roles_administrar") || esFer);
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1" };
  const editar = puedeEditar ? sp.editar ?? "" : "";
  const rolAbierto = puedeRoles ? sp.rol ?? "" : "";

  const [todos, roles] = await Promise.all([
    consulta<{ id: string; nombre: string; email: string; rol_id: string | null; rol: string | null; estado: keyof typeof ESTADOS; creada_el: Date; registrado: boolean; superadmin: boolean; dueno: boolean }>(`
      select m.id, u.nombre, u.email, m.rol_id, r.nombre rol, m.estado::text estado, m.creada_el, u.auth_id is not null registrado,
             m.superadmin, o.dueno_usuario_id is not distinct from m.usuario_id dueno
        from membresias m join usuarios u on u.id = m.usuario_id join organizaciones o on o.id = m.organizacion_id left join roles r on r.id = m.rol_id
       where m.organizacion_id = $1 order by m.superadmin desc, u.nombre`, [s.org.id]),
    consulta<{ id: string; nombre: string; permisos: Permisos; protegido: boolean; miembros: number }>(`
      select r.id, r.nombre, r.permisos, r.protegido,
             (select count(*) from membresias m where m.rol_id = r.id)::int miembros
        from roles r where r.organizacion_id = $1 order by r.nombre`, [s.org.id]),
  ]);
  const miembros = q ? todos.filter((m) => coincideBusqueda([m.nombre, m.email, m.rol, ESTADOS[m.estado]?.[0], m.superadmin ? "Superadministrador" : null], q, comienza)) : todos;
  const grupos = gruposDePermisos();
  const funciones = FUNCIONES.filter((k) => ETIQUETA_PERMISO.has(k));
  const rolDefecto = roles.find((r) => !r.protegido)?.id ?? roles[0]?.id ?? "";

  return (
    <Pantalla titulo="Usuarios y roles" subtitulo="Quién está en la organización y qué puede hacer cada rol" ancho="max-w-5xl"
      acciones={puedeEditar && (
        <>
          {roles.length > 0 && <BotonNuevo texto="Invitar persona" />}
          {puedeRoles && <BotonNuevo texto="Nuevo rol" />}
        </>
      )}>
      <Avisos sp={sp} />
      {puedeEditar && roles.length > 0 && (
        <AltaNueva texto="Invitar persona" sinBoton>
          <form action={accionInvitar} className="flex flex-wrap items-end gap-2">
            <label><span className={ETIQUETA}>Mail</span><input name="email" type="email" placeholder="nombre@mail.com" className={`${CAMPO} w-60`} autoFocus /></label>
            <label><span className={ETIQUETA}>Nombre (opcional)</span><input name="nombre" className={`${CAMPO} w-44`} /></label>
            <label>
              <span className={ETIQUETA}>Rol</span>
              <select name="rol" defaultValue={rolDefecto} className={CAMPO}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </label>
            <button className={PRIMARIO}>Invitar</button>
          </form>
          <p className="text-[11px] text-[#5C6B76] mt-2">
            No sale ningún mail: avisale vos. Tiene que registrarse en {process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/registro` : "la pantalla de registro"} con
            este mismo mail (en «Organización» puede poner cualquier cosa: no se usa, entra a ésta). Si ya tiene cuenta, entra como siempre y queda adentro.
          </p>
        </AltaNueva>
      )}
      {puedeRoles && (
        <AltaNueva texto="Nuevo rol" sinBoton>
          <form action={accionCrearRol} className="flex flex-wrap items-end gap-2">
            <label><span className={ETIQUETA}>Nombre</span><input name="nombre" placeholder="Ej. Depósito" className={`${CAMPO} w-48`} autoFocus /></label>
            <label>
              <span className={ETIQUETA}>Arranca con los permisos de</span>
              <select name="base" defaultValue="" className={CAMPO}>
                <option value="">Ninguno (todas las funciones del menú prendidas)</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </label>
            <button className={PRIMARIO}>Crear</button>
          </form>
        </AltaNueva>
      )}
      {!puedeEditar && (
        <p className="text-xs rounded-lg px-3 py-2 mb-4 bg-[#EEF3F8] text-[#16577F]">Podés mirar; para cambiar usuarios y roles hace falta el permiso «Gestionar equipo».</p>
      )}

      <h2 className="text-sm font-bold mb-2">Personas</h2>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        👑 <b>Dueño</b>: el que creó la organización; es superadministrador y nadie se lo saca ni lo suspende.
        ⭐ <b>Superadministrador</b>: tiene todos los permisos, sin importar su rol; sólo otro superadministrador lo nombra, se lo saca o lo cambia.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por nombre o mail" limpiar={["editar"]} />
      </div>
      <div className={`${CAJA_TABLA} mb-3`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Nombre</th><th className={TH}>Mail</th><th className={TH}>Rol</th><th className={TH}>Estado</th><th className={TH}>Desde</th>{puedeEditar && <th />}</tr>
          </thead>
          <tbody>
            {miembros.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>{q ? "Nadie coincide." : "Todavía no hay nadie."}</td></tr>}
            {miembros.map((m) => {
              const [textoEstado, tono] = ESTADOS[m.estado] ?? [m.estado, "gris"];
              const soyYo = m.id === s.membresia.id;
              // A un superadministrador sólo lo toca otro superadministrador.
              const tocable = !m.superadmin || s.superadmin;
              if (editar === m.id) return (
                <tr key={m.id} className={`${TR} bg-[#FAFBFC]`}>
                  <td className={`${TD} font-semibold`}>{m.nombre}</td>
                  <td className={TD}>{m.email}</td>
                  <td colSpan={4} className={TD}>
                    <form action={accionCambiarRol} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <select name="rol" defaultValue={m.rol_id ?? ""} className={CAMPO} aria-label="Rol" autoFocus>
                        {!m.rol_id && <option value="" disabled>A medida (sin rol)</option>}
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                      <button className={VERDE}>Guardar</button>
                      <Link href={url(BASE, filtros)} className={SUAVE} scroll={false}>Cancelar</Link>
                    </form>
                  </td>
                </tr>
              );
              return (
                <tr key={m.id} className={TR}>
                  <td className={`${TD} font-semibold`}>
                    {m.nombre}{soyYo && <span className="ml-1 font-normal text-[#5C6B76]">(vos)</span>}
                    {m.dueno ? <span className="ml-1 text-[10px] font-bold text-[#8A5A00]" title="Dueño: superadministrador que nadie puede sacar">👑 Dueño</span>
                      : m.superadmin && <span className="ml-1 text-[10px] font-bold text-[#16577F]" title="Superadministrador: tiene todos los permisos">⭐ Superadministrador</span>}
                  </td>
                  <td className={TD}>{m.email}</td>
                  <td className={TD}>
                    {m.rol ?? <span className="text-[#5C6B76]">A medida (sin rol)</span>}
                    {m.superadmin && <div className="text-[10px] text-[#5C6B76]">Tiene todo por ser superadministrador</div>}
                  </td>
                  <td className={TD}>
                    <Estado texto={textoEstado} tono={tono} />
                    {m.estado === "INVITADO" && <div className="text-[10px] text-[#5C6B76]">{m.registrado ? "Tiene cuenta: queda activo la próxima vez que entre" : "Tiene que registrarse con este mail"}</div>}
                  </td>
                  <td className={TD}>{fecha(m.creada_el)}</td>
                  {puedeEditar && (
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-1">
                        {s.superadmin && !m.superadmin && m.estado !== "SUSPENDIDO" && (
                          <BotonConfirmar accion={accionHacerSuperadmin} campos={{ id: m.id }} clase={SUAVE} texto="Hacer superadministrador" pregunta="¿Darle todos los permisos?" corriendo="Guardando…" />
                        )}
                        {s.superadmin && m.superadmin && !m.dueno && (
                          <BotonConfirmar accion={accionQuitarSuperadmin} campos={{ id: m.id }} clase={APAGAR} texto="Quitar superadministrador" pregunta="¿Quitárselo?" corriendo="Guardando…" />
                        )}
                        {tocable && <Lapiz href={url(BASE, { ...filtros, editar: m.id })} etiqueta="Cambiar el rol" />}
                        {!tocable ? null : m.estado === "SUSPENDIDO" ? (
                          <form action={accionReactivar}><input type="hidden" name="id" value={m.id} /><button className={SUAVE}>Reactivar</button></form>
                        ) : !soyYo && !m.dueno && (
                          <BotonConfirmar accion={accionSuspender} campos={{ id: m.id }} clase={APAGAR} texto="Suspender" pregunta="¿Suspender?" corriendo="Suspendiendo…" />
                        )}
                        {m.estado === "INVITADO" && <TachoConfirmar accion={accionCancelarInvitacion} campos={{ id: m.id }} pregunta="¿Borrar la invitación?" />}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="text-sm font-bold mb-2 mt-6">Roles y permisos</h2>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Cada rol tiene sus permisos como cajas para tildar. Una función del menú que un rol todavía no tiene cargada cuenta como prendida (y se ve tildada).
        Siempre tiene que quedar alguien activo con «Gestionar equipo». Nadie puede dar un permiso que no tiene: ni al armar un rol, ni al asignarlo.
        Crear, editar y borrar roles pide «Administrar roles».
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Rol</th><th className={THN}>Personas</th><th className={TH}>Permisos</th>{puedeRoles && <th />}</tr>
          </thead>
          <tbody>
            {roles.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>La organización todavía no tiene roles.</td></tr>}
            {roles.map((r) => {
              const prendidas = funciones.filter((k) => tienePermiso(r.permisos, k)).length;
              const gestiona = tienePermiso(r.permisos, "gestionar_equipo");
              if (rolAbierto === r.id) return (
                <tr key={r.id} id={`rol-${r.id}`} className={`${TR} bg-[#FAFBFC]`}>
                  <td colSpan={4} className={TD}>
                    <form action={accionGuardarRol}>
                      <input type="hidden" name="id" value={r.id} />
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <input name="nombre" defaultValue={r.nombre} aria-label="Nombre del rol" className={`${CAMPO} w-56 font-semibold`} />
                        {r.protegido && <span className="text-[11px] text-[#5C6B76]">🔒 Rol de fábrica: no se borra y siempre gestiona el equipo.</span>}
                        <span className="ml-auto inline-flex gap-2">
                          <button className={VERDE}>Guardar</button>
                          <Link href={url(BASE, filtros)} className={SUAVE} scroll={false}>Cancelar</Link>
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {grupos.map((g) => (
                          <fieldset key={g.titulo} className="rounded-lg border border-[#E3E9F0] bg-white p-2">
                            <legend className="px-1 text-[11px] font-bold text-[#5C6B76]">{g.titulo}</legend>
                            {g.claves.map((k) => {
                              const p = ETIQUETA_PERMISO.get(k)!;
                              const fijo = r.protegido && k === "gestionar_equipo";
                              // Lo que no tenés, no lo podés dar (queda como está).
                              const ajeno = !s.superadmin && !esFer && !tienePermiso(s.permisos, k);
                              return (
                                <label key={k} className="flex items-start gap-2 py-1 text-xs">
                                  <input type="checkbox" name={`perm_${k}`} defaultChecked={fijo || tienePermiso(r.permisos, k)} disabled={fijo || ajeno}
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#16577F]" />
                                  {(fijo || (ajeno && tienePermiso(r.permisos, k))) && <input type="hidden" name={`perm_${k}`} value="on" />}
                                  <span><span className="font-semibold">{p.label}</span>{ajeno && <span className="ml-1 text-[10px] text-[#B42318]">(no lo tenés: no lo podés cambiar)</span>}<span className="block text-[10px] text-[#5C6B76]">{p.ayuda}</span></span>
                                </label>
                              );
                            })}
                          </fieldset>
                        ))}
                      </div>
                    </form>
                  </td>
                </tr>
              );
              return (
                <tr key={r.id} id={`rol-${r.id}`} className={TR}>
                  <td className={`${TD} font-semibold`}>{r.nombre}{r.protegido && <span title="Rol de fábrica: no se borra"> 🔒</span>}</td>
                  <td className={TDN}>{r.miembros}</td>
                  <td className={`${TD} text-[#5C6B76]`}>
                    {prendidas} de {funciones.length} funciones del menú{gestiona && <> · <span className="text-[#1F6E4A] font-semibold">gestiona el equipo</span></>}
                  </td>
                  {puedeRoles && (
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <span className="inline-flex gap-1">
                        <Lapiz href={`${url(BASE, { ...filtros, rol: r.id })}#rol-${r.id}`} etiqueta="Editar el rol y sus permisos" />
                        {!r.protegido && r.miembros === 0 && <TachoConfirmar accion={accionBorrarRol} campos={{ id: r.id }} pregunta="¿Borrar?" />}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
