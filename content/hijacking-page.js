(() => {
  const monitoredGlobals = new Map([
    ["window.fetch", window.fetch],
    ["window.XMLHttpRequest", window.XMLHttpRequest],
    ["window.WebSocket", window.WebSocket],
    ["window.setInterval", window.setInterval],
    ["window.setTimeout", window.setTimeout],
    ["EventTarget.prototype.addEventListener", window.EventTarget?.prototype?.addEventListener],
    ["Document.prototype.createElement", window.Document?.prototype?.createElement]
  ]);
  const reportedGlobals = new Set();
  const reportedScripts = new Set();

  function notify(payload) {
    window.postMessage(
      {
        source: "sentinela-privacidade",
        type: "HIJACKING_EVENT",
        ...payload
      },
      "*"
    );
  }

  function currentGlobalValue(name) {
    switch (name) {
      case "window.fetch": return window.fetch;
      case "window.XMLHttpRequest": return window.XMLHttpRequest;
      case "window.WebSocket": return window.WebSocket;
      case "window.setInterval": return window.setInterval;
      case "window.setTimeout": return window.setTimeout;
      case "EventTarget.prototype.addEventListener":
        return window.EventTarget?.prototype?.addEventListener;
      case "Document.prototype.createElement":
        return window.Document?.prototype?.createElement;
      default: return undefined;
    }
  }

  function inspectGlobals() {
    monitoredGlobals.forEach((initialValue, name) => {
      if (reportedGlobals.has(name) || currentGlobalValue(name) === initialValue) {
        return;
      }

      reportedGlobals.add(name);
      notify({ kind: "global-change", name });
    });
  }

  function inspectScript(script) {
    if (!(script instanceof HTMLScriptElement) || !script.src) {
      return;
    }

    let url;
    try {
      url = new URL(script.src, window.location.href);
    } catch {
      return;
    }

    if (url.hostname === window.location.hostname || reportedScripts.has(url.href)) {
      return;
    }

    reportedScripts.add(url.href);
    notify({ kind: "third-party-script", url: url.href });
  }

  function observeInjectedScripts() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }

          if (node instanceof HTMLScriptElement) {
            inspectScript(node);
          }
          node.querySelectorAll?.("script[src]").forEach(inspectScript);
        });
      });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.setInterval(inspectGlobals, 1000);

  if (document.documentElement) {
    observeInjectedScripts();
  } else {
    window.addEventListener("DOMContentLoaded", observeInjectedScripts, { once: true });
  }
})();
