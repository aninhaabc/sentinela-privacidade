(() => {
  if (window.__sentinelaCanvasHookInstalled) {
    return;
  }

  window.__sentinelaCanvasHookInstalled = true;

  const observations = {
    readbacks: 0,
    methods: new Map()
  };

  function notify(method, canvas) {
    observations.readbacks += 1;
    observations.methods.set(
      method,
      (observations.methods.get(method) || 0) + 1
    );

    window.postMessage(
      {
        source: "sentinela-privacidade",
        type: "CANVAS_READBACK",
        method,
        width: canvas?.width || 0,
        height: canvas?.height || 0
      },
      "*"
    );
  }

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data?.source !== "sentinela-privacidade" ||
      event.data?.type !== "CANVAS_STATUS_REQUEST"
    ) {
      return;
    }

    window.postMessage(
      {
        source: "sentinela-privacidade",
        type: "CANVAS_STATUS",
        readbacks: observations.readbacks,
        methods: [...observations.methods.entries()].map(([method, count]) => ({
          method,
          count
        }))
      },
      "*"
    );
  });

  function wrapMethod(prototype, methodName, label, getCanvas) {
    const original = prototype?.[methodName];
    if (typeof original !== "function") {
      return;
    }

    Object.defineProperty(prototype, methodName, {
      configurable: true,
      writable: true,
      value: function (...args) {
        notify(label, getCanvas(this));
        return Reflect.apply(original, this, args);
      }
    });
  }

  wrapMethod(
    window.HTMLCanvasElement?.prototype,
    "toDataURL",
    "canvas.toDataURL",
    (canvas) => canvas
  );
  wrapMethod(
    window.HTMLCanvasElement?.prototype,
    "toBlob",
    "canvas.toBlob",
    (canvas) => canvas
  );
  wrapMethod(
    window.CanvasRenderingContext2D?.prototype,
    "getImageData",
    "2d.getImageData",
    (context) => context.canvas
  );
  wrapMethod(
    window.WebGLRenderingContext?.prototype,
    "readPixels",
    "webgl.readPixels",
    (context) => context.canvas
  );
  wrapMethod(
    window.WebGL2RenderingContext?.prototype,
    "readPixels",
    "webgl2.readPixels",
    (context) => context.canvas
  );
})();
