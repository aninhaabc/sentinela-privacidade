(() => {
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.data?.source !== "sentinela-privacidade" ||
      event.data?.type !== "HIJACKING_EVENT"
    ) {
      return;
    }

    browser.runtime.sendMessage({
      type: "HIJACKING_EVENT",
      kind: event.data.kind,
      name: event.data.name,
      url: event.data.url
    }).catch(() => {});
  });
})();
