// El link del mail de «Crear cuenta» (lib/tienda/cuentas.ts): crea la cuenta, abre la sesión y lleva a Mi cuenta.

import { NextResponse } from "next/server";
import { cargarTienda } from "../../catalogo";
import { urlTienda } from "@/lib/tienda/dominios-tienda";
import { confirmarRegistro } from "@/lib/tienda/cuentas";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const codigo = new URL(req.url).searchParams.get("c") ?? "";
  const ok = codigo ? await confirmarRegistro(t, codigo).catch((e) => { console.error("[cuenta] confirmar", e); return false; }) : false;
  const aviso = ok ? "ok=" + encodeURIComponent("¡Listo! Ya tenés tu cuenta.") : "error=" + encodeURIComponent("El link venció o ya se usó. Si ya confirmaste, ingresá con tu mail y contraseña.");
  return NextResponse.redirect(await urlTienda(t, `/cuenta?${aviso}`));
}
