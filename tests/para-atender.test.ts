// «Para atender» en los chats de WhatsApp e Instagram (lib/mensajes/sql-atender.ts, Fer 27/10): qué entra y qué sale.
// Contra la base, como tests/cimiento.test.ts: cada test arma su propia organización y no borra nada.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("TEST_DATABASE_URL no está cargada: no corren los tests de la base.");
  process.exit(0);
}
process.env.DATABASE_URL = url;

let db: typeof import("@/db");
let atender: typeof import("@/lib/mensajes/sql-atender");
let chats: typeof import("@/lib/mensajes/chats");

before(async () => {
  db = await import("@/db");
  atender = await import("@/lib/mensajes/sql-atender");
  chats = await import("@/lib/mensajes/chats");
  await (await import("@/lib/erp/esquema")).asegurarEsquemaErp();
});
after(async () => { await db.pool.end(); });

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await db.pool.query(sql, v)).rows as T[];

async function chatNuevo() {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const chat = await chats.chatDe(org, "whatsapp", `549351${Math.floor(Math.random() * 1e7)}`, "Kari");
  return { org, chat: chat.id };
}
const esta = async (chat: number) => (await q<{ a: boolean }>(`select ${atender.SQL_CHAT_ATENDER("ch")} a from chat ch where ch.id = $1`, [chat]))[0].a;
/** El último mensaje del cliente, como si hubiera llegado hace `seg` segundos. */
const hace = (chat: number, seg: number) => q(`update chat set ultimo_entrante_ts = now() - make_interval(secs => $2) where id = $1`, [chat, seg]);

test("el cliente escribió y nadie le contestó: entra pasados los 90 segundos (antes, la IA todavía puede contestar)", async () => {
  const { org, chat } = await chatNuevo();
  await chats.guardarMensaje({ org, chatId: chat, clase: "entrante", texto: "¿Tienen baterías Dell?" });
  assert.equal(await esta(chat), false, "recién llegado: le da tiempo a la IA");
  await hace(chat, 120);
  assert.equal(await esta(chat), true, "a los dos minutos sin respuesta");
});

test("con la IA apagada en ese chat entra enseguida; si alguien le contesta, sale", async () => {
  const { org, chat } = await chatNuevo();
  await chats.ponerIa(org, chat, false);
  await chats.guardarMensaje({ org, chatId: chat, clase: "entrante", texto: "Hola" });
  assert.equal(await esta(chat), true);
  await chats.guardarMensaje({ org, chatId: chat, clase: "operador", texto: "¡Hola! ¿En qué te ayudo?" });
  assert.equal(await esta(chat), false);
});

test("un «gracias» que la IA vio que no necesita respuesta, o «Terminado», lo saca; si vuelve a escribir, vuelve", async () => {
  const { org, chat } = await chatNuevo();
  await chats.guardarMensaje({ org, chatId: chat, clase: "entrante", texto: "👍" });
  await hace(chat, 300);
  assert.equal(await esta(chat), true);
  // Terminado hace 200 segundos: después del 👍 (hace 300) y antes de lo que escribe ahora (hace 120).
  await q("update chat set no_responder_ts = now() - interval '200 seconds' where id = $1", [chat]);
  assert.equal(await esta(chat), false, "terminado");
  await chats.guardarMensaje({ org, chatId: chat, clase: "entrante", texto: "Una pregunta más" });
  await hace(chat, 120);
  assert.equal(await esta(chat), true, "escribió de nuevo después de terminado");
});

test("un caso abierto entra aunque la última palabra sea nuestra; resuelto, sale", async () => {
  const { org, chat } = await chatNuevo();
  await chats.guardarMensaje({ org, chatId: chat, clase: "entrante", texto: "Hice una sola transferencia por dos pedidos" });
  await chats.guardarMensaje({ org, chatId: chat, clase: "ia", texto: "Te derivo con una persona del equipo." });
  const caso = await chats.abrirCaso(org, chat, "Una transferencia para dos pedidos", "Confirmar a mano");
  assert.equal(await esta(chat), true);
  await chats.resolverCaso(org, caso, "Listo", chat);
  assert.equal(await esta(chat), false);
});

test("los chats del probador no entran", async () => {
  const org = `test-${randomUUID()}`;
  await q("insert into organizaciones (id, nombre) values ($1, $2)", [org, `Test ${org}`]);
  const chat = (await chats.chatDe(org, "prueba", "prueba:yo", "Prueba")).id;
  await chats.guardarMensaje({ org, chatId: chat, clase: "entrante", texto: "Hola" });
  await hace(chat, 300);
  assert.equal(await esta(chat), false);
});
