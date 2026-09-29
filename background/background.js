const reportsByTab = new Map();
const redirectChainsByTab = new Map();

const TRACKING_QUERY_PARAMETERS = new Set([
  "fbclid",
  "fb_source",
  "gclid",
  "dclid",
  "msclkid",
  "ttclid",
  "mc_eid",
  "uid",
  "user_id",
  "userid",
  "click_id",
  "clickid",
  "client_id",
  "cid",
  "isnew"
]);

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
    return ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
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
    storageByOrigin: new Map(),
    canvas: {
      readbacks: 0,
      methods: new Map(),
      origins: new Set(),
      snapshots: new Map()
    },
    navigationRequestId: null,
    navigationHosts: pageHost ? [pageHost] : [],
    trackingParameters: {
      total: 0,
      names: new Map(),
      domains: new Set(),
      observations: new Set()
    },
    cookieSync: {
      identifierDomains: new Map(),
      endpointSignals: new Set(),
      domains: new Set()
    },
    hijacking: {
      webSocketHosts: new Map(),
      requestWindows: new Map(),
      pollingEndpoints: new Map(),
      modifiedGlobals: new Set(),
      injectedScripts: new Set()
    }
  };
}

function canonicalEndpoint(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function registerHijackingNetworkIndicator(report, details, requestHost) {
  if (!report.pageDomain || siteDomain(requestHost) === report.pageDomain) {
    return;
  }

  if (details.type === "websocket") {
    report.hijacking.webSocketHosts.set(
      requestHost,
      (report.hijacking.webSocketHosts.get(requestHost) || 0) + 1
    );
    return;
  }

  if (details.type !== "xmlhttprequest") {
    return;
  }

  const endpoint = canonicalEndpoint(details.url);
  if (!endpoint) {
    return;
  }

  const now = Date.now();
  const recentRequests = (report.hijacking.requestWindows.get(endpoint) || [])
    .filter((timestamp) => now - timestamp <= 15000);
  recentRequests.push(now);
  report.hijacking.requestWindows.set(endpoint, recentRequests);

  if (recentRequests.length >= 3) {
    report.hijacking.pollingEndpoints.set(endpoint, recentRequests.length);
  }
}

function trackingParameter(name, value) {
  const normalizedName = name.toLowerCase();
  if (!value) {
    return false;
  }

  return (
    normalizedName.startsWith("utm_") ||
    normalizedName.startsWith("bounceuid") ||
    TRACKING_QUERY_PARAMETERS.has(normalizedName)
  );
}

function registerMainFrameRedirect(details) {
  if (details.tabId < 0 || details.type !== "main_frame") {
    return;
  }

  const report = reportsByTab.get(details.tabId);
  const redirectHost = hostnameFromUrl(details.redirectUrl);
  if (!report || !redirectHost) {
    return;
  }

  const chain = [...report.navigationHosts];
  if (chain.at(-1) !== redirectHost) {
    chain.push(redirectHost);
  }

  redirectChainsByTab.set(details.tabId, {
    chain,
    nextHost: redirectHost,
    recordedAt: Date.now()
  });
}

function registerTrackingParameters(report, details) {
  let url;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }

  const requestHost = url.hostname.toLowerCase();
  const requestDomain = siteDomain(requestHost);

  url.searchParams.forEach((value, name) => {
    if (!trackingParameter(name, value)) {
      return;
    }

    const normalizedName = name.toLowerCase();
    const observationKey =
      `${details.requestId}:${requestHost}:${normalizedName}:${value}`;
    if (report.trackingParameters.observations.has(observationKey)) {
      return;
    }

    report.trackingParameters.observations.add(observationKey);
    report.trackingParameters.total += 1;
    report.trackingParameters.names.set(
      normalizedName,
      (report.trackingParameters.names.get(normalizedName) || 0) + 1
    );
    report.trackingParameters.domains.add(requestHost);

    if (value.length >= 4) {
      if (!report.cookieSync.identifierDomains.has(value)) {
        report.cookieSync.identifierDomains.set(value, new Set());
      }
      report.cookieSync.identifierDomains.get(value).add(requestDomain);
    }
  });

  const syncPattern = /(?:^|[\/_-])(cookie[-_]?sync|sync|match|partner)(?:[\/_-]|$)/i;
  if (
    report.pageDomain &&
    requestDomain !== report.pageDomain &&
    syncPattern.test(`${url.pathname}?${url.searchParams.toString()}`)
  ) {
    report.cookieSync.endpointSignals.add(details.requestId);
    report.cookieSync.domains.add(requestHost);
  }
}

function registerMainFrame(report, details) {
  const nextHost = hostnameFromUrl(details.url);
  if (!nextHost) {
    return;
  }

  if (report.navigationHosts.at(-1) !== nextHost) {
    report.navigationHosts.push(nextHost);
  }

  report.pageUrl = details.url;
  report.pageHost = nextHost;
  report.pageDomain = siteDomain(nextHost);
}

