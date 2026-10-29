// Control de stock › A buscar (lib/deposito/control.ts): lo que en el recorrido quedó con «?» y está en el depósito
// «En búsqueda». Cada uno se resuelve: «Apareció» lo devuelve a una ubicación (la suya, de entrada) y «No apareció»
// lo descuenta por faltante.

import { entrarErp, Pantalla } from "@/app/componentes/erp";
import Pestanas from "@/app/componentes/Pestanas";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { consulta } from "@/lib/erp/base";
import { coincideBusqueda } from "@/lib/busqueda";
import { buscandoAhora, pendientes } from "@/lib/deposito/control";
import type { OpcionUbicacion } from "@/app/componentes/ElegirUbicacion";
import Resolver from "./Resolver";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string };

export default async function ABuscar({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("control_stock");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const [todos, n, ubicaciones] = await Promise.all([
    buscandoAhora(s.org.id),
    pendientes(s.org.id),
    consulta<OpcionUbicacion>(`
      select u.id::text valor, d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end texto, u.descripcion detalle
        from ubicacion u join deposito d on d.id = u.deposito_id
       where u.organizacion_id = $1 and u.estado = 'activa' and d.estado = 'activo' and d.tipo = 'propio' and d.especial is null
       order by d.nombre, u.es_default desc, u.orden_recorrido, u.codigo`, [s.org.id]),
  ]);
  const lista = q ? todos.filter((b) => coincideBusqueda([b.sku, b.titulo, b.codigo], q, comienza)) : todos;

  return (
    <Pantalla titulo="Control de stock" subtitulo="Lo que no se encontró en su lugar: buscalo y decí si apareció" ancho="max-w-2xl">
      <Pestanas items={[
        { href: "/deposito/control", texto: "Por controlar", cuenta: n, activa: false },
        { href: "/deposito/control/a-buscar", texto: "A buscar", cuenta: todos.length, activa: true },
      ]} />
      <div className="mb-3"><BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por SKU, título o ubicación…" /></div>
      <Resolver items={lista} ubicaciones={ubicaciones}
        vacio={todos.length ? "No hay nada a buscar con esa búsqueda." : "No hay nada a buscar: todo lo que quedó con «?» ya se resolvió."} />
    </Pantalla>
  );
}
