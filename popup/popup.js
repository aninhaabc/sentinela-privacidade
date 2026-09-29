let activeTab;

function renderDomains(domains) {
  const list = document.querySelector("#domain-list");
  list.replaceChildren();

  if (!domains.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "domain-empty";
    emptyItem.textContent = "Nenhum domínio observado.";
    list.append(emptyItem);
    return;
  }

  domains.forEach(({ domain, count }) => {
    const item = document.createElement("li");
    const domainName = document.createElement("span");
    const requestCount = document.createElement("span");

    domainName.textContent = domain;
    requestCount.className = "request-count";
    requestCount.textContent = `${count} req.`;
    item.append(domainName, requestCount);
    list.append(item);
  });
}

function renderCanvas(canvas) {
  const status = document.querySelector("#canvas-status");
  const methodList = document.querySelector("#canvas-method-list");

  status.textContent = canvas.detected ? "Detectado" : "Sem atividade";
  status.classList.toggle("detection-status--warning", canvas.detected);
  document.querySelector("#canvas-readbacks").textContent = canvas.readbacks;
  document.querySelector("#canvas-origins").textContent = canvas.origins;
  methodList.replaceChildren();

  if (!canvas.methods.length) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "Nenhum método de leitura observado.";
    methodList.append(emptyItem);
    return;
  }

  canvas.methods.forEach(({ method, count }) => {
    const item = document.createElement("li");
    const methodName = document.createElement("span");
    const methodCount = document.createElement("strong");
    methodName.textContent = method;
    methodCount.textContent = `${count} vez(es)`;
    item.append(methodName, methodCount);
    methodList.append(item);
  });
}

function renderAdvancedTracking(advancedTracking) {
  const { bounce, queryParameters, cookieSync } = advancedTracking;
  const detected =
    bounce.detected || queryParameters.detected || cookieSync.detected;
  const status = document.querySelector("#advanced-status");
  const parameterList = document.querySelector("#tracking-param-list");

  status.textContent = detected ? "Indícios encontrados" : "Sem indícios";
  status.classList.toggle("detection-status--warning", detected);
  document.querySelector("#bounce-redirects").textContent = bounce.redirects;
  document.querySelector("#tracking-param-count").textContent =
    queryParameters.total;
  document.querySelector("#cookie-sync-count").textContent =
    cookieSync.sharedIdentifiers +
    cookieSync.endpointSignals +
    cookieSync.bounceRelays;

  document.querySelector("#bounce-chain").textContent = bounce.chain.length > 1
    ? `Cadeia: ${bounce.chain.join(" → ")}`
    : "Nenhuma cadeia de redirecionamento.";

  parameterList.replaceChildren();
  if (!queryParameters.parameters.length) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "Nenhum parâmetro rastreador observado.";
    parameterList.append(emptyItem);
    return;
  }

  queryParameters.parameters.forEach(({ name, count }) => {
    const item = document.createElement("li");
    const parameterName = document.createElement("span");
    const parameterCount = document.createElement("strong");
    parameterName.textContent = name;
    parameterCount.textContent = `${count} vez(es)`;
    item.append(parameterName, parameterCount);
    parameterList.append(item);
  });
}

function renderHijacking(hijacking) {
  const status = document.querySelector("#hijacking-status");
  const indicatorList = document.querySelector("#hijacking-indicator-list");

  status.textContent = hijacking.detected ? "Indícios encontrados" : "Sem indícios";
  status.classList.toggle("detection-status--warning", hijacking.detected);
  document.querySelector("#hijacking-websockets").textContent = hijacking.webSockets;
  document.querySelector("#hijacking-polling").textContent = hijacking.polling;
  document.querySelector("#hijacking-globals").textContent = hijacking.modifiedGlobals.length;
  document.querySelector("#hijacking-scripts").textContent = hijacking.injectedScripts.length;

  const indicators = [
    ...hijacking.webSocketHosts.map((host) => `WebSocket: ${host}`),
    ...hijacking.pollingEndpoints.map(
      ({ endpoint, count }) => `Polling (${count} req.): ${endpoint}`
    ),
    ...hijacking.modifiedGlobals.map((name) => `Objeto alterado: ${name}`),
    ...hijacking.injectedScripts.map((url) => `Script injetado: ${url}`)
  ];

  indicatorList.replaceChildren();
  if (!indicators.length) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "Nenhum indicador observado.";
    indicatorList.append(emptyItem);
    return;
  }

  indicators.forEach((indicator) => {
    const item = document.createElement("li");
    item.textContent = indicator;
    indicatorList.append(item);
  });
}

