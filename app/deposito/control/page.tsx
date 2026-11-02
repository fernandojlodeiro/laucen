// Control de stock en el celular (Fer, 29/10; lógica en lib/deposito/control.ts): de a un producto en una ubicación,
// primero lo de menos stock y lo de más plata en stock, con la foto grande y tres botones: «Está», «No está» y
// «A buscar». Dos tildes, prendidos de entrada: sin GENERAL ni A UBICAR, y sólo con publicación activa en ML.

import { entrarErp, Pantalla } from "@/app/componentes/erp";
import Pestanas from "@/app/componentes/Pestanas";
import { CasillaViva } from "@/app/componentes/BuscadorVivo";
import { una } from "@/lib/erp/base";
import { proximaTarjeta, pendientes, type FiltroCola } from "@/lib/deposito/control";
import Tarjeta from "./Tarjeta";

export const dynamic = "force-dynamic";

type SP = { lugar?: string; ml?: string };

export default async function ControlDeStock({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("control_stock");
  const sp = await searchParams;
  const f: FiltroCola = { sinLugar: sp.lugar !== "0", soloMl: sp.ml !== "0" };
  const [t, n, b] = await Promise.all([
    proximaTarjeta(s.org.id, s.usuario.id, f),
    pendientes(s.org.id, f),
    una<{ n: number }>("select count(*)::int n from control_stock where organizacion_id = $1 and buscando", [s.org.id]),
  ]);
  const filtros = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][]).toString();

  return (
    <Pantalla titulo="Control de stock" subtitulo="Andá a la ubicación y fijate si el producto está" ancho="max-w-2xl">
      <Pestanas items={[
        { href: `/deposito/control${filtros ? `?${filtros}` : ""}`, texto: "Por controlar", cuenta: n, activa: true },
        { href: "/deposito/control/a-buscar", texto: "A buscar", cuenta: b?.n ?? 0, activa: false },
      ]} />
      <div className="flex flex-wrap gap-x-4 mb-2">
        <CasillaViva parametro="lugar" activo={f.sinLugar} tildadaDeEntrada etiqueta="Sin GENERAL ni A UBICAR"
          ayuda="Deja afuera lo que no tiene una ubicación fija" />
        <CasillaViva parametro="ml" activo={f.soloMl} tildadaDeEntrada etiqueta="Sólo con publicación activa en Mercado Libre"
          ayuda="Deja afuera el stock que no se está vendiendo en Mercado Libre" />
      </div>
      <Tarjeta t={t} vacio="No queda nada por controlar con estos filtros. ¡Buen trabajo!" />
    </Pantalla>
  );
}
