(() => {
  const observations = {
    readbacks: 0,
    methods: new Map()
  };

  function sendSnapshot() {
    browser.runtime.sendMessage({
      type: "CANVAS_SNAPSHOT",
      origin: window.location.origin,
      readbacks: observations.readbacks,
      methods: [...observations.methods.entries()].map(([method, count]) => ({
        method,
        count
      }))
    }).catch(() => {});
  }

  function registerReadback(method) {
    observations.readbacks += 1;
    observations.methods.set(
      method,
      (observations.methods.get(method) || 0) + 1
    );
    sendSnapshot();
  }

  const observedDataImages = new WeakSet();

  function inspectDataImage(image) {
    if (observedDataImages.has(image)) {
      return;
    }

    const source = image.currentSrc || image.getAttribute("src") || "";
    if (!source.startsWith("data:image/") || source.length < 200) {
      return;
    }

    observedDataImages.add(image);
    registerReadback("dom.dataImage");
  }

  function scanDataImages(root = document) {
    if (root instanceof HTMLImageElement) {
      inspectDataImage(root);
    }

    root.querySelectorAll?.('img[src^="data:image/"]').forEach(inspectDataImage);
  }

  function observeDataImages() {
    scanDataImages();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") {
          inspectDataImage(mutation.target);
          return;
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanDataImages(node);
          }
        });
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["src"],
      childList: true,
      subtree: true
    });
  }

  function installFirefoxHook() {
    if (
      typeof window.wrappedJSObject === "undefined" ||
      typeof exportFunction !== "function"
    ) {
      return false;
    }

    const pageWindow = window.wrappedJSObject;
    if (pageWindow.__sentinelaFirefoxCanvasHookInstalled) {
      return true;
    }

    pageWindow.__sentinelaFirefoxCanvasHookInstalled = true;

    function wrapMethod(prototype, methodName, label) {
      const original = prototype?.[methodName];
      if (typeof original !== "function") {
        return;
      }

      const replacement = function (...args) {
        registerReadback(label);
        return Reflect.apply(original, this, args);
      };

      Object.defineProperty(prototype, methodName, {
        configurable: true,
        writable: true,
        value: exportFunction(replacement, pageWindow)
      });
    }

    wrapMethod(
      pageWindow.HTMLCanvasElement?.prototype,
      "toDataURL",
      "canvas.toDataURL"
    );
    wrapMethod(
      pageWindow.HTMLCanvasElement?.prototype,
      "toBlob",
      "canvas.toBlob"
    );
    wrapMethod(
      pageWindow.CanvasRenderingContext2D?.prototype,
      "getImageData",
      "2d.getImageData"
    );
    wrapMethod(
      pageWindow.WebGLRenderingContext?.prototype,
      "readPixels",
      "webgl.readPixels"
    );
    wrapMethod(
      pageWindow.WebGL2RenderingContext?.prototype,
      "readPixels",
      "webgl2.readPixels"
    );

    return true;
  }

  if (!installFirefoxHook()) {
    window.addEventListener("message", (event) => {
      if (
        event.source !== window ||
        event.data?.source !== "sentinela-privacidade" ||
        event.data?.type !== "CANVAS_STATUS"
      ) {
        return;
      }

      observations.readbacks = Math.max(0, Number(event.data.readbacks) || 0);
      observations.methods = new Map(
        (event.data.methods || []).map(({ method, count }) => [method, count])
      );
      sendSnapshot();
    });

    window.setInterval(() => {
      window.postMessage(
        {
          source: "sentinela-privacidade",
          type: "CANVAS_STATUS_REQUEST"
        },
        "*"
      );
    }, 1000);
  }

  sendSnapshot();
  window.setInterval(sendSnapshot, 1000);

  if (document.documentElement) {
    observeDataImages();
  } else {
    window.addEventListener("DOMContentLoaded", observeDataImages, { once: true });
  }
})();