function renderPrivacyScore(privacyScore) {
  const score = document.querySelector("#privacy-score");
  const rating = document.querySelector("#score-rating");
  const meter = document.querySelector("#score-meter-fill");
  const breakdown = document.querySelector("#score-breakdown");
  const level = privacyScore.value >= 80
    ? "good"
    : privacyScore.value >= 60
      ? "attention"
      : "critical";

  score.textContent = privacyScore.value;
  rating.textContent = privacyScore.rating;
  meter.style.width = `${privacyScore.value}%`;
  meter.dataset.level = level;
  score.dataset.level = level;
  rating.dataset.level = level;

  breakdown.replaceChildren();
  privacyScore.breakdown.forEach(({ label, penalty, maximum }) => {
    const item = document.createElement("li");
    const category = document.createElement("span");
    const deduction = document.createElement("strong");
    category.textContent = label;
    deduction.textContent = `−${penalty} / ${maximum}`;
    item.append(category, deduction);
    breakdown.append(item);
  });
}

function renderBlockedRequests(blocking) {
  document.querySelector("#blocked-request-count").textContent = blocking.requests;
}

function renderBlocklist(domains) {
  const list = document.querySelector("#blocklist-domains");
  list.replaceChildren();

  if (!domains.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "domain-empty";
    emptyItem.textContent = "Nenhum domínio adicionado.";
    list.append(emptyItem);
    return;
  }

  domains.forEach((domain) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const remove = document.createElement("button");
    name.textContent = domain;
    remove.type = "button";
    remove.textContent = "Remover";
    remove.addEventListener("click", async () => {
      const result = await browser.runtime.sendMessage({
        type: "REMOVE_BLOCKED_DOMAIN",
        domain
      });
      renderBlocklist(result.domains || []);
      document.querySelector("#blocklist-feedback").textContent =
        `${domain} removido da lista.`;
    });
    item.append(name, remove);
    list.append(item);
  });
}

async function initializeBlocklist() {
  const form = document.querySelector("#blocklist-form");
  const input = document.querySelector("#blocked-domain");
  const feedback = document.querySelector("#blocklist-feedback");
  const current = await browser.runtime.sendMessage({ type: "GET_BLOCKLIST" });
  renderBlocklist(current.domains || []);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await browser.runtime.sendMessage({
      type: "ADD_BLOCKED_DOMAIN",
      domain: input.value
    });

    if (!result.ok) {
      feedback.textContent = result.error || "Não foi possível adicionar o domínio.";
      feedback.classList.add("blocklist-feedback--error");
      return;
    }

    feedback.classList.remove("blocklist-feedback--error");
    feedback.textContent = "Domínio adicionado. Recarregue a página para testar.";
    input.value = "";
    renderBlocklist(result.domains || []);
  });
}

async function updateReport() {
  if (!activeTab?.id) {
    return;
  }

  const report = await browser.runtime.sendMessage({
    type: "GET_TAB_REPORT",
    tabId: activeTab.id,
    pageUrl: activeTab.url
  });

  document.querySelector("#total-requests").textContent = report.totalRequests;
  document.querySelector("#third-party-requests").textContent = report.thirdPartyRequests;
  document.querySelector("#domain-count").textContent = report.thirdPartyDomains.length;
  document.querySelector("#cookie-total").textContent = report.cookies.total;
  document.querySelector("#first-party-cookies").textContent = report.cookies.firstParty;
  document.querySelector("#third-party-cookies").textContent = report.cookies.thirdParty;
  document.querySelector("#session-cookies").textContent = report.cookies.session;
  document.querySelector("#persistent-cookies").textContent = report.cookies.persistent;
  document.querySelector("#storage-origin-count").textContent = report.storage.originsUsingStorage;
  document.querySelector("#local-storage-count").textContent =
    `${report.storage.localStorageEntries} itens`;
  document.querySelector("#session-storage-count").textContent =
    `${report.storage.sessionStorageEntries} itens`;
  document.querySelector("#indexed-db-count").textContent =
    `${report.storage.indexedDBDatabases} bancos`;
  renderDomains(report.thirdPartyDomains);
  renderCanvas(report.canvas);
  renderAdvancedTracking(report.advancedTracking);
  renderHijacking(report.hijacking);
  renderPrivacyScore(report.privacyScore);
  renderBlockedRequests(report.blocking);

  const scanStatus = document.querySelector("#scan-status");
  if (report.observed) {
    scanStatus.textContent = "Monitoramento ativo nesta página.";
    scanStatus.classList.remove("scan-status--warning");
  } else {
    scanStatus.textContent = "Recarregue a página para iniciar a análise.";
    scanStatus.classList.add("scan-status--warning");
  }
}

async function initializePopup() {
  const pageName = document.querySelector("#page-name");
  const pageUrl = document.querySelector("#page-url");

  try {
    [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    pageName.textContent = activeTab?.title || "Página sem título";
    pageUrl.textContent = activeTab?.url || "URL indisponível";
    await updateReport();
    window.setInterval(updateReport, 1000);
  } catch (error) {
    pageName.textContent = "Não foi possível acessar a página";
    pageUrl.textContent = error.message;
    console.error("Erro ao consultar a aba ativa:", error);
  }
}

initializePopup();
initializeBlocklist().catch(console.error);
