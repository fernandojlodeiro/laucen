// La bandeja de Mensajes: las claves de cada conversación y lo que trae un aviso de Instagram (puro, sin base ni red).
//
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { partirClave } from "@/lib/mensajes/bandeja-tipos";
import { firmaInstagramValida, mensajesDelAviso } from "@/lib/mensajes/instagram";
import { createHmac } from "node:crypto";

test("partirClave: cada canal con su prefijo; un número suelto es un chat (direcciones de antes)", () => {
  assert.deepEqual(partirClave("c:12"), { tipo: "c", id: "12" });
  assert.deepEqual(partirClave("m:2000019130758586"), { tipo: "m", id: "2000019130758586" });
  assert.deepEqual(partirClave("p:13679550780"), { tipo: "p", id: "13679550780" });
  assert.deepEqual(partirClave("r:7"), { tipo: "r", id: "7" });
  assert.deepEqual(partirClave("45"), { tipo: "c", id: "45" });
  assert.equal(partirClave("x:1"), null);
  assert.equal(partirClave("m:1;drop"), null);
  assert.equal(partirClave(""), null);
});

test("mensajesDelAviso: el mensaje de la persona, el eco de la cuenta y lo que no tiene texto", () => {
  const r = mensajesDelAviso({ object: "instagram", entry: [{ id: "IGCUENTA", messaging: [
    { sender: { id: "PERSONA" }, recipient: { id: "IGCUENTA" }, message: { mid: "m1", text: " Hola, ¿tienen stock? " } },
    { sender: { id: "IGCUENTA" }, recipient: { id: "PERSONA" }, message: { mid: "m2", text: "Sí!", is_echo: true } },
    { sender: { id: "PERSONA" }, recipient: { id: "IGCUENTA" }, message: { mid: "m3", attachments: [{ type: "image" }] } },
    { sender: { id: "PERSONA" }, recipient: { id: "IGCUENTA" }, message: { mid: "m4", is_deleted: true } },
    { sender: { id: "PERSONA" }, recipient: { id: "IGCUENTA" } },
  ] }] });
  assert.deepEqual(r, [
    { cuenta: "IGCUENTA", persona: "PERSONA", eco: false, mid: "m1", texto: "Hola, ¿tienen stock?" },
    { cuenta: "IGCUENTA", persona: "PERSONA", eco: true, mid: "m2", texto: "Sí!" },
    { cuenta: "IGCUENTA", persona: "PERSONA", eco: false, mid: "m3", texto: "📷 (mandó una foto)" },
  ]);
});

test("firmaInstagramValida: con la clave secreta de la app sí; con otra o sin firma, no", () => {
  const cuerpo = '{"object":"instagram"}';
  const firma = `sha256=${createHmac("sha256", "secreto").update(cuerpo, "utf8").digest("hex")}`;
  assert.equal(firmaInstagramValida(cuerpo, firma, "secreto"), true);
  assert.equal(firmaInstagramValida(cuerpo, firma, "otro"), false);
  assert.equal(firmaInstagramValida(cuerpo, null, "secreto"), false);
  assert.equal(firmaInstagramValida(cuerpo, firma, ""), false);
});
