// Los precios web calculados (db/precio_web.sql): cada tabla de la que depende un precio tiene que tener su
// aviso, y el archivo tiene que correr con el deploy. En la base, el control (precio_web_controlar) además
// recorre las funciones del precio y anota toda tabla leída sin aviso (precio_web_dependencias_sin_aviso).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARCHIVOS_ERP } from "@/lib/erp/esquema";

const sql = readFileSync("db/precio_web.sql", "utf8");

// Las tablas que leen precio_de, bono_web y stock_disponible_canal (y lo que llaman), y las que hay detrás
// de las vistas que usan. Sacadas de la base recorriendo las funciones, no de memoria.
const DEPENDENCIAS = ["precio", "variacion", "producto", "stock", "kit_componente", "publicacion", "canal",
  "lista_precios", "tipo_cambio", "ml_costos_comisiones", "ml_costos_cargo_fijo", "ml_regla_precio", "familia",
  "canal_deposito", "deposito", "ubicacion"];

test("cada tabla que mueve un precio tiene su aviso", () => {
  const sinAviso = DEPENDENCIAS.filter((t) =>
    !new RegExp(`trigger precio_web_aviso\\w* after [^;]* on ${t} for each`).test(sql)
    && !new RegExp(`'${t}'`).test(sql.slice(sql.indexOf("foreach t in array")))
  );
  assert.deepEqual(sinAviso, []);
});

test("el archivo corre con el deploy, después de las tablas que usa", () => {
  const i = ARCHIVOS_ERP.indexOf("precio_web" as (typeof ARCHIVOS_ERP)[number]);
  assert.ok(i >= 0, "precio_web no está en ARCHIVOS_ERP");
  for (const antes of ["catalogo", "stock", "mercadolibre", "precios_ml", "tc_dia"]) {
    assert.ok(ARCHIVOS_ERP.indexOf(antes as (typeof ARCHIVOS_ERP)[number]) < i, `${antes} tiene que correr antes que precio_web`);
  }
});

test("un aviso nunca frena el cambio que lo dispara", () => {
  // Los dos disparadores atrapan cualquier error (y marcan recalcular todo) en vez de abortar la venta o la carga.
  const cuerpos = sql.split("create or replace function public.tg_precio_web_").slice(1);
  assert.equal(cuerpos.length, 2);
  for (const c of cuerpos) assert.match(c.slice(0, c.indexOf("end $$;")), /exception when others then/);
});

test("lo que guarda es la cuenta en vivo, sin otra fórmula", () => {
  // La fila se arma sólo con precio_de, bono_web y stock_disponible_canal.
  const vivo = sql.slice(sql.indexOf("function public.precio_web_vivo"), sql.indexOf("function public.precio_web_actualizar"));
  assert.match(vivo, /precio_de\(p_org, v\.id, p_lista\)/);
  assert.match(vivo, /bono_web\(p_org, v\.id, p_lista, pr\.lista_ars\)/);
  assert.match(vivo, /stock_disponible_canal\(p_org, v\.id, p_canal\)/);
});
