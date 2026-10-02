// Tienda web: lo que ve el comprador (nombre, dirección, colores, logo,
// banner, datos de contacto) de cada canal tipo web_minorista. Vive en
// canal.config; la lista de precios, el estado y los depósitos se cambian en
// Configuración → Canales.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { slugDe, type ConfigTienda } from "@/lib/tienda/tienda";
import { PRIMARIO, VERDE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Estado, CAMPO, ETIQUETA, CAJA } from "@/app/componentes/erp";
import SubirImagen from "./SubirImagen";
import { origen } from "./origen";
import { accionCrearTienda, accionGuardarTienda } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const ESTADOS: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" }> = {
  activo: { texto: "Activa: toma pedidos", tono: "verde" }, pausado: { texto: "Pausada: no toma pedidos", tono: "amarillo" },
};

export default async function ConfigTiendaPantalla({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tienda_config");
  const sp = await searchParams;
  const base = await origen();
  const tiendas = await consulta<{ id: number; nombre: string; estado: string; config: ConfigTienda; lista: string | null; depositos: string | null }>(`
    select c.id::int, c.nombre, c.estado, c.config, l.nombre lista,
           (select string_agg(d.nombre, ', ' order by cd.prioridad, d.nombre) from canal_deposito cd join deposito d on d.id = cd.deposito_id
             where cd.canal_id = c.id) depositos
      from canal c left join lista_precios l on l.id = c.lista_precios_id
     where c.organizacion_id = $1 and c.tipo = 'web_minorista' and c.estado <> 'archivado' order by c.id`, [s.org.id]);

  return (
    <Pantalla titulo="Tienda web" subtitulo="Lo que ve el comprador en la tienda: nombre, dirección, colores y datos de contacto" ancho="max-w-4xl">
      <Avisos sp={sp} />
      {tiendas.length === 0 && (
        <div className={CAJA}>
          <p className="text-xs mb-2">Todavía no hay ninguna tienda web (un canal tipo Web minorista).</p>
          <form action={accionCrearTienda}><button className={PRIMARIO}>Crear la tienda web</button></form>
          <p className="text-[11px] text-[#5C6B76] mt-1">Se crea pausada, con la lista de precios &quot;Web minorista&quot; si existe.</p>
        </div>
      )}
      {tiendas.map((t) => {
        const c = t.config ?? {};
        const slug = c.slug || slugDe(t.nombre);
        const direccion = `${base}/tienda/${slug}`;
        const est = ESTADOS[t.estado] ?? { texto: t.estado, tono: "gris" as const };
        return (
          <section key={t.id} className="mb-6">
            {tiendas.length > 1 && <h2 className="text-sm font-bold mb-2">{t.nombre}</h2>}
            <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 text-xs`}>
              <div><span className={ETIQUETA}>Dirección de la tienda</span>
                <a href={direccion} target="_blank" rel="noopener" className="text-[#16577F] hover:underline break-all">{direccion}</a></div>
              <div><span className={ETIQUETA}>Estado</span><Estado texto={est.texto} tono={est.tono} />
                <Link href={`/config/canales?c=${t.id}`} className="block text-[11px] text-[#16577F] hover:underline mt-0.5">Cambiarlo en Canales</Link></div>
              <div><span className={ETIQUETA}>Lista de precios</span>{t.lista ?? <span className="text-[#C03420]">Sin lista</span>}
                <Link href={`/config/canales?c=${t.id}`} className="block text-[11px] text-[#16577F] hover:underline mt-0.5">Cambiarla en Configuración → Canales</Link></div>
              <div className="sm:col-span-2"><span className={ETIQUETA}>Feed para Meta (Facebook / Instagram)</span>
                <a href={`${direccion}/feed.xml`} target="_blank" rel="noopener" className="text-[#16577F] hover:underline break-all">{direccion}/feed.xml</a>
                <span className="block text-[11px] text-[#5C6B76]">Cargalo en Meta Commerce Manager como fuente de datos programada.</span></div>
              <div><span className={ETIQUETA}>Vende el stock de</span>{t.depositos ?? <span className="text-[#C03420]">Ningún depósito: elegilos en Canales</span>}</div>
            </div>

            <form action={accionGuardarTienda} className={`${CAJA} grid grid-cols-1 sm:grid-cols-2 gap-3 items-start`}>
              <input type="hidden" name="canal_id" value={t.id} />
              <label><span className={ETIQUETA}>Nombre que ve el comprador</span>
                <input name="nombre" defaultValue={c.nombre ?? t.nombre} className={`${CAMPO} w-full`} /></label>
              <label><span className={ETIQUETA}>Dirección (slug)</span>
                <input name="slug" defaultValue={slug} className={`${CAMPO} w-full font-mono`} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
                <span className="block text-[11px] text-[#5C6B76] mt-0.5">Minúsculas, números y guiones: queda {base}/tienda/<b>{slug}</b></span></label>
              <label><span className={ETIQUETA}>Color de la marca</span>
                <input type="color" name="color" defaultValue={c.color ?? "#16577F"} className="h-8 w-14 rounded border border-[#E3E9F0]" /></label>
              <div><span className={ETIQUETA}>Productos sin stock</span>
                <span className="flex gap-3 text-xs py-1.5">
                  <label className="inline-flex items-center gap-1"><input type="radio" name="sin_stock" value="mostrar" defaultChecked={c.sin_stock !== "ocultar"} /> Mostrar (como &quot;sin stock&quot;)</label>
                  <label className="inline-flex items-center gap-1"><input type="radio" name="sin_stock" value="ocultar" defaultChecked={c.sin_stock === "ocultar"} /> Ocultar</label>
                </span></div>
              <div><span className={ETIQUETA}>Logo</span>
                <SubirImagen name="logo" valor={c.logo ?? null} organizacionId={s.org.id} etiqueta="Logo" /></div>
              <div><span className={ETIQUETA}>Banner (la imagen grande de arriba)</span>
                <SubirImagen name="banner" valor={c.banner ?? null} organizacionId={s.org.id} etiqueta="Banner" alto="h-24" /></div>
              <label className="sm:col-span-2"><span className={ETIQUETA}>Bajada (el texto sobre el banner)</span>
                <input name="bajada" defaultValue={c.bajada ?? ""} placeholder="Ej. Envíos a todo el país" className={`${CAMPO} w-full`} /></label>
              <label><span className={ETIQUETA}>WhatsApp</span>
                <input name="whatsapp" defaultValue={c.whatsapp ?? ""} inputMode="numeric" placeholder="5493511234567" className={`${CAMPO} w-full`} />
                <span className="block text-[11px] text-[#5C6B76] mt-0.5">Formato internacional, sin + ni espacios: 54 9, la característica sin 0 y el número sin 15.</span></label>
              <label><span className={ETIQUETA}>Mail</span>
                <input name="email" type="email" defaultValue={c.email ?? ""} className={`${CAMPO} w-full`} /></label>
              <label><span className={ETIQUETA}>Dirección del local</span>
                <input name="direccion" defaultValue={c.direccion ?? ""} className={`${CAMPO} w-full`} /></label>
              <label><span className={ETIQUETA}>Horario</span>
                <input name="horario" defaultValue={c.horario ?? ""} placeholder="Lun a vie de 9 a 18" className={`${CAMPO} w-full`} /></label>
              <div className="sm:col-span-2"><button className={VERDE}>Guardar</button></div>
            </form>
          </section>
        );
      })}
    </Pantalla>
  );
}
