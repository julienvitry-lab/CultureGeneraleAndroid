(() => {
  "use strict";

  const VERSION = "HEALTHCHECK001";
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const esc = (s) => norm(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  function storageCheck(storage, name) {
    const key = "__cgweb052_test__";
    try {
      storage.setItem(key, "1");
      storage.removeItem(key);
      return { name, ok: true, detail: "écriture/lecture temporaire OK" };
    } catch (e) {
      return { name, ok: false, detail: String(e) };
    }
  }

  function duplicateIds() {
    const seen = new Set(), dup = new Set();
    document.querySelectorAll("[id]").forEach((el) => {
      if (seen.has(el.id)) dup.add(el.id);
      seen.add(el.id);
    });
    return [...dup];
  }

  function checkTag(fragment, selector, name) {
    const matches = [...document.querySelectorAll(selector)].filter((el) =>
      String(el.getAttribute(selector === "script[src]" ? "src" : "href") || "").includes(fragment)
    );
    return { name, ok: matches.length === 1, detail: `${matches.length} occurrence(s)` };
  }

  async function runChecks() {
    const checks = [];
    checks.push({ name: "Réseau navigateur", ok: navigator.onLine, detail: navigator.onLine ? "en ligne" : "hors ligne" });
    checks.push(storageCheck(localStorage, "localStorage"));
    checks.push(storageCheck(sessionStorage, "sessionStorage"));

    checks.push({ name: "Répertoire", ok: !!document.querySelector('[data-cg16-page-panel="directory"]'), detail: "ancre data-cg16-page-panel=directory" });
    checks.push({ name: "Apprentissage", ok: !!document.querySelector('[data-cg16-page-panel="learning"]'), detail: "ancre data-cg16-page-panel=learning" });
    checks.push({ name: "Plus", ok: !!document.querySelector('[data-cg16-page-panel="more"]'), detail: "ancre data-cg16-page-panel=more" });

    for (let n = 45; n <= 52; n++) {
      const nn = String(n).padStart(3, "0");
      checks.push(checkTag(`cgweb${nn}.js`, "script[src]", `Script CGWEB${nn}`));
      checks.push(checkTag(`cgweb${nn}.css`, 'link[rel="stylesheet"][href]', `CSS CGWEB${nn}`));
    }

    ["CGWEB038","CGWEB039","CGWEB044","CGWEB045","CGWEB046","CGWEB047","CGWEB048","CGWEB049","CGWEB050","CGWEB051","CGWEB052"].forEach((name) => {
      checks.push({ name: `API ${name}`, ok: !!window[name], detail: window[name]?.version || "non exposée" });
    });

    const dup = duplicateIds();
    checks.push({ name: "IDs DOM uniques", ok: dup.length === 0, detail: dup.length ? dup.slice(0,12).join(", ") : "aucun doublon" });

    if ("serviceWorker" in navigator) {
      let regs = [];
      try { regs = await navigator.serviceWorker.getRegistrations(); } catch (_) {}
      const ours = regs.filter((r) => String(r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "").includes("cgweb050-sw.js"));
      checks.push({ name: "Service worker CGWEB050", ok: ours.length === 1, detail: `${ours.length} enregistrement(s)` });
    } else {
      checks.push({ name: "Service worker CGWEB050", ok: false, detail: "API non supportée" });
    }

    return checks;
  }

  function ensureModal() {
    let m = document.getElementById("cgweb052Modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cgweb052Modal";
    m.className = "cgweb052-overlay";
    m.hidden = true;
    m.innerHTML = `
      <div class="cgweb052-dialog" role="dialog" aria-modal="true" aria-label="Diagnostic CGWEB">
        <header><div><strong>Diagnostic CGWEB</strong><small>Auto-contrôle local sans écriture métier</small></div><button type="button" data-cg52-close>×</button></header>
        <div class="cgweb052-actions"><button type="button" data-cg52-run>Relancer</button><button type="button" data-cg52-export>Exporter le rapport</button></div>
        <div id="cgweb052Summary"></div><div id="cgweb052List"></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (ev) => {
      if (ev.target === m || ev.target.closest("[data-cg52-close]")) close();
      if (ev.target.closest("[data-cg52-run]")) render();
      if (ev.target.closest("[data-cg52-export]")) exportReport();
    });
    return m;
  }

  let lastChecks = [];
  async function render() {
    const m = ensureModal();
    const summary = m.querySelector("#cgweb052Summary");
    const list = m.querySelector("#cgweb052List");
    summary.textContent = "Diagnostic en cours…";
    list.innerHTML = "";
    lastChecks = await runChecks();
    const ok = lastChecks.filter((x) => x.ok).length;
    summary.innerHTML = `<strong>${ok}/${lastChecks.length} contrôles OK</strong>`;
    list.innerHTML = lastChecks.map((x) => `
      <article class="cgweb052-check ${x.ok ? "ok" : "ko"}">
        <span>${x.ok ? "✓" : "!"}</span><div><strong>${esc(x.name)}</strong><small>${esc(x.detail)}</small></div>
      </article>`).join("");
  }

  function reportText() {
    return [
      `CGWEB052 HEALTHCHECK001`,
      `Date: ${new Date().toISOString()}`,
      `URL: ${location.href}`,
      `User-Agent: ${navigator.userAgent}`,
      "",
      ...lastChecks.map((x) => `${x.ok ? "OK" : "ERREUR"} | ${x.name} | ${x.detail}`)
    ].join("\n");
  }
  async function exportReport() {
    if (!lastChecks.length) await render();
    const blob = new Blob([reportText()], { type: "text/plain;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `CGWEB052_DIAGNOSTIC_${new Date().toISOString().replace(/[:.]/g,"-")}.txt`
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function open() {
    const m = ensureModal();
    m.hidden = false;
    render();
  }
  function close() { ensureModal().hidden = true; }

  function installButton() {
    if (document.getElementById("cgweb052Open")) return;
    const host = document.querySelector('[data-cg16-page-panel="more"]');
    if (!host) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "cgweb052Open";
    b.textContent = "Diagnostic CGWEB";
    b.addEventListener("click", open);
    host.appendChild(b);
  }
  installButton();
  let timer = null;
  new MutationObserver((muts) => {
    if (!muts.some((m) => m.addedNodes.length)) return;
    clearTimeout(timer);
    timer = setTimeout(installButton, 120);
  }).observe(document.body, { childList: true, subtree: true });

  window.CGWEB052 = { version: VERSION, open, runChecks, reportText };
})();
