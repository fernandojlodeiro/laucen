import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { corridas, usdDeClaude } from "@/lib/piloto/proceso";
import { POR_DEFECTO } from "@/lib/piloto/tipos";
import { hayClaude } from "@/lib/claude";
import { apifyToken } from "@/lib/apify";
import { SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { PRIMARIO } from "@/app/botones";
import { accionCrearPiloto } from "./actions";
import ExploradorCategorias from "@/app/componentes/ExploradorCategorias";

export const dynamic = "force-dynamic";
export const metadata = { title: "Piloto", robots: { index: false, follow: false } };

// Piloto (interno, sólo Fer): rastrillaje de Mercado Libre → China → juez.

const ESTADOS: Record<string, string> = { ml: "Mercado Libre", productos: "Caja, China y juez", listo: "Terminado" };

export default async function Pilotos({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  const lista = await corridas(sesion.org.id);
  // Los parámetros se precargan con los del último piloto.
  const ult = lista[0]?.parametros;
  const v = { ...POR_DEFECTO, ...(ult ?? {}) };
  const input = "border border-[#E3E9F0] rounded-lg px-3 py-2 text-sm w-full";
  const campo = (name: string, etiqueta: string, valor: number | null, ayuda?: string) => (
    <label className="grid gap-1 text-xs">
      {etiqueta}
      <input name={name} defaultValue={valor ?? ""} inputMode="decimal" className={input} />
      {ayuda && <span className="text-[11px] text-[#9AA7B3]">{ayuda}</span>}
    </label>
  );

  return (
    <main className="max-w-3xl mx-auto p-6">
      <Link href="/panel" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
      <h1 className="text-lg font-bold mb-1">Piloto: Mercado Libre → China → juez</h1>
      <p className="text-xs text-[#5C6B76] mb-4">
        Por cada categoría toma los productos más buscados (tendencias, gratis) y los más vendidos (listado de la categoría, con Apify),
        marca los campeones (están en los dos lados), estima la caja y el flete, los busca en 1688 y Alibaba y el juez elige el mejor candidato.
      </p>
      {(!apifyToken() || !hayClaude()) && (
        <p className="text-sm text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-4">
          Falta {!apifyToken() ? "APIFY_TOKEN" : "ANTHROPIC_API_KEY"} en Vercel.
        </p>
      )}

      {lista.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-bold mb-2">Pilotos</h2>
          <div className="border border-[#E3E9F0] rounded-lg bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[#5C6B76] border-b border-[#E3E9F0]">
                <tr><th className="px-3 py-2">#</th><th className="py-2">Categorías</th><th className="py-2 px-2">Estado</th><th className="py-2 px-2">Productos</th><th className="py-2 px-2">Costo</th></tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 border-[#E3E9F0] align-top">
                    <td className="px-3 py-2"><Link href={`/admin/piloto/${c.id}`} className="text-[#16577F] underline">#{c.id}</Link></td>
                    <td className="py-2">{c.parametros.categorias.map((x) => x.ruta.split(" › ").pop()).join(", ")}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{ESTADOS[c.estado] ?? c.estado}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{c.listos}/{c.productos}</td>
                    <td className="py-2 px-2 whitespace-nowrap">US$ {((c.costos.apifyUsd ?? 0) + usdDeClaude(c.costos)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-bold mb-2">Nuevo piloto</h2>
        {sp.error === "categorias" && <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-3">Elegí al menos una categoría.</p>}
        <form action={accionCrearPiloto} className="grid gap-4 bg-white border border-[#E3E9F0] rounded-lg p-4">
          <ExploradorCategorias modo="elegir" />
          <fieldset className="grid sm:grid-cols-2 gap-3">
            <legend className="text-xs font-bold mb-1">Mercado Libre</legend>
            {campo("precioMin", "Precio de venta desde ($)", v.precioMin)}
            {campo("precioMax", "Precio de venta hasta ($)", v.precioMax)}
            {campo("porCategoria", "Productos por lado y por categoría", v.porCategoria, "3 más buscados + 3 más vendidos")}
            {campo("listado", "Publicaciones a leer del listado de cada categoría", v.listado)}
          </fieldset>
          <fieldset className="grid gap-3">
            <legend className="text-xs font-bold mb-1">Flete</legend>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2">
                <input type="radio" name="modo" value="barco" defaultChecked={v.modo !== "avion"} /> Productos para traer en <b>barco</b>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="modo" value="avion" defaultChecked={v.modo === "avion"} /> Productos para traer en <b>avión</b>
              </label>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {campo("fleteM3Usd", "Barco: flete por m³ (US$)", v.fleteM3Usd, "o por tonelada si pesa más (1 m³ = 1.000 kg)")}
              {campo("fleteKgUsd", "Avión: flete por kilo (US$)", v.fleteKgUsd, "peso real o volumétrico (cm³ ÷ 6.000), lo que dé más")}
              {campo("dolar", "Dólar ($)", v.dolar)}
              {campo("seguroPct", "Entra seguro (% del precio)", v.seguroPct, "Barco: desde este % para arriba. Avión: hasta este %.")}
              {campo("grisPct", "Zona gris (% del precio)", v.grisPct, "Barco: entre este % y el seguro. Avión: entre el seguro y este %. Se busca marcado.")}
            </div>
            <p className="text-[11px] text-[#5C6B76]">
              El flete se calcula sobre la caja que estima Claude, como % del precio de venta. Lo que queda fuera de la zona gris no se busca en China.
            </p>
          </fieldset>
          <fieldset className="grid sm:grid-cols-3 gap-3">
            <legend className="text-xs font-bold mb-1">China y juez</legend>
            {campo("yuanPorDolar", "Yuanes por dólar", v.yuanPorDolar)}
            {campo("minimoMax", "Pedido mínimo razonable (unidades)", v.minimoMax)}
            {campo("topeApifyUsd", "Tope de gasto de Apify (US$)", v.topeApifyUsd)}
          </fieldset>
          <div><BotonEnviar clase={PRIMARIO} corriendo="Creando…">Crear piloto</BotonEnviar></div>
        </form>
      </section>
    </main>
  );
}
