/*
 * CGWEB · ANDROID_PREVIEW_REMOVE001 / QUESTION_DETAIL_FULLWIDTH001
 *
 * La fiche question CGWEB n'affiche plus le simulateur Android latéral.
 * On cible uniquement le panneau portant exactement le titre
 * « Aperçu Android », puis on donne toute la largeur à la fiche principale.
 */
(() => {
  'use strict';

  const MARK = 'CGWEB_ANDROID_PREVIEW_REMOVE001';
  const DONE = 'data-cgweb-question-fullwidth001';

  function norm(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isPreviewTitle(el) {
    return norm(el.textContent) === 'aperçu android';
  }

  function visibleChildren(parent) {
    return [...parent.children].filter(el => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
  }

  function findPreviewColumn(title) {
    let node = title;

    // On remonte jusqu'au premier véritable panneau en colonne :
    // son parent doit avoir au moins un autre enfant visible à côté.
    for (let depth = 0; depth < 8 && node && node.parentElement; depth++) {
      const parent = node.parentElement;
      const siblings = visibleChildren(parent).filter(x => x !== node);

      if (siblings.length) {
        const pr = parent.getBoundingClientRect();
        const nr = node.getBoundingClientRect();

        // Le panneau Android est sensiblement plus étroit que le conteneur
        // global à deux colonnes. Cette condition évite de masquer le drawer.
        if (pr.width > 0 && nr.width > 0 && nr.width <= pr.width * 0.62) {
          return node;
        }
      }
      node = parent;
    }

    // Fallback prudent : on cherche un ancêtre dont le parent est flex/grid.
    node = title;
    for (let depth = 0; depth < 8 && node && node.parentElement; depth++) {
      const parent = node.parentElement;
      const style = getComputedStyle(parent);
      const kids = visibleChildren(parent);
      if (
        kids.length >= 2 &&
        (style.display === 'grid' || style.display === 'flex')
      ) {
        return node;
      }
      node = parent;
    }

    return null;
  }

  function expandMainColumn(previewColumn) {
    const holder = previewColumn?.parentElement;
    if (!holder) return false;

    const others = [...holder.children].filter(x => x !== previewColumn);

    previewColumn.remove();

    holder.setAttribute(DONE, '1');
    holder.style.gridTemplateColumns = 'minmax(0, 1fr)';
    holder.style.gridTemplateAreas = 'none';
    holder.style.columnGap = '0';
    holder.style.gap = '0';

    for (const main of others) {
      main.style.width = '100%';
      main.style.maxWidth = 'none';
      main.style.minWidth = '0';
      main.style.flex = '1 1 100%';
      main.style.gridColumn = '1 / -1';
    }

    return true;
  }

  function apply() {
    // Déjà traité sur le conteneur actuellement affiché.
    if (document.querySelector(`[${DONE}="1"]`)) return;

    const candidates = [
      ...document.querySelectorAll(
        'h1,h2,h3,h4,h5,h6,header,legend,strong,b,div,span'
      )
    ].filter(isPreviewTitle);

    for (const title of candidates) {
      const previewColumn = findPreviewColumn(title);
      if (!previewColumn) continue;

      if (expandMainColumn(previewColumn)) {
        console.info(
          `${MARK} · Aperçu Android supprimé, fiche question en pleine largeur.`
        );
        return;
      }
    }
  }

  let queued = false;
  function queueApply() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', queueApply, { once: true });
  } else {
    queueApply();
  }

  new MutationObserver(queueApply).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
