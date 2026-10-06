// Informe: Promociones de Mercado Libre (Fer, 5/10: "controlar todas las promociones; que todo quede registrado
// en Laucen"). Qué campañas hay en cada cuenta, qué publicaciones están adentro y a qué precio, y la HISTORIA de cada
// cambio (una campaña que empieza o termina, una publicación que entra, sale o cambia de precio). Es lo que explica
// por qué cambió un precio. La lectura de ML es sólo de lectura y corre cada hora desde el barrido.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { consultaPaginada } from "@/lib/lista";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import RangoFechas from "@/app/componentes/RangoFechas";
import Pestanas from "@/app/componentes/Pestanas";
import { BotonEnviar } from "@/app/radar/Cliente";
import { SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, url } from "@/app/componentes/erp";
import { AccionesExcel, TablaVista } from "@/app/listas/piezas";
import { camposDe, elegir, ordenDe, seleccion, type Fila } from "@/lib/listas/tipos";
import { Desplegable } from "../Filtros";
import { BASE_PROMOS, LISTA_PROMO_CAMPANAS, LISTA_PROMO_HISTORIA, LISTA_PROMO_PUBLICACIONES, filtrosPromos } from "./lista";
import { TIPOS_PROMO } from "./formato";
import { accionLeerPromociones } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SP = Record<string, string | undefined>;

