// ─────────────────────────────────────────────
//  FormFill Pro — Service Worker (MV3)
//  Handles CDP (Chrome DevTools Protocol) for
//  dispatching truly trusted input events.
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

// ═══════════════════════════════════════════
//  CDP Debugger Management
// ═══════════════════════════════════════════

// Track which tabs have debugger attached
const attachedTabs = new Set();

async function ensureDebugger(tabId) {
  if (attachedTabs.has(tabId)) return true;
  try {
    await extAPI.debugger.attach({ tabId }, '1.3');
    attachedTabs.add(tabId);
    return true;
  } catch (e) {
    // Already attached or permission denied
    if (e.message && e.message.includes('Already attached')) {
      attachedTabs.add(tabId);
      return true;
    }
    console.warn('[FormFill Pro] Could not attach debugger:', e.message);
    return false;
  }
}

function cdpSend(tabId, method, params) {
  return new Promise((resolve, reject) => {
    extAPI.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (extAPI.runtime.lastError) {
        reject(new Error(extAPI.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

// Clean up debugger when tab is closed or navigated away
if (extAPI.debugger) {
  extAPI.debugger.onDetach.addListener((source) => {
    if (source.tabId) attachedTabs.delete(source.tabId);
  });
}

// ═══════════════════════════════════════════
//  Message Handler
// ═══════════════════════════════════════════

extAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return false;
  const tabId = sender.tab.id;

  if (message.action === 'CDP_CLICK') {
    const { x, y } = message.payload;
    (async () => {
      try {
        const attached = await ensureDebugger(tabId);
        if (!attached) { sendResponse({ ok: false }); return; }

        // Mouse move → mousePressed → mouseReleased (full click)
        await cdpSend(tabId, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x, y, button: 'none', clickCount: 0
        });
        await new Promise(r => setTimeout(r, 10));
        await cdpSend(tabId, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: 1
        });
        await new Promise(r => setTimeout(r, 15));
        await cdpSend(tabId, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: 1
        });
        sendResponse({ ok: true });
      } catch (e) {
        console.warn('[FormFill Pro] CDP_CLICK failed:', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // async response
  }

  if (message.action === 'CDP_TYPE') {
    const { text } = message.payload;
    (async () => {
      try {
        const attached = await ensureDebugger(tabId);
        if (!attached) { sendResponse({ ok: false }); return; }

        // Use Input.insertText for instantaneous typing (prevents Bitwarden from interrupting midway)
        try {
          await cdpSend(tabId, 'Input.insertText', { text });
          sendResponse({ ok: true });
          return;
        } catch (e) {
          console.warn('[FormFill Pro] Input.insertText failed, falling back to dispatchKeyEvent:', e.message);
        }

        // Fallback: Type each character rapidly
        for (const ch of text) {
          await cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
          await cdpSend(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', text: ch, key: ch, unmodifiedText: ch });
          await new Promise(r => setTimeout(r, 10));
        }
        sendResponse({ ok: true });
      } catch (e) {
        console.warn('[FormFill Pro] CDP_TYPE failed:', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (message.action === 'TOGGLE_PM') {
    const disable = message.payload.disable;
    (async () => {
      try {
        const exts = await chrome.management.getAll();
        const targets = ['bitwarden', '1password', 'lastpass', 'dashlane', 'roboform', 'keeper'];
        for (const ext of exts) {
          if (ext.id === chrome.runtime.id) continue;
          const isTarget = targets.some(t => ext.name.toLowerCase().includes(t));
          if (isTarget) {
            // If we are disabling, only disable if currently enabled. 
            // If we are enabling, only enable if we disabled it (assume we want to re-enable them).
            if (disable && ext.enabled) {
              await chrome.management.setEnabled(ext.id, false);
              console.log(`[FormFill Pro] Disabled ${ext.name}`);
            } else if (!disable && !ext.enabled) {
              await chrome.management.setEnabled(ext.id, true);
              console.log(`[FormFill Pro] Enabled ${ext.name}`);
            }
          }
        }
        sendResponse({ ok: true });
      } catch (e) {
        console.error('[FormFill Pro] Failed to toggle PM:', e);
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  if (message.action === 'CDP_SELECT_ALL_DELETE') {
    (async () => {
      try {
        const attached = await ensureDebugger(tabId);
        if (!attached) { sendResponse({ ok: false }); return; }

        // Ctrl+A to select all
        await cdpSend(tabId, 'Input.dispatchKeyEvent', {
          type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, // 2 = Ctrl
          windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
        });
        await cdpSend(tabId, 'Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2,
          windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65
        });
        await new Promise(r => setTimeout(r, 15));

        // Delete/Backspace to clear
        await cdpSend(tabId, 'Input.dispatchKeyEvent', {
          type: 'keyDown', key: 'Backspace', code: 'Backspace',
          windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8
        });
        await cdpSend(tabId, 'Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'Backspace', code: 'Backspace',
          windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8
        });
        sendResponse({ ok: true });
      } catch (e) {
        console.warn('[FormFill Pro] CDP_SELECT_ALL_DELETE failed:', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  return false;
});
