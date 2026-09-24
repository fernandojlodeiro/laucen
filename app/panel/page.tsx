// El panel, detrás del login. Arranca con lo mínimo: quién sos, y —si sos
// vos, Fer— los dos botones de las herramientas internas. Lo de búsquedas de
// productos se agrega acá cuando exista.

import Link from "next/link";
import { sesionRequerida } from "@/lib/tenancy";
import { sosVos } from "@/lib/admin";
import { accionLogout } from "@/app/auth-actions";
import { SUAVE } from "@/app/botones";

export default async function Panel() {
  const sesion = await sesionRequerida();
  const esAdmin = await sosVos();

  return (
    <main className="max-w-lg mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold">{sesion.org.nombre}</h1>
          <p className="text-xs text-[#5C6B76]">{sesion.usuario.email}</p>
        </div>
        <form action={accionLogout}>
          <button className={SUAVE}>Cerrar sesión</button>
        </form>
      </header>

      <p className="text-sm text-[#5C6B76] mb-6">
        Todavía no hay búsquedas cargadas. Esto arranca acá.
      </p>

      {esAdmin && (
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/bitacora" className={SUAVE}>🗒️ Bitácora</Link>
          <Link href="/admin/para-probar" className={SUAVE}>🧪 Para probar</Link>
        </div>
      )}
    </main>
  );
}
