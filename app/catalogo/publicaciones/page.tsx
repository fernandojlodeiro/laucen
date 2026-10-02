// Publicaciones (orden 136, §4.5): cada variación en cada canal, con su id
// externo (ej. MLA…), categoría, tipo y los atributos que pide el canal.
// ABM mínimo: la sincronización con Mercado Libre la hace otra sesión.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import AltaNueva from "@/app/componentes/AltaNueva";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, patronBusqueda,
} from "@/app/componentes/erp";
import { accionBorrarPublicacion, accionCrearPublicacion, accionGuardarPublicacion } from "./acciones";
import { verInactivos } from "@/app/componentes/Inactivos";

export const dynamic = "force-dynamic";

const BASE = "/catalogo/publicaciones";
const LIMITE = 200;

type SP = { canal?: string; estado?: string; q?: string; contiene?: string; inactivos?: string; editar?: string; ok?: string; error?: string };

type Fila = {
  id: number; variacion_id: number; sku: string; titulo_var: string; canal_id: number; canal: string;
  id_externo: string | null; titulo: string | null; categoria_externa: string | null; tipo_publicacion: string | null;
  estado: string; umbral_pausa: number | null; atributos: string; disponible: number; umbral_efectivo: number;
  sincronizada: string | null;
};

const TONO_ESTADO: Record<string, "verde" | "amarillo" | "gris"> = { activa: "verde", pausada: "amarillo", cerrada: "gris" };
const TEXTO_ESTADO: Record<string, string> = { activa: "Activa", pausada: "Pausada", cerrada: "Cerrada" };

