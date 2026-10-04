// Dashboard › Relevamiento completo: el tablero con todos los datos de las
// cuentas de Mercado Libre, la web y el resto (ver Tablero.tsx).

import { SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos } from "@/app/componentes/erp";
import { actualizarReputaciones } from "@/lib/mercadolibre/reputacion";
import { consulta } from "@/lib/erp/base";
import { Tablero } from "./Tablero";
import { accionActualizarReputacion } from "./acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relevamiento completo" };

type SP = { ok?: string; error?: string };

const haceCuanto = (d: Date | string | null) => {
  if (!d) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};

export default async function Relevamiento({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tablero_ml_ver");
  const sp = await searchParams;
  const org = s.org.id;
  // La reputación se vuelve a leer sola si tiene más de una hora (un tope de 8 s: si ML demora, se muestra lo guardado).
  await Promise.race([actualizarReputaciones(org).catch(() => 0), new Promise((ok) => setTimeout(ok, 8000))]);
  const [ult] = await consulta<{ ts: Date | null }>("select max(reputacion_ts) ts from meli_cuenta where organizacion_id = $1", [org]);

  return (
    <Pantalla titulo="Relevamiento completo" ancho="max-w-[2200px]"
      subtitulo={<>Todas tus cuentas de Mercado Libre, la web y el resto en una pantalla · reputación leída {haceCuanto(ult?.ts ?? null)}</>}
      acciones={<form action={accionActualizarReputacion}><BotonEnviar clase={SUAVE} corriendo="Preguntando a Mercado Libre…">Actualizar reputación</BotonEnviar></form>}>
      <Avisos sp={sp} />
      <Tablero org={org} modo="completo" />
    </Pantalla>
  );
}
