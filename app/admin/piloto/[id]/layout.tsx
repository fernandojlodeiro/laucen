import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { pool } from "@/db";
import { corrida, usdDeClaude } from "@/lib/piloto/proceso";
import { SUAVE } from "@/app/botones";
import { Pestanas } from "@/app/radar/Cliente";
import { accionAvanzar } from "../actions";
import { Procesar } from "../Cliente";

export default async function LayoutPiloto({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const { id } = await params;
  const c = await corrida(Number(id), sesion.org.id);
  if (!c) notFound();
  const p = c.parametros;
  const etapas = await pool.query<{ etapa: string; n: number }>("select etapa, count(*)::int n from piloto_productos where corrida_id = $1 group by etapa", [c.id]);
  const n = Object.fromEntries(etapas.rows.map((r) => [r.etapa, r.n]));
  const total = etapas.rows.reduce((t, r) => t + r.n, 0);
  const catsHechas = p.categorias.filter((x) => c.avance[x.id]?.hecho).length;
  const claudeUsd = usdDeClaude(c.costos);
  const apifyUsd = c.costos.apifyUsd ?? 0;
  const tok = Object.values(c.costos.claude ?? {}).reduce((t, x) => ({ in: t.in + x.in, out: t.out + x.out }), { in: 0, out: 0 });
  const rango = `${p.precioMin != null ? `$${p.precioMin.toLocaleString("es-AR")}` : "sin mínimo"} a ${p.precioMax != null ? `$${p.precioMax.toLocaleString("es-AR")}` : "sin máximo"}`;

  return (
    <main className="max-w-5xl mx-auto p-6">
      <Link href="/admin/piloto" className={`inline-block mb-2 ${SUAVE}`}>← Pilotos</Link>
      <h1 className="text-lg font-bold mb-1">Piloto #{c.id}</h1>
      <p className="text-xs text-[#5C6B76] mb-1">
        {p.categorias.length} categorías · precio {rango} · {p.porCategoria} por lado · {p.modo === "avion" ? `avión US$ ${p.fleteKgUsd}/kg · seguro hasta ${p.seguroPct}%, gris hasta ${p.grisPct}%` : `barco US$ ${p.fleteM3Usd}/m³ · seguro desde ${p.seguroPct}%, gris desde ${p.grisPct}%`} · dólar ${p.dolar} ·
        pedido mínimo hasta {p.minimoMax} · ¥{p.yuanPorDolar} por dólar
      </p>
      <p className="text-xs mb-1">
        Avance: Mercado Libre {catsHechas}/{p.categorias.length} categorías · productos {total}
        {total > 0 && ` (caja ${n.caja ?? 0} · China ${n.china ?? 0} · juez ${n.juez ?? 0} · listos ${n.listo ?? 0})`}
      </p>
      <p className="text-xs mb-3">
        Costo: Apify US$ {apifyUsd.toFixed(2)} (tope {p.topeApifyUsd}) · Claude US$ {claudeUsd.toFixed(2)} ({tok.in.toLocaleString("es-AR")} tokens de entrada, {tok.out.toLocaleString("es-AR")} de salida)
        · <b>total US$ {(apifyUsd + claudeUsd).toFixed(2)}</b>
      </p>
      <Procesar id={c.id} avanzar={accionAvanzar} terminado={c.estado === "listo"} />
      <Pestanas items={[
        { href: `/admin/piloto/${c.id}`, texto: "Mercado Libre" },
        { href: `/admin/piloto/${c.id}/revision`, texto: "Revisión" },
        { href: `/admin/piloto/${c.id}/validacion`, texto: "Validación" },
      ]} />
      {children}
    </main>
  );
}
