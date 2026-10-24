// Catálogo › Seguimientos › Propuestas pendientes (pedido de Fer, 23/10): todo lo que la regla de precio (en modo
// «Proponer») dejó esperando «Aplicar», en una sola lista, para aplicar o descartar producto por producto o todo junto.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import FotosProducto from "@/app/componentes/FotosProducto";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { entrarErp, Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { formatearNumero } from "@/lib/numeros";
import { fechaHora } from "@/app/ventas/formato";
import { accionAplicarPropuesta, accionDescartarPropuesta } from "@/app/catalogo/productos/acciones-seguimiento";
import { accionAplicarTodas, accionDescartarTodas } from "./acciones";

export const dynamic = "force-dynamic";

const pesos = (n: number) => `$ ${formatearNumero(Math.round(n), "pesos")}`;

type Fila = { producto_id: number; sku_base: string; titulo: string; fotos: string[] | null; sku: string; antes: number; nuevo: number; referencia: string | null; ts: Date; piso: number | null };

export default async function Propuestas({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("productos_ver");
  const sp = await searchParams;
  const filas = await consulta<Fila>(`
    select a.producto_id::int, p.sku_base, p.titulo, (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = p.id) fotos,
           v.sku, a.antes_ars::float8 antes, a.nuevo_ars::float8 nuevo, a.referencia, a.ts, r.piso::float8 piso
      from seguimiento_ajuste a join producto p on p.id = a.producto_id join variacion v on v.id = a.variacion_id
      left join seguimiento_regla r on r.organizacion_id = a.organizacion_id and r.producto_id = a.producto_id
     where a.organizacion_id = $1 and a.estado = 'propuesto'
     order by abs(a.nuevo_ars - a.antes_ars) / nullif(a.antes_ars, 0) desc, p.sku_base, v.sku`, [s.org.id]);
  const productos = new Set(filas.map((f) => f.producto_id)).size;
  const vistos = new Set<number>();

  return (
    <Pantalla titulo={`Propuestas pendientes (${productos})`} camino={[{ texto: "Propuestas pendientes" }]}
      subtitulo="Lo que la regla de precio (en «Proponer el cambio y esperar mi clic») dejó esperando: el cambio de la Clásica de cada producto. Aplicar cambia la lista Clásicas; desde ahí, el esquema de precios lo lleva a las cuentas y planes."
      acciones={productos > 0 ? <>
        <BotonTarea accion={accionAplicarTodas} tipo="seguimiento-propuestas" clase={PRIMARIO} texto={`Aplicar todas (${productos})`}
          pregunta={`¿Cambiar la Clásica de los ${productos} productos?`} />
        <BotonTarea accion={accionDescartarTodas} tipo="seguimiento-propuestas" clase={SUAVE} texto="Descartar todas" pregunta="¿Descartar todas las propuestas?" />
      </> : null}>
      <Avisos sp={sp} />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Producto</th><th className={THN} title="La Clásica de hoy">Clásica</th><th className={THN}>Propuesta</th>
              <th className={THN}>Cambio</th><th className={THN} title="La regla nunca baja de acá">Piso</th><th className={TH}>Contra quién</th>
              <th className={THN}>Desde</th><th /></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>No hay propuestas esperando.</td></tr>}
            {filas.map((f, i) => {
              const primera = !vistos.has(f.producto_id);
              vistos.add(f.producto_id);
              const d = f.nuevo - f.antes, pct = f.antes ? (d / f.antes) * 100 : 0;
              return (
                <tr key={i} className={TR}>
                  <td className={`${TD} max-w-80`}>
                    <span className="inline-flex items-center gap-2 align-middle">
                      <FotosProducto fotos={f.fotos} titulo={f.titulo} />
                      <Link href={`/catalogo/productos/${f.producto_id}?seccion=seguimiento`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{f.sku}</Link>
                    </span>
                    <span className="block text-[10px] text-[#5C6B76] line-clamp-2" title={f.titulo}>{f.titulo}</span>
                  </td>
                  <td className={TDN}>{pesos(f.antes)}</td>
                  <td className={`${TDN} font-semibold`}>{pesos(f.nuevo)}</td>
                  <td className={`${TDN} whitespace-nowrap ${d < 0 ? "text-[#C03420]" : "text-[#1F6E4A]"}`}>
                    {d < 0 ? "▼" : "▲"} {pesos(Math.abs(d))} <span className="block text-[10px]">{Math.abs(pct).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %</span>
                  </td>
                  <td className={TDN}>{f.piso != null ? pesos(f.piso) : "—"}</td>
                  <td className={`${TD} text-[11px] max-w-56`}>{f.referencia ?? "—"}</td>
                  <td className={`${TDN} whitespace-nowrap text-[11px]`}>{fechaHora(f.ts)}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {primera && (
                      <span className="inline-flex gap-1">
                        <form action={accionAplicarPropuesta}><input type="hidden" name="producto_id" value={f.producto_id} /><input type="hidden" name="volver" value="propuestas" /><button className={PRIMARIO}>Aplicar</button></form>
                        <form action={accionDescartarPropuesta}><input type="hidden" name="producto_id" value={f.producto_id} /><input type="hidden" name="volver" value="propuestas" /><button className={SUAVE}>Descartar</button></form>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
