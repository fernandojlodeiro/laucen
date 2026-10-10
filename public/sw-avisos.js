// El "portero" de los avisos de Windows (lib/avisos-push.ts): queda anotado en
// el navegador y recibe los avisos aunque no haya ninguna pestaña de Laucen
// abierta. Muestra el cartel de Windows y, al tocarlo, abre Laucen ahí.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let a = { titulo: "Laucen", texto: "", url: "/panel" };
  try { a = { ...a, ...e.data.json() }; } catch { /* sin datos */ }
  e.waitUntil((async () => {
    await self.registration.showNotification(a.titulo, {
      body: a.texto,
      icon: "/marca/laucen-logo.png",
      // Un solo cartel de Laucen a la vez: uno nuevo reemplaza al anterior.
      tag: "laucen-avisos",
      renotify: true,
      data: { url: a.url },
    });
    // Le cuenta a las pantallas abiertas que llegó (la prueba de Mis avisos lo usa para saber si Windows lo tapó).
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage({ tipo: "aviso-llego" });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/panel", self.location.origin).href;
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abiertas) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
