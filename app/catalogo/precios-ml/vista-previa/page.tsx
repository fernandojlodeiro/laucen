// Vista previa de los precios en Mercado Libre: por publicación de una cuenta,
// la Clásica, el tachado, el plan, el precio calculado, el precio para ganar
// (si se leyó), el precio actual en ML, la diferencia y qué cambiaría; más las
// publicaciones de planes que faltan. "Preparar cambios" arma los lotes
// (precios y campañas, volumen, nuevas) que salen recién con el clic de Fer
// en la cola ("Mandar a Mercado Libre").

import Link from "next/link";
import { VERDE, SUAVE } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import BuscadorVivo, { FiltroVivo, CasillaViva } from "@/app/componentes/BuscadorVivo";
import { entrarErp, Pantalla, Avisos, url } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista } from "@/app/listas/piezas";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import { caminoDeFamilia } from "@/lib/erp/familias";
import { camposDe, elegir, ordenarFilas } from "@/lib/listas/tipos";
import { paginarEnMemoria } from "@/lib/lista";
import { BarraPml } from "../comun";
import { LISTA_PRECIOS_ML, ROLES, canalElegido, filasPrevia, filtrosPrevia } from "../lista";
import { accionPrepararCambios, accionCrearFaltantes } from "../acciones";
import { BotonTarea } from "@/app/componentes/TareasFondo";

export const dynamic = "force-dynamic";

type SP = { todas?: string; canal?: string; familia?: string; q?: string; contiene?: string; cambios?: string; rol?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function VistaPreviaPreciosMl({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ml_ver");
  const sp = await searchParams;
  const { canales, canal } = await canalElegido(s.org.id, sp);
  if (!canal) {
    return (
      <Pantalla titulo="Vista previa de precios en Mercado Libre">
        <p className="text-xs text-[#5C6B76]">Todavía no hay ningún canal de Mercado Libre. Crealo en <Link href="/config/canales" className="text-[#16577F] hover:underline">Configuración → Canales</Link>.</p>
      </Pantalla>
    );
  }
  const f = filtrosPrevia(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };
  const [todas, camino, todos] = await Promise.all([filasPrevia(s.org.id, sp), caminoDeFamilia(s.org.id, f.familia), camposDe(LISTA_PRECIOS_ML, ctx)]);
  const filas = paginarEnMemoria(ordenarFilas(todos, todas, sp), sp);
  const campos = elegir(LISTA_PRECIOS_ML, todos, null);
  const conCambio = todas.filter((x) => x.hay_cambio).length;
  const nuevas = todas.filter((x) => x.rol === "nueva").length;
  const conAviso = todas.filter((x) => x.avisos).length;
  const aqui = url("/catalogo/precios-ml/vista-previa", { canal: canal.id, familia: f.familia, q: f.q || null, contiene: f.comienza ? null : "1", cambios: f.cambios ? "1" : null, rol: f.rol || null, todas: f.todas ? "1" : null });

  return (
    <Pantalla titulo="Vista previa de precios en Mercado Libre" ancho="max-w-[1500px]"
      subtitulo="Qué precio tendría cada publicación con las reglas de la cuenta y qué cambiaría en ML. Nada sale de acá: «Preparar cambios» arma lotes que esperan tu clic en la cola."
      acciones={<>
        <AccionesExcel lista={LISTA_PRECIOS_ML} org={s.org.id} extra={{ canal: String(canal.id), ...(f.todas ? { todas: "1" } : {}) }} />
        {/* Las publicaciones de planes que le faltan a esta cuenta (Fer, 8/10): un lote que espera tu clic. */}
        {!f.todas && nuevas > 0 && <BotonTarea accion={accionCrearFaltantes} tipo={`planes-faltantes:${canal.id}`} clase={SUAVE}
          texto={`Crear los planes que faltan (${nuevas.toLocaleString("es-AR")})`}
          pregunta={`¿Armar el lote con las ${nuevas.toLocaleString("es-AR")} publicaciones de planes que le faltan a ${canal.nombre}${f.familia || f.q ? " (las del filtro)" : ""}? No sale nada hasta tu clic.`}
          campos={{ canal: String(canal.id), familia: f.familia ? String(f.familia) : "", q: f.q ?? "", contiene: f.comienza ? "" : "1" }} />}
        <BotonConfirmar accion={accionPrepararCambios} clase={VERDE} texto="Preparar cambios" corriendo="Preparando…"
          pregunta={`¿Preparar los cambios de ${conCambio.toLocaleString("es-AR")} publicaciones${f.todas ? " de todas las cuentas" : ""}${f.familia || f.q ? " (las del filtro)" : ""}? No sale nada hasta tu clic.`}
          campos={{ canal: String(canal.id), todas: f.todas ? "1" : "", familia: f.familia ? String(f.familia) : "", q: f.q, contiene: f.comienza ? "" : "1", volver: aqui }} />
      </>}>
      <Avisos sp={sp} />
      <BarraPml org={s.org.id} canales={canales} canal={canal} ver="previa" todas={f.todas} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q} comienza={f.comienza} placeholder="Buscar por SKU, producto o publicación" />
        <ElegirFamilia parametro="familia" valor={f.familia} etiqueta={camino} vacio="Todas las categorías" placeholder="Buscá la categoría…" className="w-72" limpiar={["p"]} />
        <FiltroVivo parametro="rol" valor={f.rol} etiqueta="Papel">
          <option value="">Todos los papeles</option>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
        <CasillaViva parametro="cambios" activo={f.cambios} etiqueta="Sólo las que cambian" />
      </div>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        {todas.length.toLocaleString("es-AR")} filas · <b>{conCambio.toLocaleString("es-AR")} con cambios</b>{nuevas ? ` (${nuevas.toLocaleString("es-AR")} publicaciones nuevas de planes)` : ""}{conAviso ? ` · ${conAviso.toLocaleString("es-AR")} con avisos` : ""}.
        {f.todas ? "Todas las cuentas juntas. " : ""}Precios como los ve el comprador: grande lo que paga, chico y tachado el publicado, con su % OFF.
      </p>
      <TablaVista lista={LISTA_PRECIOS_ML} campos={campos} filas={filas} total={todas.length} ctx={{ moneda: s.moneda, sp }}
        vacio={f.q || f.familia || f.cambios || f.rol || f.todas ? "Nada coincide con el filtro." : "Esta cuenta no tiene publicaciones vinculadas (Catálogo → Vincular con Mercado Libre)."}
        claseFila={(x) => (x.hay_cambio ? "bg-[#FFFDF5]" : "")} />
      <p className="text-[11px] text-[#5C6B76] mt-1">
        Los lotes salen en tres partes: precios y campañas (primero sale de las campañas a otro precio, cambia el precio y vuelve a entrar con la Clásica), descuento por volumen y publicaciones nuevas de los planes que faltan.
        Ojo: el rango de precio que acepta cada campaña lo calcula ML sobre el precio actual; si cambia mucho el precio, alguna puede rechazar la entrada (queda «Con error» en la cola).
      </p>
    </Pantalla>
  );
}
