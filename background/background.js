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
    thirdPartyDomains: new Map(),
    cookies: {
      total: 0,
      firstParty: 0,
      thirdParty: 0,
      session: 0,
      persistent: 0
    },
    observedCookieHeaders: new Set(),
    storageByOrigin: new Map()
  };
}

function serializeReport(report) {
  const storageOrigins = [...report.storageByOrigin.entries()]
    .map(([origin, storage]) => ({ origin, ...storage }))
    .sort((a, b) => a.origin.localeCompare(b.origin));

  const storage = storageOrigins.reduce(
    (totals, origin) => {
      totals.localStorageEntries += origin.localStorageEntries || 0;
      totals.sessionStorageEntries += origin.sessionStorageEntries || 0;
      totals.indexedDBDatabases += origin.indexedDBDatabases || 0;

      if (
        (origin.localStorageEntries || 0) > 0 ||
        (origin.sessionStorageEntries || 0) > 0 ||
        (origin.indexedDBDatabases || 0) > 0
      ) {
        totals.originsUsingStorage += 1;
      }

      return totals;
    },
    {
      localStorageEntries: 0,
      sessionStorageEntries: 0,
      indexedDBDatabases: 0,
      originsUsingStorage: 0
    }
  );

  return {
    pageUrl: report.pageUrl,
    pageHost: report.pageHost,
    observed: report.observed,
    totalRequests: report.totalRequests,
    firstPartyRequests: report.firstPartyRequests,
    thirdPartyRequests: report.thirdPartyRequests,
    cookies: { ...report.cookies },
    storage,
    storageOrigins,
    thirdPartyDomains: [...report.thirdPartyDomains.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
  };
}

function registerStorageSnapshot(report, message) {
  if (!message.origin || message.origin === "null") {
    return;
  }

  report.storageByOrigin.set(message.origin, {
    localStorageEntries: message.localStorageEntries,
    sessionStorageEntries: message.sessionStorageEntries,
    indexedDBDatabases: message.indexedDBDatabases
  });
}

function isCookieDeletion(cookieValue) {
  const maxAgeMatch = cookieValue.match(/(?:^|;)\s*max-age\s*=\s*(-?\d+)/i);
  if (maxAgeMatch && Number(maxAgeMatch[1]) <= 0) {
    return true;
  }

  const expiresMatch = cookieValue.match(/(?:^|;)\s*expires\s*=\s*([^;]+)/i);
  if (!expiresMatch) {
    return false;
  }

  const expiration = Date.parse(expiresMatch[1]);
  return Number.isFinite(expiration) && expiration <= Date.now();
}

function isPersistentCookie(cookieValue) {
  const maxAgeMatch = cookieValue.match(/(?:^|;)\s*max-age\s*=\s*(-?\d+)/i);
  if (maxAgeMatch) {
    return Number(maxAgeMatch[1]) > 0;
  }

  const expiresMatch = cookieValue.match(/(?:^|;)\s*expires\s*=\s*([^;]+)/i);
  if (!expiresMatch) {
    return false;
  }

  const expiration = Date.parse(expiresMatch[1]);
  return Number.isFinite(expiration) && expiration > Date.now();
}

function registerResponseCookies(details) {
  if (details.tabId < 0) {
    return;
  }

  const report = reportsByTab.get(details.tabId);
  const requestHost = hostnameFromUrl(details.url);
  if (!report?.pageDomain || !requestHost) {
    return;
  }

  const cookieHeaders = (details.responseHeaders || []).filter(
    (header) => header.name.toLowerCase() === "set-cookie" && header.value
  );

  cookieHeaders.forEach((header, index) => {
    const observationKey = `${details.requestId}:${index}:${header.value}`;
    if (
      report.observedCookieHeaders.has(observationKey) ||
      isCookieDeletion(header.value)
    ) {
      return;
    }

    report.observedCookieHeaders.add(observationKey);
    report.cookies.total += 1;

    if (siteDomain(requestHost) === report.pageDomain) {
      report.cookies.firstParty += 1;
    } else {
      report.cookies.thirdParty += 1;
    }

    if (isPersistentCookie(header.value)) {
      report.cookies.persistent += 1;
    } else {
      report.cookies.session += 1;
    }
  });
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

browser.webRequest.onHeadersReceived.addListener(
  registerResponseCookies,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

browser.tabs.onRemoved.addListener((tabId) => {
  reportsByTab.delete(tabId);
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "STORAGE_REPORT" && Number.isInteger(sender.tab?.id)) {
    if (!reportsByTab.has(sender.tab.id)) {
      reportsByTab.set(sender.tab.id, createReport(sender.tab.url));
    }

    registerStorageSnapshot(reportsByTab.get(sender.tab.id), message);
    return Promise.resolve({ received: true });
  }

  if (message?.type === "GET_TAB_REPORT" && Number.isInteger(message.tabId)) {
    if (!reportsByTab.has(message.tabId)) {
      reportsByTab.set(message.tabId, createReport(message.pageUrl));
    }

    return Promise.resolve(serializeReport(reportsByTab.get(message.tabId)));
  }

  return undefined;
});
