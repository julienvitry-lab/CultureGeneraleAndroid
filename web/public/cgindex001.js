// CGINDEX001 — indicateur
(() => {
  const panel = document.getElementById("cgweb006Panel");
  if (!panel) return;

  const note = panel.querySelector(".cg6-note");
  if (!note || document.getElementById("cgindex001Info")) return;

  const info = document.createElement("div");
  info.id = "cgindex001Info";
  info.className = "cgindex001-info";
  info.textContent =
    "CGINDEX001 : index de base + mises à jour Web live (ajouts, éditions, suppressions).";

  note.appendChild(info);
})();
