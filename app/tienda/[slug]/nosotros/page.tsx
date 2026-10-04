// Sobre nosotros: el texto lo carga la tienda en Configuración → Tienda web
// ("Sobre nosotros"); sin texto, una presentación con los datos que ya tiene.

import type { Metadata } from "next";
import { cargarTienda } from "../catalogo";
import { DatosProveedor, PaginaLegal, proveedorDe } from "../legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sobre nosotros" };

export default async function Nosotros({ params }: { params: Promise<{ slug: string }> }) {
  const t = await cargarTienda((await params).slug);
  const p = await proveedorDe(t);
  const texto = t.config.sobre_nosotros?.trim();
  return (
    <PaginaLegal titulo={`Sobre ${p.nombre}`}>
      {texto
        ? texto.split(/\n{2,}/).map((x, i) => <p key={i} className="whitespace-pre-line">{x}</p>)
        : <p>Somos {p.nombre}, una tienda online argentina. Trabajamos para que comprar sea simple: productos con stock real, precios claros, envíos a todo el país y atención personalizada antes y después de tu compra.</p>}
      {t.config.bajada && <p className="font-semibold">{t.config.bajada}</p>}
      <h2>Quiénes somos</h2>
      <DatosProveedor p={p} />
      {t.config.horario && <p><b>Horario de atención:</b> {t.config.horario}</p>}
    </PaginaLegal>
  );
}
