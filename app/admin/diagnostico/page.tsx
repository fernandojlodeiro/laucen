import { redirect } from "next/navigation";
import { Pool } from "pg";
import { sosVos } from "@/lib/admin";
import { databaseUrl, urlConPassword, POOLERS } from "@/lib/database-url";

export const dynamic = "force-dynamic";

// Diagnóstico interno de la conexión a la base: muestra la forma de
// DATABASE_URL (nunca la contraseña) y el error exacto al conectar. Sólo Fer.

export const metadata = {
  title: "Diagnóstico",
  robots: { index: false, follow: false },
};

type Forma = { valor: string; ok: boolean; nota?: string };

function formaDeLaUrl(cruda: string | undefined): Record<string, Forma> {
  if (!cruda) return { variable: { valor: "no está cargada", ok: false } };
  let u: URL;
  try {
    u = new URL(cruda.trim());
  } catch {
    return { variable: { valor: "no es una URL válida", ok: false,
      nota: "Si la contraseña tiene @, #, /, ? o %, hay que codificarla." } };
  }
  const directa = u.hostname.startsWith("db.");
  const pooler = u.hostname.includes("pooler.supabase.com");
  const pass = decodeURIComponent(u.password);
  return {
    esquema: { valor: u.protocol, ok: u.protocol === "postgresql:" || u.protocol === "postgres:" },
    host: {
      valor: u.hostname, ok: pooler,
      nota: directa ? "Conexión directa: sólo IPv6, Vercel no llega. Hay que usar la del pooler." : undefined,
    },
    puerto: { valor: u.port || "(sin puerto)", ok: u.port === "5432" || u.port === "6543" },
    usuario: {
      valor: u.username, ok: !pooler || u.username.startsWith("postgres."),
      nota: pooler && !u.username.startsWith("postgres.") ? "Con el pooler el usuario es postgres.<ref-del-proyecto>." : undefined,
    },
    contraseña: {
      valor: pass ? `${pass.length} caracteres` : "vacía", ok: !!pass && !/YOUR-PASSWORD|\[|\]/i.test(pass),
      nota: /YOUR-PASSWORD|\[|\]/i.test(pass) ? "Quedó el texto de ejemplo [YOUR-PASSWORD] o los corchetes." : undefined,
    },
    base: { valor: u.pathname.slice(1) || "(ninguna)", ok: u.pathname === "/postgres" },
  };
}

async function probarConexion(url = databaseUrl()): Promise<{ ok: boolean; texto: string }> {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    const r = await pool.query("select current_user as u");
    return { ok: true, texto: `Conecta bien (usuario ${r.rows[0].u}).` };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, texto: `${err.code ?? "sin código"} — ${err.message ?? String(e)}` };
  } finally {
    await pool.end().catch(() => {});
  }
}

export default async function Diagnostico() {
  if (!(await sosVos())) redirect("/panel");
  const cruda = process.env.DATABASE_URL;
  const limpia = databaseUrl();
  const forma = formaDeLaUrl(limpia);
  const soloPassword = !!cruda && !cruda.includes("://");
  if (soloPassword) forma.variable = { valor: "tiene sólo la contraseña: la dirección se arma sola", ok: true };
  const prueba = await probarConexion();
  // Con sólo la contraseña, se prueban los dos poolers posibles de la región.
  const porPooler = soloPassword
    ? await Promise.all(POOLERS.map(async (h) => ({ h, r: await probarConexion(urlConPassword(cruda!.trim(), h)) })))
    : [];

  return (
    <main className="max-w-lg mx-auto p-6">
      <h1 className="text-lg font-bold mb-4">Diagnóstico de la base</h1>
      <table className="w-full text-sm mb-4">
        <tbody>
          {Object.entries(forma).map(([k, f]) => (
            <tr key={k} className="border-b border-[#E3E9F0] align-top">
              <td className="py-1.5 pr-3 text-[#5C6B76]">{k}</td>
              <td className="py-1.5">
                <span className={f.ok ? "text-[#1F6E4A]" : "text-[#C03420]"}>{f.ok ? "✓" : "✗"} {f.valor}</span>
                {f.nota && <p className="text-xs text-[#C03420]">{f.nota}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`text-sm rounded-lg px-3 py-2 ${prueba.ok ? "text-[#1F6E4A] bg-[#EEF7F1]" : "text-[#C03420] bg-[#FDF1EF]"}`}>
        {prueba.texto}
      </p>
      {porPooler.map(({ h, r }) => (
        <p key={h} className={`text-xs mt-2 ${r.ok ? "text-[#1F6E4A]" : "text-[#C03420]"}`}>{h}: {r.texto}</p>
      ))}
    </main>
  );
}
