(() => {
  "use strict";

  const VERSION = "OFFLINE_SHELL001";

  async function register() {
    if (!("serviceWorker" in navigator)) return { supported: false, registered: false };
    try {
      const reg = await navigator.serviceWorker.register("./cgweb050-sw.js", { scope: "./" });
      return { supported: true, registered: true, scope: reg.scope };
    } catch (error) {
      console.warn("CGWEB050 service worker:", error);
      return { supported: true, registered: false, error: String(error) };
    }
  }

  function installBadge() {
    let b = document.getElementById("cgweb050NetState");
    if (!b) {
      const host = document.querySelector('[data-cg16-page-panel="more"]');
      if (!host) return;
      b = document.createElement("div");
      b.id = "cgweb050NetState";
      b.className = "cgweb050-net";
      host.appendChild(b);
    }
    const online = navigator.onLine;
    b.dataset.online = online ? "1" : "0";
    b.textContent = online ? "En ligne · cache hors-ligne prêt après première visite" : "Hors ligne · ressources locales en cache";
  }

  window.addEventListener("online", installBadge, { passive: true });
  window.addEventListener("offline", installBadge, { passive: true });

  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(installBadge, 120);
  }).observe(document.body, { childList: true, subtree: true });

  const ready = register().then((result) => {
    installBadge();
    return result;
  });
  installBadge();

  window.CGWEB050 = { version: VERSION, ready, register, refreshBadge: installBadge };
})();
