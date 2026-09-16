(() => {
  "use strict";

  const VERSION = "PERFORMANCE001";

  const optimizations = Object.freeze([
    "CGWEB038: workspace detail observer debounced and self-mutations ignored",
    "CGWEB039: global DOM observer filtered and debounced",
    "CGWEB040: lightweight import signature and background polling paused",
    "CGWEB041: automatic full-page quality rescan removed",
    "CGWEB043: off-screen rendering deferred for long analytics/history cards"
  ]);

  function snapshot() {
    const memory = performance?.memory;
    return {
      version: VERSION,
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      navigationType: performance.getEntriesByType?.("navigation")?.[0]?.type || null,
      heapUsedMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
      heapLimitMB: memory ? Math.round(memory.jsHeapSizeLimit / 1048576) : null,
      optimizations: [...optimizations]
    };
  }

  document.documentElement.dataset.cgweb043 = VERSION;

  window.CGWEB043 = {
    version: VERSION,
    optimizations,
    snapshot
  };
})();

