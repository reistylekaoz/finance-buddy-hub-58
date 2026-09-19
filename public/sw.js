// Service worker mínimo, sem cache/offline — existe só pra satisfazer o
// critério de instalabilidade do Chrome/Android (o evento
// "beforeinstallprompt" só dispara com um service worker registrado). Não
// intercepta nenhum fetch, então nunca serve conteúdo antigo em cache.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
