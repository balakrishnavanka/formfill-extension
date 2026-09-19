// ─────────────────────────────────────────────
//  FormFill Pro — Service Worker (MV3)
// ─────────────────────────────────────────────

'use strict';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Initialize empty profile on first install
    await chrome.storage.local.set({ ffProfile: {} });
    console.log('[FormFill Pro] Extension installed.');
  }
});

// Keep alive ping — not needed for basic storage use case, but good practice
chrome.runtime.onStartup.addListener(() => {
  console.log('[FormFill Pro] Browser started.');
});
