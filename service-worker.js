// ─────────────────────────────────────────────
//  FormFill Pro — Service Worker (MV3)
// ─────────────────────────────────────────────

'use strict';

const extAPI = typeof browser !== 'undefined' ? browser : chrome;

extAPI.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await extAPI.storage.local.set({ ffProfiles: [] });
    console.log('[FormFill Pro] Extension installed.');
  }
});

extAPI.runtime.onStartup.addListener(() => {
  console.log('[FormFill Pro] Extension background active.');
});

