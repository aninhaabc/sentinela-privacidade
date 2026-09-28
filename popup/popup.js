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
  renderDomains(report.thirdPartyDomains);

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
