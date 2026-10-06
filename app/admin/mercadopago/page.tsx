// La aplicación de Mercado Pago de Laucen (herramienta interna, sólo el dueño
// del sistema): con ella cada organización conecta sus cuentas de Mercado
// Pago desde Configuración › Canales. Se cargan el Client ID y el Client
// Secret una vez; nunca se vuelven a mostrar (sólo si están cargados).

import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { VERDE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Estado, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { una } from "@/lib/erp/base";
import { urlVuelta } from "@/lib/mercadopago/conexion";
import { accionGuardarAppMp } from "./acciones";

export const dynamic = "force-dynamic";

export default async function AppMercadoPago({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await entrarErp("canales_ver");
  if (!(await sosVos())) redirect("/panel");
  const sp = await searchParams;
  const f = await una<{ actualizado_ts: Date }>("select actualizado_ts from plataforma_mp where id = 1");
  return (
    <Pantalla titulo="Aplicación de Mercado Pago" subtitulo="La aplicación de Mercado Pago con la que cada organización conecta sus cuentas desde Configuración › Canales." ancho="max-w-3xl"
      acciones={<button type="submit" form="app-mp" className={VERDE}>Grabar</button>}>
      <Avisos sp={sp} />
      <section className={`${CAJA} mb-4 text-xs grid gap-2`}>
        <div className="flex items-center gap-2">Estado: {f ? <Estado texto="Cargada" tono="verde" /> : <Estado texto="Sin cargar" tono="rojo" />}
          {f && <span className="text-[#5C6B76]">(última vez: {new Date(f.actualizado_ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })})</span>}</div>
        <p>En developers de Mercado Pago, en tu aplicación, cargá como <b>URL de redireccionamiento</b>:</p>
        <p className="font-mono bg-[#FAFBFC] border border-[#E3E9F0] rounded-lg px-2 py-1.5 select-all">{urlVuelta()}</p>
        <p>Después copiá de la aplicación el <b>Client ID</b> y el <b>Client Secret</b> (en "Credenciales de producción") y pegalos acá abajo. No se vuelven a mostrar.</p>
      </section>
      <form id="app-mp" action={accionGuardarAppMp} className={`${CAJA} grid gap-3 text-xs`}>
        <label><span className={ETIQUETA}>Client ID</span>
          <input name="client_id" autoComplete="off" inputMode="numeric" className={`${CAMPO} w-full font-mono`} required /></label>
        <label><span className={ETIQUETA}>Client Secret</span>
          <input name="client_secret" type="password" autoComplete="off" className={`${CAMPO} w-full font-mono`} required /></label>
      </form>
    </Pantalla>
  );
}
