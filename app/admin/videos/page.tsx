import { redirect } from "next/navigation";
import Link from "next/link";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { consulta } from "@/lib/erp/base";
import { SUAVE } from "@/app/botones";
import type { Sondeo } from "@/lib/mercadolibre/clips";
import SubirVideo from "./Subir";
import { accionSondearClips } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Videos en ML", robots: { index: false, follow: false } };

// Videos (Clips) para las publicaciones de Mercado Libre (Fer, 13/10). Sólo Fer.

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-4 space-y-3";
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Videos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sp = await searchParams;
  const org = (await orgRequerida()).id;
  const [videos, cuentas, sondeo] = await Promise.all([
    consulta<{ id: number; nombre: string; bytes: number | null; creado_ts: string; vence_ts: string }>(
      "select id::int, nombre, bytes::float, creado_ts, vence_ts from video_ml where organizacion_id = $1 order by id desc limit 20", [org]),
    consulta<{ id: number; nombre: string }>(
      "select c.id::int, c.nombre from meli_cuenta mc join canal c on c.id = mc.canal_id where mc.organizacion_id = $1 and mc.estado = 'activa' order by c.id", [org]),
    consulta<{ valor: Sondeo }>("select valor from config_org where organizacion_id = $1 and clave = 'clips_sondeo'", [org]),
  ]);
  const s = sondeo[0]?.valor;

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold text-[#16577F]">Videos en ML</h1>
      <p className="text-sm text-[#5C6B76]">Videos (Clips) para las publicaciones de Mercado Libre. Nada sale a Mercado Libre sin tu clic en la <Link href="/config/canales/cola?ver=lotes" className="underline">Cola de Mercado Libre</Link>.</p>
      {sp.ok && <p className="text-sm bg-[#E8F5EE] border border-[#BFE3CF] rounded-lg p-3 text-[#167655]">{sp.ok}</p>}
      {sp.error && <p className="text-sm bg-[#FDF0EE] border border-[#EFD3CE] rounded-lg p-3 text-[#C03420]">{sp.error}</p>}

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">1. Subir un video a Laucen</h2>
        <p className="text-sm text-[#5C6B76]">Elegí el archivo de tu computadora (hasta 300 MB). Queda guardado en Laucen; todavía no va a ninguna publicación.</p>
        <SubirVideo organizacionId={org} />
        {videos.length > 0 && (
          <ul className="text-sm list-disc pl-5">
            {videos.map((v) => <li key={v.id}>Video {v.id}: {v.nombre} ({v.bytes ? `${(v.bytes / 1048576).toFixed(1)} MB` : "—"}) · subido el {fechaHora(v.creado_ts)}</li>)}
          </ul>
        )}
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">2. Ver qué dice Mercado Libre de los clips de una publicación (sólo lectura)</h2>
        <p className="text-sm text-[#5C6B76]">Lee la publicación y las rutas de clips de Mercado Libre. Sirve para ver si el video de .BAIRES figura en la publicación y qué contesta Mercado Libre. No cambia nada.</p>
        <form action={accionSondearClips} className="flex flex-wrap items-center gap-2">
          <select name="canal" className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-sm">{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
          <input name="item" placeholder="MLA3064301590" required className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-sm w-44" />
          <button className={SUAVE}>Ver qué dice ML</button>
        </form>
        {s && (
          <div className="text-xs text-[#5C6B76] space-y-1">
            <p><b>{s.canal} · {s.item}</b> · {fechaHora(s.fecha)}</p>
            {s.resultados.map((r) => <p key={r.ruta}><span className="font-mono">{r.ruta}</span> → <b>{r.status}</b> <span className="font-mono break-all">{r.cuerpo}</span></p>)}
          </div>
        )}
      </section>
    </main>
  );
}
