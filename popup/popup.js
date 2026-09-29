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
