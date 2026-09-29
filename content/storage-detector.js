function storageLength(storageName) {
  try {
    return window[storageName].length;
  } catch {
    return null;
  }
}

async function indexedDatabaseCount() {
  try {
    if (typeof indexedDB.databases !== "function") {
      return null;
    }

    const databases = await indexedDB.databases();
    return databases.length;
  } catch {
    return null;
  }
}

async function sendStorageSnapshot() {
  const snapshot = {
    type: "STORAGE_REPORT",
    origin: window.location.origin,
    frameUrl: window.location.href,
    localStorageEntries: storageLength("localStorage"),
    sessionStorageEntries: storageLength("sessionStorage"),
    indexedDBDatabases: await indexedDatabaseCount()
  };

  try {
    await browser.runtime.sendMessage(snapshot);
  } catch (error) {
    console.debug("Sentinela: contexto da extensão indisponível.", error.message);
  }
}

sendStorageSnapshot();
window.setInterval(sendStorageSnapshot, 2000);
