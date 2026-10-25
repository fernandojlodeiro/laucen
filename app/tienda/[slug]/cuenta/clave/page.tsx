// Elegir una contraseña nueva desde el link del mail de «Olvidé mi contraseña» (lib/tienda/cuentas.ts).

import type { Metadata } from "next";
import Link from "next/link";
import { rutaTienda } from "@/lib/tienda/tienda";
import { cargarTienda } from "../../catalogo";
import { AvisosUrl, BOTON, BOTON_SUAVE, CAMPO, ETIQUETA, TITULO } from "../../piezas";
import { cambiarClaveAccion } from "../../acciones";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contraseña nueva", robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ClaveNueva({ params, searchParams }: Props) {
  const t = await cargarTienda((await params).slug);
  const sp = await searchParams;
  const codigo = typeof sp.c === "string" ? sp.c : "";
  return (
    <div className="mx-auto max-w-md space-y-5 rounded-md bg-white p-6 shadow-[0_1px_2px_0_rgba(0,0,0,.12)] sm:p-10">
      <h1 className={TITULO}>Elegí tu contraseña nueva</h1>
      <AvisosUrl sp={sp} />
      <form action={cambiarClaveAccion} className="space-y-4">
        <input type="hidden" name="slug" value={t.slug} />
        <input type="hidden" name="c" value={codigo} />
        <div>
          <label htmlFor="clave" className={ETIQUETA}>Contraseña nueva (8 caracteres o más)</label>
          <input id="clave" name="clave" type="password" autoComplete="new-password" minLength={8} required className={CAMPO} />
        </div>
        <div>
          <label htmlFor="repetir" className={ETIQUETA}>Repetila</label>
          <input id="repetir" name="repetir" type="password" autoComplete="new-password" minLength={8} required className={CAMPO} />
        </div>
        <button type="submit" className={`${BOTON} w-full`}>Guardar y entrar</button>
      </form>
      <Link href={rutaTienda(t, "/cuenta?modo=olvide")} className={`${BOTON_SUAVE} w-full`}>Pedir otro link</Link>
    </div>
  );
}
