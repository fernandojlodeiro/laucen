// Ventas → Reclamos y devoluciones: los reclamos de Mercado Libre (entran
// solos, con su plazo para responder) y los de la web o el local (se cargan
// con "Nuevo reclamo"). Pestañas: Abiertos (los que esperan tu respuesta
// primero, por vencimiento), En mediación, Devoluciones en camino, Cerrados.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { SUAVE, PRIMARIO } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import Pestanas from "@/app/componentes/Pestanas";
import RangoFechas from "@/app/componentes/RangoFechas";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, url, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista, paginaDeVista } from "@/app/listas/piezas";
import { CONDICION_RECLAMOS, PESTANAS_RECLAMOS, TIPOS_RECLAMO, type PestanaReclamos } from "@/lib/reclamos";
import { LISTA_RECLAMOS, filtrosReclamos } from "./lista";
import { accionTraerReclamos, accionNuevoReclamo } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { ver?: string; canal?: string; motivo?: string; desde?: string; hasta?: string; q?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string; nuevo?: string };

export default async function Reclamos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("reclamos_ver");
  const sp = await searchParams;
  const { ver, canal, motivo, desde, hasta, q } = filtrosReclamos(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const [canales, motivos, cuentas, vista, hayMl] = await Promise.all([
    consulta<{ id: number; nombre: string }>(
      "select id::int, nombre from canal where organizacion_id = $1 and id in (select canal_id from reclamo where organizacion_id = $1 and canal_id is not null) order by nombre", [s.org.id]),
    consulta<{ motivo: string }>("select distinct motivo from reclamo where organizacion_id = $1 and motivo is not null order by motivo limit 200", [s.org.id]),
    consulta<Record<PestanaReclamos, number>>(
      `select ${PESTANAS_RECLAMOS.map(([k]) => `count(*) filter (where ${CONDICION_RECLAMOS[k]})::int ${k}`).join(", ")} from reclamo r where r.organizacion_id = $1`, [s.org.id]),
    paginaDeVista(LISTA_RECLAMOS, ctx, sp),
    consulta<{ x: number }>("select 1 x from meli_cuenta where organizacion_id = $1 and canal_id is not null and estado = 'activa' limit 1", [s.org.id]),
  ]);
  const cuenta = cuentas[0];
  const hayFiltro = !!(canal || motivo || desde || hasta || q);
  const enlace = (k: PestanaReclamos) => url("/ventas/reclamos", { ver: k === "abiertos" ? null : k, canal: canal || null, motivo: motivo || null, desde, hasta, q });

  return (
    <Pantalla titulo="Reclamos y devoluciones" subtitulo="Los reclamos de Mercado Libre y los de la web o el local, con el plazo para responder"
      acciones={<>
        {hayMl.length > 0 && <form action={accionTraerReclamos}><BotonEnviar clase={SUAVE} corriendo="Trayendo…">Traer reclamos de ML</BotonEnviar></form>}
        <AccionesExcel lista={LISTA_RECLAMOS} org={s.org.id} />
        <BotonNuevo texto="Nuevo reclamo" />
      </>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo reclamo" sinBoton>
        <form action={accionNuevoReclamo} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-start">
          <label><span className={ETIQUETA}>Nº de pedido (de la web o el local)</span>
            <input name="pedido" placeholder="Nº de Laucen o de la tienda" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>…o Nº de cliente (si no hay pedido)</span>
            <input name="cliente" inputMode="numeric" className={`${CAMPO} w-full text-right`} /></label>
          <label><span className={ETIQUETA}>Origen (si no hay pedido)</span>
            <select name="origen" className={`${CAMPO} w-full`}><option value="web">Web</option><option value="local">Local</option></select></label>
          <label><span className={ETIQUETA}>Tipo</span>
            <select name="tipo" defaultValue="reclamo" className={`${CAMPO} w-full`}>
              {Object.entries(TIPOS_RECLAMO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label className="sm:col-span-2"><span className={ETIQUETA}>Motivo</span>
            <input name="motivo" required placeholder="Ej.: llegó roto, no funciona, no era lo que pidió" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Monto reclamado $ (vacío = el total del pedido)</span>
            <CampoNumero name="monto" valor={null} tipo="pesos" className="w-full" /></label>
          <div />
          <label className="sm:col-span-2 lg:col-span-4"><span className={ETIQUETA}>Notas</span>
            <textarea name="notas" rows={2} className={`${CAMPO} w-full`} /></label>
          <div><button className={PRIMARIO}>Crear</button></div>
        </form>
        <p className="mt-2 text-[11px] text-[#5C6B76]">Los reclamos de Mercado Libre no se cargan acá: entran solos.</p>
      </AltaNueva>

      <Pestanas className="mb-3" items={PESTANAS_RECLAMOS.map(([k, texto]) => ({ clave: k, texto, activa: ver === k, cuenta: cuenta?.[k] ?? 0, href: enlace(k) }))} />

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div><span className={ETIQUETA}>Buscar</span><BuscadorVivo q={q} comienza={false} sinComienza placeholder="Nº de pedido, orden de ML o comprador" limpiar={["p"]} /></div>
        <div><span className={ETIQUETA}>Canal / cuenta</span>
          <FiltroVivo key={`c${canal}`} parametro="canal" valor={canal ? String(canal) : ""} etiqueta="Canal" limpiar={["p"]}>
            <option value="">Todos</option>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </FiltroVivo></div>
        <div><span className={ETIQUETA}>Motivo</span>
          <FiltroVivo key={`m${motivo}`} parametro="motivo" valor={motivo} etiqueta="Motivo" limpiar={["p"]}>
            <option value="">Todos</option>
            {motivos.map((m) => <option key={m.motivo} value={m.motivo}>{m.motivo}</option>)}
          </FiltroVivo></div>
        <div><span className={ETIQUETA}>Fechas</span><RangoFechas desde={desde} hasta={hasta} vacio="Todas las fechas" etiqueta="" limpiar={["p"]} /></div>
        {hayFiltro && <Link href={url("/ventas/reclamos", { ver: ver === "abiertos" ? null : ver })} className={SUAVE}>Limpiar filtros</Link>}
      </div>

      <TablaVista lista={LISTA_RECLAMOS} campos={vista.campos} filas={vista.filas} total={vista.total} ctx={{ moneda: s.moneda, sp }}
        claseFila={(f) => (f.espera && f.vence_ts && new Date(f.vence_ts).getTime() - Date.now() < 86_400_000 ? "bg-[#FDF1EF]" : "")}
        vacio={hayFiltro ? "No hay reclamos con esos filtros." : ver === "abiertos" ? "No hay reclamos abiertos." : "No hay reclamos acá."} />
    </Pantalla>
  );
}