export default async function Promociones({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_publicaciones_ver");
  const sp = await searchParams;
  const f = filtrosPromos(sp);
  const LISTA = f.ver === "campanas" ? LISTA_PROMO_CAMPANAS : f.ver === "publicaciones" ? LISTA_PROMO_PUBLICACIONES : LISTA_PROMO_HISTORIA;
  const ctx = { org: s.org.id, moneda: s.moneda };
  const todos = await camposDe(LISTA, ctx);
  const campos = elegir(LISTA, todos, LISTA.enPantalla);
  const [base, canales, tipos, cuentas, campana] = await Promise.all([
    LISTA.consulta!(ctx, sp),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre' order by nombre", [s.org.id]),
    consulta<{ tipo: string }>("select distinct tipo from ml_promo_campana where organizacion_id = $1 order by 1", [s.org.id]),
    consulta<{ campanas: number; en_curso: number; historia: number; ultima: Date | null }>(`
      select (select count(*) from ml_promo_campana where organizacion_id = $1 and estado in ('started', 'pending', 'programmed'))::int campanas,
             (select count(*) from ml_promo_item where organizacion_id = $1 and estado in ('started', 'pending'))::int en_curso,
             (select count(*) from ml_promo_historia where organizacion_id = $1)::int historia,
             (select max(leido_ts) from ml_promo_campana where organizacion_id = $1) ultima`, [s.org.id]),
    f.promo ? consulta<{ nombre: string | null; tipo: string; canal: string }>(
      "select c.nombre, c.tipo, ca.nombre canal from ml_promo_campana c join canal ca on ca.id = c.canal_id where c.organizacion_id = $1 and c.promocion_id = $2 limit 1", [s.org.id, f.promo]) : Promise.resolve([]),
  ]);
  const { filas, total } = await consultaPaginada<Fila>({
    campos: seleccion(campos, todos, LISTA.siempre), desde: base.desde, donde: base.donde, orden: ordenDe(todos, sp, base.orden),
  }, base.valores, sp);
  const n = cuentas[0];
  const quitarPromo = url(BASE_PROMOS, { ver: f.ver === "historia" ? "historia" : f.ver, canal: f.canal || null, q: f.q || null });

  return (
    <Pantalla titulo="Promociones de ML"
      subtitulo="Las campañas de cada cuenta de Mercado Libre, qué publicaciones están adentro y a qué precio, y la historia de cada cambio. Laucen lee de Mercado Libre cada hora y anota lo que cambia: la historia arranca el 5/10/2026."
      acciones={
        <span className="inline-flex flex-wrap items-center gap-2">
          <AccionesExcel lista={LISTA} org={s.org.id} />
          <form action={accionLeerPromociones}>
            <BotonEnviar clase={SUAVE} corriendo="Leyendo Mercado Libre… (puede tardar unos minutos)">Leer ahora de Mercado Libre</BotonEnviar>
          </form>
          <form action={accionLeerPromociones}>
            <input type="hidden" name="historial" value="1" />
            <BotonEnviar clase={SUAVE} corriendo="Trayendo el historial… (puede tardar unos minutos)">Traer historial de campañas</BotonEnviar>
          </form>
        </span>
      }>
      <Avisos sp={sp} />
      <Pestanas items={[
        { clave: "historia", href: url(BASE_PROMOS, { ver: "historia" }), texto: "Historia", cuenta: n?.historia ?? 0, activa: f.ver === "historia" },
        { clave: "publicaciones", href: url(BASE_PROMOS, { ver: "publicaciones" }), texto: "Publicaciones en promoción", cuenta: n?.en_curso ?? 0, activa: f.ver === "publicaciones" },
        { clave: "campanas", href: url(BASE_PROMOS, { ver: "campanas" }), texto: "Campañas", cuenta: n?.campanas ?? 0, activa: f.ver === "campanas" },
      ]} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q} comienza={f.comienza} placeholder={f.ver === "campanas" ? "Campaña o su número" : "Publicación (MLA…), SKU, título o campaña"} />
        {f.ver === "historia" && <RangoFechas desde={f.desde} hasta={f.hasta} />}
        <FiltroVivo parametro="canal" valor={f.canal ? String(f.canal) : ""} etiqueta="Cuenta">
          <option value="">Todas las cuentas</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="tipo" valor={f.tipo} etiqueta="Tipo de campaña">
          <option value="">Todos los tipos</option>
          {tipos.map((t) => <option key={t.tipo} value={t.tipo}>{TIPOS_PROMO[t.tipo] ?? t.tipo}</option>)}
        </FiltroVivo>
        {f.ver === "historia" && (
          <Desplegable parametro="grupo" etiqueta="Ver" valor={f.grupo}
            opciones={[{ valor: "", texto: "Todo" }, { valor: "campanas", texto: "Sólo cambios de campañas" }, { valor: "publicaciones", texto: "Sólo cambios de publicaciones" }, { valor: "precios", texto: "Sólo cambios de precio" }]} />
        )}
        {f.ver === "publicaciones" && (
          <Desplegable parametro="estado" etiqueta="Estado" valor={f.estado}
            opciones={[{ valor: "", texto: "Adentro de una campaña" }, { valor: "candidate", texto: "Pueden entrar" }, { valor: "todas", texto: "Todas" }]} />
        )}
        {f.ver === "campanas" && (
          <Desplegable parametro="estado" etiqueta="Estado" valor={f.estado}
            opciones={[{ valor: "", texto: "En curso o por empezar" }, { valor: "terminadas", texto: "Terminadas" }, { valor: "todas", texto: "Todas" }]} />
        )}
      </div>
      {f.promo && (
        <p className="text-xs mb-3 inline-flex items-center gap-2 rounded-lg bg-[#EEF3F8] border border-[#E3E9F0] px-3 py-1.5">
          Campaña {campana[0] ? `«${campana[0].nombre ?? f.promo}» (${TIPOS_PROMO[campana[0].tipo] ?? campana[0].tipo}, ${campana[0].canal})` : f.promo}
          <Link href={quitarPromo} className="text-[#16577F] font-semibold" aria-label="Quitar el filtro de campaña">×</Link>
        </p>
      )}
      <TablaVista lista={LISTA} campos={campos} filas={filas} total={total} ctx={{ moneda: s.moneda, sp }}
        vacio={f.ver === "historia"
          ? "No hay cambios de promociones anotados en esas fechas. La lectura de Mercado Libre corre cada hora; si todavía no corrió, apretá «Leer ahora de Mercado Libre»."
          : f.ver === "publicaciones" ? "No hay publicaciones con estos filtros. Si todavía no se leyó Mercado Libre, apretá «Leer ahora de Mercado Libre»."
          : "No hay campañas con estos filtros. Si todavía no se leyó Mercado Libre, apretá «Leer ahora de Mercado Libre»."} />
      <p className="text-[11px] text-[#5C6B76] mt-1">
        {n?.ultima ? `Última lectura de campañas: ${new Date(n.ultima).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}. ` : "Todavía no se leyó ninguna campaña. "}
        La historia anota cada vez que una campaña empieza, termina o cambia de fechas, y cada vez que una publicación entra, sale o cambia de precio o de estado en una campaña.
        «Traer historial de campañas» pide también las ya terminadas y las programadas que Mercado Libre todavía devuelva. Es sólo lectura: no cambia nada en Mercado Libre.
      </p>
    </Pantalla>
  );
}
