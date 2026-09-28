const reportsByTab = new Map();

const MULTIPART_PUBLIC_SUFFIXES = new Set([
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "edu.br",
  "co.uk",
  "org.uk",
  "com.au",
  "co.jp",
  "co.in",
  "co.za",
  "com.mx",
  "com.ar"
]);

function hostnameFromUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      ? url.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function siteDomain(hostname) {
  if (!hostname || hostname === "localhost" || /^[\d.]+$/.test(hostname)) {
    return hostname;
  }

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length <= 2) {
    return hostname;
  }

  const lastTwo = labels.slice(-2).join(".");
  return MULTIPART_PUBLIC_SUFFIXES.has(lastTwo)
    ? labels.slice(-3).join(".")
    : lastTwo;
}

function createReport(pageUrl, observed = false) {
  const pageHost = hostnameFromUrl(pageUrl);

  return {
    pageUrl,
    pageHost,
    pageDomain: siteDomain(pageHost),
    observed,
    totalRequests: 0,
    firstPartyRequests: 0,
    thirdPartyRequests: 0,
    thirdPartyDomains: new Map()
  };
}

function serializeReport(report) {
  return {
    pageUrl: report.pageUrl,
    pageHost: report.pageHost,
    observed: report.observed,
    totalRequests: report.totalRequests,
    firstPartyRequests: report.firstPartyRequests,
    thirdPartyRequests: report.thirdPartyRequests,
    thirdPartyDomains: [...report.thirdPartyDomains.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
  };
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) {
      return;
    }

    if (details.type === "main_frame") {
      reportsByTab.set(details.tabId, createReport(details.url, true));
      return;
    }

    const requestHost = hostnameFromUrl(details.url);
    if (!requestHost) {
      return;
    }

    const report = reportsByTab.get(details.tabId);
    if (!report?.pageDomain) {
      return;
    }

    report.totalRequests += 1;

    if (siteDomain(requestHost) === report.pageDomain) {
      report.firstPartyRequests += 1;
      return;
    }

    report.thirdPartyRequests += 1;
    const previousCount = report.thirdPartyDomains.get(requestHost) || 0;
    report.thirdPartyDomains.set(requestHost, previousCount + 1);
  },
  { urls: ["<all_urls>"] }
);

browser.tabs.onRemoved.addListener((tabId) => {
  reportsByTab.delete(tabId);
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "GET_TAB_REPORT" || !Number.isInteger(message.tabId)) {
    return undefined;
  }

  if (!reportsByTab.has(message.tabId)) {
    reportsByTab.set(message.tabId, createReport(message.pageUrl));
  }

  return Promise.resolve(serializeReport(reportsByTab.get(message.tabId)));
});
