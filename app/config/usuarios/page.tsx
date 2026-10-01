// Usuarios y roles de la organización. Por ahora sólo se mira: la edición
// (invitar, cambiar rol, tildar permisos) viene más adelante, con el candado
// anti-encierro de lib/roles.ts.

import { consulta } from "@/lib/erp/base";
import { PERMISOS, FUNCIONES, tienePermiso, type Permisos } from "@/lib/permisos";
import { entrarErp, Pantalla, Estado, CAJA_TABLA, TABLA, THEAD, TH, TR, TD } from "@/app/componentes/erp";
import { fecha } from "@/app/ventas/formato";

export const dynamic = "force-dynamic";

const ESTADOS = { ACTIVO: ["Activo", "verde"], INVITADO: ["Invitado", "amarillo"], SUSPENDIDO: ["Suspendido", "rojo"] } as const;

export default async function Usuarios() {
  const s = await entrarErp("usuarios_ver");
  const [miembros, roles] = await Promise.all([
    consulta<{ id: string; nombre: string; email: string; rol: string | null; estado: keyof typeof ESTADOS; creada_el: Date }>(`
      select m.id, u.nombre, u.email, r.nombre rol, m.estado::text estado, m.creada_el
        from membresias m join usuarios u on u.id = m.usuario_id left join roles r on r.id = m.rol_id
       where m.organizacion_id = $1 order by u.nombre`, [s.org.id]),
    consulta<{ id: string; nombre: string; permisos: Permisos; protegido: boolean; miembros: number }>(`
      select r.id, r.nombre, r.permisos, r.protegido,
             (select count(*) from membresias m where m.rol_id = r.id)::int miembros
        from roles r where r.organizacion_id = $1 order by r.nombre`, [s.org.id]),
  ]);

  return (
    <Pantalla titulo="Usuarios y roles" subtitulo="Quién está en la organización y qué puede hacer cada rol" ancho="max-w-5xl">
      <p className="text-xs rounded-lg px-3 py-2 mb-4 bg-[#EEF3F8] text-[#16577F]">Por ahora sólo se mira; editar roles y usuarios viene más adelante.</p>

      <h2 className="text-sm font-bold mb-2">Miembros</h2>
      <div className={`${CAJA_TABLA} mb-6`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Nombre</th><th className={TH}>Mail</th><th className={TH}>Rol</th><th className={TH}>Estado</th><th className={TH}>Desde</th></tr></thead>
          <tbody>
            {miembros.map((m) => {
              const [texto, tono] = ESTADOS[m.estado] ?? [m.estado, "gris"];
              return (
                <tr key={m.id} className={TR}>
                  <td className={`${TD} font-semibold`}>{m.nombre}</td>
                  <td className={TD}>{m.email}</td>
                  <td className={TD}>{m.rol ?? <span className="text-[#5C6B76]">A medida (sin rol)</span>}</td>
                  <td className={TD}><Estado texto={texto} tono={tono} /></td>
                  <td className={TD}>{fecha(m.creada_el)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2">Roles y permisos</h2>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Los permisos de las funciones del menú que un rol no tiene cargados cuentan como prendidos mientras no exista la edición de roles.
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Permiso</th>
              {roles.map((r) => (
                <th key={r.id} className={`${TH} text-center`}>
                  {r.nombre}{r.protegido && " 🔒"}
                  <div className="font-normal text-[10px]">{r.miembros} miembro{r.miembros === 1 ? "" : "s"}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 && <tr><td className={`${TD} text-[#5C6B76]`}>La organización todavía no tiene roles.</td></tr>}
            {roles.length > 0 && PERMISOS.map((p) => (
              <tr key={p.key} className={TR}>
                <td className={TD}>
                  <span className="font-semibold">{p.label}</span>
                  {FUNCIONES.includes(p.key) && <span className="text-[10px] text-[#5C6B76]"> · menú</span>}
                  <div className="text-[10px] text-[#5C6B76]">{p.ayuda}</div>
                </td>
                {roles.map((r) => (
                  <td key={r.id} className={`${TD} text-center`}>
                    <input type="checkbox" disabled checked={tienePermiso(r.permisos, p.key)} readOnly aria-label={`${p.label} — ${r.nombre}`} className="h-4 w-4 accent-[#16577F]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