function calculatePrivacyScore(report, context) {
  const networkPenalty = Math.min(
    20,
    report.thirdPartyDomains.size * 2 + report.thirdPartyRequests * 0.5
  );
  const cookiePenalty = Math.min(
    20,
    report.cookies.thirdParty * 4 + report.cookies.persistent
  );
  const storedEntries =
    context.storage.localStorageEntries +
    context.storage.sessionStorageEntries +
    context.storage.indexedDBDatabases;
  const storagePenalty = Math.min(
    10,
    context.storage.originsUsingStorage * 2 + storedEntries
  );
  const canvasPenalty = report.canvas.readbacks > 0 ? 10 : 0;
  const navigationPenalty = Math.min(
    20,
    report.trackingParameters.total +
      (context.bounceDetected ? 8 : 0) +
      (context.cookieSyncDetected ? 8 : 0)
  );
  const hijackingPenalty = Math.min(
    20,
    report.hijacking.webSocketHosts.size * 5 +
      report.hijacking.pollingEndpoints.size * 6 +
      report.hijacking.modifiedGlobals.size * 8 +
      report.hijacking.injectedScripts.size * 2
  );

  const breakdown = [
    { key: "network", label: "Conexões externas", penalty: networkPenalty, maximum: 20 },
    { key: "cookies", label: "Cookies", penalty: cookiePenalty, maximum: 20 },
    { key: "storage", label: "Armazenamento", penalty: storagePenalty, maximum: 10 },
    { key: "canvas", label: "Canvas fingerprinting", penalty: canvasPenalty, maximum: 10 },
    { key: "navigation", label: "Rastreamento por navegação", penalty: navigationPenalty, maximum: 20 },
    { key: "hijacking", label: "Hijacking e hooks", penalty: hijackingPenalty, maximum: 20 }
  ].map((item) => ({ ...item, penalty: Math.round(item.penalty) }));

  const totalPenalty = breakdown.reduce((total, item) => total + item.penalty, 0);
  const value = Math.max(0, 100 - totalPenalty);
  const rating = value >= 80 ? "Boa" : value >= 60 ? "Atenção" : "Crítica";

  return { value, rating, totalPenalty, breakdown };
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

  const navigationChain = [...report.navigationHosts];
  const hasBounceIdentifier = [...report.trackingParameters.names.keys()].some(
    (name) =>
      name === "uid" ||
      name === "isnew" ||
      name.startsWith("bounceuid")
  );
  const completeBounceIntermediates = navigationChain.length >= 3
    ? navigationChain.slice(1, -1)
    : [];
  // If monitoring starts on the bounce domain, Firefox may expose only the
  // last redirect. A third-party hop that relays a bounce identifier back to
  // the destination is still sufficient evidence of bounce tracking.
  const partialBounceIntermediates =
    navigationChain.length === 2 &&
    navigationChain[0] !== navigationChain[1] &&
    hasBounceIdentifier
      ? [navigationChain[0]]
      : [];
  const bounceIntermediates = completeBounceIntermediates.length > 0
    ? completeBounceIntermediates
    : partialBounceIntermediates;
  const sharedIdentifiers = [...report.cookieSync.identifierDomains.values()]
    .filter((domains) => domains.size >= 2);
  const bounceIdentifierRelay =
    bounceIntermediates.length > 0 &&
    hasBounceIdentifier;
  const cookieSyncDetected =
    sharedIdentifiers.length > 0 ||
    report.cookieSync.endpointSignals.size > 0 ||
    bounceIdentifierRelay;
  const privacyScore = calculatePrivacyScore(report, {
    storage,
    bounceDetected: bounceIntermediates.length > 0,
    cookieSyncDetected
  });

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
    privacyScore,
    canvas: {
      detected: report.canvas.readbacks > 0,
      readbacks: report.canvas.readbacks,
      origins: report.canvas.origins.size,
      methods: [...report.canvas.methods.entries()]
        .map(([method, count]) => ({ method, count }))
        .sort((a, b) => b.count - a.count || a.method.localeCompare(b.method))
    },
    hijacking: {
      detected:
        report.hijacking.webSocketHosts.size > 0 ||
        report.hijacking.pollingEndpoints.size > 0 ||
        report.hijacking.modifiedGlobals.size > 0 ||
        report.hijacking.injectedScripts.size > 0,
      webSockets: [...report.hijacking.webSocketHosts.values()]
        .reduce((total, count) => total + count, 0),
      webSocketHosts: [...report.hijacking.webSocketHosts.keys()].sort(),
      polling: report.hijacking.pollingEndpoints.size,
      pollingEndpoints: [...report.hijacking.pollingEndpoints.entries()]
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count || a.endpoint.localeCompare(b.endpoint)),
      modifiedGlobals: [...report.hijacking.modifiedGlobals].sort(),
      injectedScripts: [...report.hijacking.injectedScripts].sort()
    },
    advancedTracking: {
      bounce: {
        detected: bounceIntermediates.length > 0,
        redirects: Math.max(0, navigationChain.length - 1),
        chain: navigationChain,
        intermediates: bounceIntermediates
      },
      queryParameters: {
        detected: report.trackingParameters.total > 0,
        total: report.trackingParameters.total,
        domains: report.trackingParameters.domains.size,
        parameters: [...report.trackingParameters.names.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      },
      cookieSync: {
        detected: cookieSyncDetected,
        sharedIdentifiers: sharedIdentifiers.length,
        endpointSignals: report.cookieSync.endpointSignals.size,
        bounceRelays: bounceIdentifierRelay ? 1 : 0,
        domains: report.cookieSync.domains.size
      }
    },
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

function registerCanvasSnapshot(report, message, sender) {
  const snapshotKey = `${sender.frameId ?? 0}:${message.origin || "null"}`;
  const previous = report.canvas.snapshots.get(snapshotKey) || {
    readbacks: 0,
    methods: new Map()
  };

  const readbacks = Math.max(0, Number(message.readbacks) || 0);
  report.canvas.readbacks += Math.max(0, readbacks - previous.readbacks);

  const currentMethods = new Map();
  (message.methods || []).forEach(({ method, count }) => {
    if (typeof method !== "string") {
      return;
    }

    const currentCount = Math.max(0, Number(count) || 0);
    const previousCount = previous.methods.get(method) || 0;
    const difference = Math.max(0, currentCount - previousCount);
    currentMethods.set(method, currentCount);
    report.canvas.methods.set(
      method,
      (report.canvas.methods.get(method) || 0) + difference
    );
  });

  report.canvas.snapshots.set(snapshotKey, {
    readbacks,
    methods: currentMethods
  });

  if (message.origin && message.origin !== "null") {
    report.canvas.origins.add(message.origin);
  }
}

function registerHijackingEvent(report, message) {
  if (message.kind === "global-change" && typeof message.name === "string") {
    report.hijacking.modifiedGlobals.add(message.name);
  }

  if (message.kind === "third-party-script" && typeof message.url === "string") {
    report.hijacking.injectedScripts.add(message.url);
  }
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
      const previousReport = reportsByTab.get(details.tabId);
      const nextHost = hostnameFromUrl(details.url);
      const pendingRedirect = redirectChainsByTab.get(details.tabId);
      const followsRecordedRedirect =
        pendingRedirect &&
        pendingRedirect.nextHost === nextHost &&
        Date.now() - pendingRedirect.recordedAt < 5000;

      if (followsRecordedRedirect) {
        const report = createReport(details.url, true);
        report.navigationRequestId = details.requestId;
        report.navigationHosts = [...pendingRedirect.chain];
        reportsByTab.set(details.tabId, report);
        redirectChainsByTab.delete(details.tabId);
      } else if (
        !previousReport ||
        previousReport.navigationRequestId !== details.requestId
      ) {
        const report = createReport(details.url, true);
        report.navigationRequestId = details.requestId;

        if (
          previousReport?.pageHost &&
          previousReport.pageHost !== report.pageHost
        ) {
          report.navigationHosts.unshift(previousReport.pageHost);
        }

        reportsByTab.set(details.tabId, report);
      } else {
        registerMainFrame(previousReport, details);
      }

      registerTrackingParameters(reportsByTab.get(details.tabId), details);
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
    registerTrackingParameters(report, details);
    registerHijackingNetworkIndicator(report, details, requestHost);

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

browser.webRequest.onBeforeRedirect.addListener(
  registerMainFrameRedirect,
  { urls: ["<all_urls>"] }
);

browser.tabs.onRemoved.addListener((tabId) => {
  reportsByTab.delete(tabId);
  redirectChainsByTab.delete(tabId);
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "STORAGE_REPORT" && Number.isInteger(sender.tab?.id)) {
    if (!reportsByTab.has(sender.tab.id)) {
      reportsByTab.set(sender.tab.id, createReport(sender.tab.url));
    }

    registerStorageSnapshot(reportsByTab.get(sender.tab.id), message);
    return Promise.resolve({ received: true });
  }

  if (message?.type === "CANVAS_SNAPSHOT" && Number.isInteger(sender.tab?.id)) {
    if (!reportsByTab.has(sender.tab.id)) {
      reportsByTab.set(sender.tab.id, createReport(sender.tab.url));
    }

    registerCanvasSnapshot(reportsByTab.get(sender.tab.id), message, sender);
    return Promise.resolve({ received: true });
  }

  if (message?.type === "HIJACKING_EVENT" && Number.isInteger(sender.tab?.id)) {
    if (!reportsByTab.has(sender.tab.id)) {
      reportsByTab.set(sender.tab.id, createReport(sender.tab.url));
    }

    registerHijackingEvent(reportsByTab.get(sender.tab.id), message);
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
