// Los robots que pasan por la tienda (Fer, 27/10): no cuentan como visitas (esRobot, lib/publicidad/atribucion.ts),
// pero se anota cuál fue y cuántas veces por día, para saber quién entra. Lo lee Informes › Embudo de publicidad.

import { pool } from "@/db";

/** El nombre del robot en criollo, por su «navegador» (user-agent). */
export function nombreRobot(ua: string | null | undefined): string {
  const u = ua ?? "";
  if (!u) return "Sin nombre (no dice qué es)";
  const tabla: [RegExp, string][] = [
    [/AdsBot-Google/i, "Google: revisor de anuncios"],
    [/Mediapartners-Google/i, "Google: anuncios en otros sitios"],
    [/Googlebot-Image/i, "Google: imágenes"],
    [/Storebot-Google/i, "Google: Shopping"],
    [/Google-InspectionTool|Google-Site-Verification|Google-Read-Aloud|Google-/i, "Google: otras herramientas"],
    [/Googlebot/i, "Google: buscador"],
    [/facebookexternalhit|facebookcatalog|Facebot|meta-externalagent/i, "Meta: vista previa de links y catálogo"],
    [/WhatsApp/i, "WhatsApp: vista previa de un link compartido"],
    [/bingbot|BingPreview|msnbot/i, "Bing (Microsoft): buscador"],
    [/YandexBot/i, "Yandex: buscador"],
    [/DuckDuckBot/i, "DuckDuckGo: buscador"],
    [/Applebot/i, "Apple: Siri y búsquedas"],
    [/TelegramBot/i, "Telegram: vista previa de un link"],
    [/Twitterbot/i, "X (Twitter): vista previa de un link"],
    [/AhrefsBot|SemrushBot|MJ12bot|DotBot|SEOkicks|Screaming Frog/i, "Herramienta de posicionamiento en buscadores"],
    [/GPTBot|ChatGPT-User|OAI-SearchBot/i, "OpenAI (ChatGPT)"],
    [/ClaudeBot|Claude-User|anthropic/i, "Anthropic (Claude)"],
    [/PerplexityBot/i, "Perplexity"],
    [/Bytespider/i, "ByteDance (TikTok)"],
    [/Amazonbot/i, "Amazon"],
    [/HeadlessChrome|Lighthouse|PageSpeed/i, "Navegador automático (pruebas de velocidad o programas)"],
    [/curl|wget|python|axios|node-fetch|go-http|java\//i, "Programa (no es un navegador)"],
  ];
  for (const [re, n] of tabla) if (re.test(u)) return n;
  return `Otro: ${u.replace(/\s*\(.*$/, "").slice(0, 60) || u.slice(0, 60)}`;
}

/** Suma una pasada del robot por la tienda de ese canal (una fila por día y robot). Nunca tira. */
export async function anotarRobot(canalId: number, ua: string | null, pagina: string): Promise<void> {
  await pool.query(`
    insert into robot_visita (canal_id, dia, robot, veces, ultima_pagina, ultimo_navegador)
    values ($1, (now() at time zone 'America/Argentina/Buenos_Aires')::date, $2, 1, $3, $4)
    on conflict (canal_id, dia, robot) do update set veces = robot_visita.veces + 1, ultima_pagina = excluded.ultima_pagina,
      ultimo_navegador = excluded.ultimo_navegador, ultimo_ts = now()`,
  [canalId, nombreRobot(ua), pagina.slice(0, 300), (ua ?? "").slice(0, 300)]).catch((e) => console.error("[robots]", e instanceof Error ? e.message : e));
}
