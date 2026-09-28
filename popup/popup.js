async function loadActivePage() {
  const pageName = document.querySelector("#page-name");
  const pageUrl = document.querySelector("#page-url");

  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    pageName.textContent = activeTab?.title || "Página sem título";
    pageUrl.textContent = activeTab?.url || "URL indisponível";
  } catch (error) {
    pageName.textContent = "Não foi possível acessar a página";
    pageUrl.textContent = error.message;
    console.error("Erro ao consultar a aba ativa:", error);
  }
}

loadActivePage();