export default async function Publicaciones({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("publicaciones_ver");
  const sp = await searchParams;
  const canalId = Number(sp.canal) || null;
  const estado = sp.estado && TEXTO_ESTADO[sp.estado] ? sp.estado : null;
  const q = sp.q?.trim() || "";
  const comienza = sp.contiene !== "1";
  const cont = comienza ? null : "1";
  const editar = Number(sp.editar) || 0;
  const inactivos = verInactivos(sp);
  const aqui = url(BASE, { canal: canalId, estado, q, contiene: cont, inactivos: inactivos ? "1" : null });

  const canales = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and estado <> 'archivado' order by nombre", [s.org.id]);
  const filas = await consulta<Fila>(`
    select pu.id::int, v.id::int variacion_id, v.sku, titulo_variacion(v.id) titulo_var, c.id::int canal_id, c.nombre canal,
           pu.id_externo, pu.titulo, pu.categoria_externa, pu.tipo_publicacion, pu.estado, pu.umbral_pausa,
           case when pu.atributos_externos = '{}'::jsonb then '' else jsonb_pretty(pu.atributos_externos) end atributos,
           stock_disponible_canal($1, v.id, c.id) disponible, umbral_pausa_de($1, v.id, c.id) umbral_efectivo,
           to_char(pu.ultima_sincronizacion_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') sincronizada
      from publicacion pu
      join variacion v on v.id = pu.variacion_id
      join producto p on p.id = v.producto_id
      join canal c on c.id = pu.canal_id
     where pu.organizacion_id = $1
       and ($6 or p.estado <> 'archivado')
       and ($2::bigint is null or pu.canal_id = $2)
       and ($3::text is null or pu.estado = $3)
       and ($4::text is null or v.sku ilike $4 or pu.id_externo ilike $4 or v.codigo_barras = $5)
     order by c.nombre, v.sku, pu.id
     limit ${LIMITE}`, [s.org.id, canalId, estado, patronBusqueda(q, comienza), q, inactivos]);

  const campos = (f?: Fila) => (
    <>
      <label><span className={ETIQUETA}>SKU</span>
        <input name="sku" defaultValue={f?.sku} placeholder="SKU o código de barras" className={`${CAMPO} w-36`} autoFocus /></label>
      <label><span className={ETIQUETA}>Canal</span>
        <select name="canal" defaultValue={f?.canal_id ?? canalId ?? ""} className={CAMPO}>
          <option value="">Elegí…</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select></label>
      <label><span className={ETIQUETA}>Id externo</span>
        <input name="id_externo" defaultValue={f?.id_externo ?? ""} placeholder="MLA123456789" className={`${CAMPO} w-36`} /></label>
      <label className="flex-1 min-w-48"><span className={ETIQUETA}>Título en el canal (vacío = el de la variación)</span>
        <input name="titulo" defaultValue={f?.titulo ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Categoría externa</span>
        <input name="categoria" defaultValue={f?.categoria_externa ?? ""} placeholder="MLA1234" className={`${CAMPO} w-28`} /></label>
      <label><span className={ETIQUETA}>Tipo</span>
        <input name="tipo" defaultValue={f?.tipo_publicacion ?? ""} placeholder="clásica / premium" className={`${CAMPO} w-32`} /></label>
      <label><span className={ETIQUETA}>Estado</span>
        <select name="estado" defaultValue={f?.estado ?? "activa"} className={CAMPO}>
          <option value="activa">Activa</option><option value="pausada">Pausada</option><option value="cerrada">Cerrada</option>
        </select></label>
      <label><span className={ETIQUETA}>Umbral de pausa</span>
        <CampoNumero name="umbral" valor={f?.umbral_pausa} tipo="entero" placeholder="hereda" className={`${CAMPO} w-20`} /></label>
      <label className="w-full"><span className={ETIQUETA}>Atributos externos (JSON; los que pide la categoría del canal)</span>
        <textarea name="atributos" defaultValue={f?.atributos ?? ""} rows={3} placeholder={'{"BRAND": "Laucen", "MODEL": "X1"}'}
          className={`${CAMPO} w-full font-mono`} /></label>
    </>
  );

  return (
    <Pantalla titulo="Publicaciones" subtitulo="Cada variación en cada canal. La sincronización con Mercado Libre llega en otra etapa.">
      <Avisos sp={sp} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} inactivos={inactivos} placeholder="Buscar por SKU o id externo" limpiar={["editar"]} />
        <FiltroVivo parametro="canal" valor={canalId ? String(canalId) : ""} etiqueta="Canal" limpiar={["editar"]}>
          <option value="">Todos los canales</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="estado" valor={estado ?? ""} etiqueta="Estado" limpiar={["editar"]}>
          <option value="">Todos los estados</option><option value="activa">Activa</option><option value="pausada">Pausada</option><option value="cerrada">Cerrada</option>
        </FiltroVivo>
      </div>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>SKU</th><th className={TH}>Título</th><th className={TH}>Canal</th><th className={TH}>Id externo</th>
              <th className={TH}>Categoría · tipo</th><th className={TH}>Estado</th><th className={THN}>Disponible</th><th className={THN}>Umbral</th><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{canalId || estado || q ? "Nada coincide con el filtro." : "Todavía no hay publicaciones. Cargá la primera abajo."}</td></tr>}
            {filas.map((f) => editar === f.id ? (
              <tr key={f.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={9} className={TD}>
                  <form action={accionGuardarPublicacion} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="volver" value={aqui} />
                    {campos(f)}
                    <button className={VERDE}>Guardar</button>
                    <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={f.id} className={TR}>
                <td className={`${TD} whitespace-nowrap`}>{f.sku}</td>
                <td className={TD}>{f.titulo ?? <span className="text-[#5C6B76]">{f.titulo_var}</span>}</td>
                <td className={TD}>{f.canal}</td>
                <td className={`${TD} whitespace-nowrap`}>{f.id_externo ?? "—"}</td>
                <td className={TD}>{[f.categoria_externa, f.tipo_publicacion].filter(Boolean).join(" · ") || "—"}</td>
                <td className={TD}>
                  <Estado texto={TEXTO_ESTADO[f.estado] ?? f.estado} tono={TONO_ESTADO[f.estado] ?? "gris"} />
                  {f.sincronizada && <span className="block text-[10px] text-[#5C6B76]">sinc. {f.sincronizada}</span>}
                </td>
                <td className={`${TDN} ${f.disponible <= f.umbral_efectivo ? "text-[#C03420] font-semibold" : ""}`}>{f.disponible}</td>
                <td className={TDN} title={f.umbral_pausa == null ? "Hereda del producto, del canal o de la organización" : "Propio de esta publicación"}>
                  {f.umbral_efectivo}{f.umbral_pausa == null && <span className="text-[10px] text-[#5C6B76]"> (hereda)</span>}
                </td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE, { canal: canalId, estado, q, contiene: cont, inactivos: inactivos ? "1" : null, editar: f.id })} />
                    <TachoConfirmar accion={accionBorrarPublicacion} campos={{ id: String(f.id), volver: aqui }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length === LIMITE && <p className="text-[11px] text-[#5C6B76] mt-1">Se muestran las primeras {LIMITE}: afiná el filtro para ver el resto.</p>}

      <section className="mt-4">
        {canales.length === 0 ? (
          <p className="text-xs text-[#5C6B76]">Primero hace falta un canal: <Link href="/config/canales" className="text-[#16577F] underline">Configuración → Canales</Link>.</p>
        ) : (
          <AltaNueva texto="Nueva publicación">
          <form action={accionCrearPublicacion} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="volver" value={aqui} />
            {campos()}
            <button className={PRIMARIO}>Crear</button>
          </form>
          </AltaNueva>
        )}
        <p className="text-[11px] text-[#5C6B76] mt-2">Disponible: lo que hay para vender en los depósitos del canal. Umbral: con ese disponible o menos, el canal pausa la publicación (vacío = hereda del producto, del canal o de la organización).</p>
      </section>
    </Pantalla>
  );
}
