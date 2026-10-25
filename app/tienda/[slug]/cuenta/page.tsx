// Mi cuenta: sin sesión, ingresar (mail + contraseña), «Olvidé mi contraseña» y «Crear cuenta» (las dos
// por un link al mail; Fer, 25/10); con sesión, mis pedidos de esta tienda y "Salir".

import { marcaDeTiempo, turnstileDe } from "@/lib/tienda/antibot";
import Antibot from "../Antibot";
import type { Metadata } from "next";
import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatear, type Moneda } from "@/lib/moneda";
import { cuentaActual } from "@/lib/tienda/cuentas";
import { rutaTienda } from "@/lib/tienda/tienda";
import { cargarTienda, estadoCriollo } from "../catalogo";
import { AvisosUrl, BOTON, BOTON_SUAVE, CAMPO, ETIQUETA, TITULO } from "../piezas";
import { ingresarAccion, salirAccion, registroAccion, recuperarAccion } from "../acciones";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Cuenta({ params, searchParams }: Props) {
  const t = await cargarTienda((await params).slug);
  const sp = await searchParams;
  const cuenta = await cuentaActual(t);

  if (!cuenta) {
    const modo = typeof sp.modo === "string" ? sp.modo : "";
    const antibot = <Antibot marca={await marcaDeTiempo()} siteKey={await turnstileDe(t.organizacionId)} />;
    const Caja = ({ children }: { children: React.ReactNode }) => (
      <div className="mx-auto max-w-md space-y-5 rounded-md bg-white p-6 shadow-[0_1px_2px_0_rgba(0,0,0,.12)] sm:p-10">{children}</div>
    );
    const ir = (m: string) => rutaTienda(t, `/cuenta${m ? `?modo=${m}` : ""}`);
    // Mandamos el mail (crear cuenta u olvidé la contraseña): siempre el mismo texto, tenga o no cuenta ese mail.
    if (modo === "revisa") {
      const mail = typeof sp.mail === "string" ? sp.mail : "";
      return (
        <Caja>
          <h1 className={TITULO}>Revisá tu mail</h1>
          <p className="text-gray-700">
            Te mandamos un mail{mail ? <> a <b>{mail}</b></> : null} con un link para {sp.para === "clave" ? "elegir una contraseña nueva (vale una hora)" : "confirmar tu mail y terminar de crear tu cuenta (vale 24 horas)"}.
          </p>
          <p className="text-sm text-gray-500">Si no lo ves en unos minutos, fijate en «Correo no deseado» o «Promociones».</p>
          <Link href={ir("")} scroll={false} className={`${BOTON_SUAVE} w-full`}>Volver a ingresar</Link>
        </Caja>
      );
    }
    if (modo === "crear") {
      return (
        <Caja>
          <h1 className={TITULO}>Crear tu cuenta</h1>
          <AvisosUrl sp={sp} />
          <form action={registroAccion} className="space-y-4">
            <input type="hidden" name="slug" value={t.slug} />
            <div>
              <label htmlFor="nombre" className={ETIQUETA}>Nombre y apellido</label>
              <input id="nombre" name="nombre" autoComplete="name" required className={CAMPO} />
            </div>
            <div>
              <label htmlFor="email" className={ETIQUETA}>Mail</label>
              <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className={CAMPO} />
            </div>
            <div>
              <label htmlFor="clave" className={ETIQUETA}>Contraseña (8 caracteres o más)</label>
              <input id="clave" name="clave" type="password" autoComplete="new-password" minLength={8} required className={CAMPO} />
            </div>
            {antibot}
            <button type="submit" className={`${BOTON} w-full`}>Crear cuenta</button>
          </form>
          <p className="text-sm text-gray-500">Te vamos a mandar un mail para confirmar que es tuyo.</p>
          <Link href={ir("")} scroll={false} className={`${BOTON_SUAVE} w-full`}>Ya tengo cuenta: ingresar</Link>
        </Caja>
      );
    }
    if (modo === "olvide") {
      return (
        <Caja>
          <h1 className={TITULO}>¿Olvidaste tu contraseña?</h1>
          <AvisosUrl sp={sp} />
          <p className="text-gray-700">Escribí el mail de tu cuenta y te mandamos un link para elegir una nueva.</p>
          <form action={recuperarAccion} className="space-y-4">
            <input type="hidden" name="slug" value={t.slug} />
            <div>
              <label htmlFor="email" className={ETIQUETA}>Mail</label>
              <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className={CAMPO} />
            </div>
            {antibot}
            <button type="submit" className={`${BOTON} w-full`}>Mandarme el link</button>
          </form>
          <Link href={ir("")} scroll={false} className={`${BOTON_SUAVE} w-full`}>Volver a ingresar</Link>
        </Caja>
      );
    }
    return (
      <Caja>
        <h1 className={TITULO}>Ingresá tu mail y contraseña</h1>
        <AvisosUrl sp={sp} />
        <form action={ingresarAccion} className="space-y-4">
          <input type="hidden" name="slug" value={t.slug} />
          {sp.volver === "checkout" && <input type="hidden" name="volver" value="checkout" />}
          <div>
            <label htmlFor="email" className={ETIQUETA}>Mail</label>
            <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className={CAMPO} />
          </div>
          <div>
            <label htmlFor="clave" className={ETIQUETA}>Contraseña</label>
            <input id="clave" name="clave" type="password" autoComplete="current-password" required className={CAMPO} />
          </div>
          {antibot}
          <button type="submit" className={`${BOTON} w-full`}>Ingresar</button>
        </form>
        <Link href={ir("olvide")} scroll={false} className={`${BOTON_SUAVE} w-full`}>Olvidé mi contraseña</Link>
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-sm text-gray-500">¿No tenés cuenta? Se crea en un clic después de tu primera compra, o ahora:</p>
          <Link href={ir("crear")} scroll={false} className={`${BOTON_SUAVE} w-full`}>Crear cuenta</Link>
        </div>
        {sp.volver === "checkout" && <Link href={rutaTienda(t, "/checkout")} className={`${BOTON_SUAVE} w-full`}>Seguir sin cuenta</Link>}
      </Caja>
    );
  }

  const pedidos = await consulta<{ id: number; codigo: string; fecha: string; estado: string; estado_pago: string; metodo_tipo: string | null; moneda: Moneda; total: string; unidades: number }>(`
    select p.id::int, p.codigo_seguimiento codigo, to_char(p.fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY') fecha,
           p.estado, p.estado_pago, me.tipo metodo_tipo, p.moneda, case when p.moneda = 'USD' then p.total_usd else p.total_ars end total,
           (select coalesce(sum(cantidad), 0)::int from pedido_linea where pedido_id = p.id) unidades
      from pedido p left join metodo_envio me on me.id = p.metodo_envio_id
     where p.organizacion_id = $1 and p.canal_id = $2 and p.cliente_id = $3 and p.codigo_seguimiento is not null
     order by p.fecha desc limit 100`, [t.organizacionId, t.canalId, cuenta.clienteId]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={TITULO}>Hola, {cuenta.nombre.split(" ")[0]}</h1>
          <p className="text-sm text-gray-500">{cuenta.email}</p>
        </div>
        <form action={salirAccion}>
          <input type="hidden" name="slug" value={t.slug} />
          <button type="submit" className={BOTON_SUAVE}>Salir</button>
        </form>
      </div>
      <AvisosUrl sp={sp} />
      <h2 className="text-lg font-bold">Mis pedidos</h2>
      {pedidos.length ? (
        <ul className="divide-y divide-gray-100 rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)]">
          {pedidos.map((p) => {
            const e = estadoCriollo(p.estado, p.estado_pago, p.metodo_tipo);
            return (
              <li key={p.id}>
                <Link href={rutaTienda(t, `/pedido/${p.codigo}`)} className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50">
                  <span>
                    <span className="block font-semibold">Pedido #{p.id}</span>
                    <span className="block text-sm text-gray-500">{p.fecha} · {p.unidades === 1 ? "1 producto" : `${p.unidades} productos`}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{formatear(p.total, p.moneda)}</span>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${e.color}`}>{e.texto}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-md bg-white shadow-[0_1px_2px_0_rgba(0,0,0,.12)] px-4 py-10 text-center text-gray-500">
          Todavía no tenés pedidos. <Link href={rutaTienda(t, "/buscar")} className="font-semibold text-[var(--boton)] hover:underline">Ver productos</Link>
        </div>
      )}
    </div>
  );
}
