// ─────────────────────────────────────────────
//  FormFill Pro — Popup Script (v4)
//  Multi-user, multi-select, Fill Form default tab
// ─────────────────────────────────────────────

'use strict';

const MAX_SLOTS = 6;


// ── DOM — Shared ──────────────────────────────
const statusBadge   = document.getElementById('status-badge');
const statusText    = document.getElementById('status-text');
const tabBtns       = document.querySelectorAll('.tab-btn');
const tabPanels     = document.querySelectorAll('.tab-content');

// ── DOM — Profile tab ─────────────────────────
const inpName       = document.getElementById('inp-name');
const inpAge        = document.getElementById('inp-age');
const inpAadhar     = document.getElementById('inp-aadhar');
const genderGroup   = document.getElementById('gender-group');
const pillBtns      = genderGroup.querySelectorAll('.pill-btn');
const btnSave       = document.getElementById('btn-save');
const btnClear      = document.getElementById('btn-clear');
const saveLabel     = document.getElementById('save-label');
const btnToggle     = document.getElementById('btn-toggle-aadhar');
const iconEye       = document.getElementById('icon-eye');
const iconEyeOff    = document.getElementById('icon-eye-off');
const btnExport     = document.getElementById('btn-export');
const btnImport     = document.getElementById('btn-import');
const fileImport    = document.getElementById('file-import');


// ── DOM — General tab ─────────────────────────
const inpEmail      = document.getElementById('inp-email');
const inpCity       = document.getElementById('inp-city');
const inpPincode    = document.getElementById('inp-pincode');
const inpState      = document.getElementById('inp-state');
const inpCountry    = document.getElementById('inp-country');
const btnSaveGen    = document.getElementById('btn-save-general');
const btnClearGen   = document.getElementById('btn-clear-general');

// ── DOM — Fill tab ────────────────────────────
const userGrid      = document.getElementById('user-grid');
const fillResult    = document.getElementById('fill-result');
const optTrigger    = document.getElementById('opt-trigger');

const gpBody        = document.getElementById('gp-body');
const btnEditGen    = document.getElementById('btn-edit-general');
const btnFillAll    = document.getElementById('btn-fill-all');
const fillCount     = document.getElementById('fill-count');
const fillActionHint = document.getElementById('fill-action-hint');
const fillGenBadge  = document.getElementById('fill-general-badge');

// ── State ─────────────────────────────────────
let profiles = Array.from({ length: MAX_SLOTS }, () =>
  ({ name: '', gender: '', age: '', aadhar: '' })
);
let general = { email: '', city: '', state: '', country: '', pincode: '' };
let selectedUsers   = new Set();   // indices of selected user slots
let activeSlot      = 0;
let aadharVisible   = false;
let selectedGender  = '';
let statusTimeout   = null;

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function formatAadhar(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function hasData(p) {
  return !!(p && (p.name || p.gender || p.age || p.aadhar));
}

function hasGeneral() {
  return !!(general.email || general.city || general.state || general.country || general.pincode);
}

function maskAadhar(raw) {
  if (!raw) return '—';
  const d = raw.replace(/\s/g, '');
  if (d.length < 8) return d;
  return `${d.slice(0, 4)} ···· ${d.slice(8)}`;
}

// ─────────────────────────────────────────────
//  Status badge
// ─────────────────────────────────────────────

function showStatus(msg, type = 'saved') {
  if (statusTimeout) clearTimeout(statusTimeout);
  statusBadge.className = `status-badge status-${type}`;
  statusText.textContent = msg;
  statusBadge.classList.remove('hidden');
  requestAnimationFrame(() => statusBadge.classList.add('visible'));
  statusTimeout = setTimeout(() => {
    statusBadge.classList.remove('visible');
    setTimeout(() => statusBadge.classList.add('hidden'), 250);
  }, 2500);
}

// ─────────────────────────────────────────────
//  Tab navigation
// ─────────────────────────────────────────────

function switchTab(target) {
  tabBtns.forEach((b)  => b.classList.toggle('active',  b.dataset.tab === target));
  tabPanels.forEach((p) => p.classList.toggle('active', p.id === `panel-${target}`));
  if (target === 'fill') {
    renderUserGrid(true);
    renderGeneralPreview();
    updateFillButton();
  }
}


tabBtns.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
btnEditGen.addEventListener('click', () => switchTab('general'));

// ─────────────────────────────────────────────
//  Fill button state
// ─────────────────────────────────────────────

function updateFillButton() {
  const count    = selectedUsers.size;
  const hasGen   = hasGeneral();
  const canFill  = count > 0 || hasGen;

  btnFillAll.disabled = !canFill;

  if (count === 0) {
    fillCount.textContent = 'No users selected';
    fillActionHint.textContent = hasGen ? 'Will fill general details only' : 'Select users below to fill';
  } else {
    fillCount.textContent = `${count} user${count > 1 ? 's' : ''} selected`;
    fillActionHint.textContent = 'Tap Fill Now to autofill the form';
  }

  fillGenBadge.classList.toggle('hidden', !hasGen);
}

// ─────────────────────────────────────────────
//  User Grid (Fill tab)
// ─────────────────────────────────────────────

function updateGridSelectionVisuals() {
  for (let i = 0; i < MAX_SLOTS; i++) {
    const card = userGrid.querySelector(`.user-card[data-slot="${i}"]`);
    const chk  = document.getElementById(`user-check-${i}`);
    if (!card || !chk) continue;
    const sel = selectedUsers.has(i);
    card.classList.toggle('selected', sel);
    chk.checked = sel;
  }
  updateFillButton();
}

function renderUserGrid(forceRebuild = false) {
  if (!forceRebuild && userGrid.children.length === MAX_SLOTS) {
    updateGridSelectionVisuals();
    return;
  }

  userGrid.innerHTML = '';

  for (let i = 0; i < MAX_SLOTS; i++) {
    const p    = profiles[i];
    const full = hasData(p);
    const sel  = selectedUsers.has(i);

    const card = document.createElement('div');
    card.className = [
      'user-card',
      full ? 'has-data' : 'empty',
      sel  ? 'selected' : ''
    ].join(' ').trim();
    card.dataset.slot = i;

    // ── Head ──
    const head = document.createElement('div');
    head.className = 'user-card-head';
    head.innerHTML = `
      <div class="user-check-wrap">
        <input
          type="checkbox"
          class="user-check-input"
          id="user-check-${i}"
          data-slot="${i}"
          ${sel    ? 'checked'  : ''}
          ${!full  ? 'disabled' : ''}
        />
        <div class="user-check-box">
          <svg class="user-check-tick" width="10" height="10" viewBox="0 0 12 12" fill="none">
            <polyline points="2,6 5,9 10,3" stroke="#fff" stroke-width="1.8"
                      stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="user-card-title">
        <span class="user-badge">${i + 1}</span>
        User ${i + 1}
      </div>
    `;

    // ── Body ──
    const body = document.createElement('div');
    body.className = 'user-card-body';

    if (full) {
      body.innerHTML = `
        <div class="card-row">
          <span class="card-key">Name</span>
          <span class="card-val">${p.name || '—'}</span>
        </div>
        <div class="card-row">
          <span class="card-key">Gender</span>
          <span class="card-val">${p.gender || '—'}</span>
        </div>
        <div class="card-row">
          <span class="card-key">Age</span>
          <span class="card-val">${p.age || '—'}</span>
        </div>
        <div class="card-row">
          <span class="card-key">Aadhar</span>
          <span class="card-val card-aadhar">${maskAadhar(p.aadhar)}</span>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="card-empty-msg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          Empty slot<br/>
          <small>Add in Profiles tab</small>
        </div>
      `;
    }

    card.appendChild(head);
    card.appendChild(body);
    userGrid.appendChild(card);
  }

  updateFillButton();
}

// Delegate card click / checkbox change events once on grid container
userGrid.addEventListener('change', (e) => {
  if (e.target.classList.contains('user-check-input')) {
    const idx = parseInt(e.target.dataset.slot);
    if (e.target.checked) selectedUsers.add(idx);
    else                  selectedUsers.delete(idx);
    updateGridSelectionVisuals();
  }
});

userGrid.addEventListener('click', (e) => {
  if (e.target.classList.contains('user-check-input')) return;
  const card = e.target.closest('.user-card.has-data');
  if (!card) return;
  const idx = parseInt(card.dataset.slot);
  if (selectedUsers.has(idx)) selectedUsers.delete(idx);
  else                         selectedUsers.add(idx);
  updateGridSelectionVisuals();
});


// ─────────────────────────────────────────────
//  General Preview (Fill tab)
// ─────────────────────────────────────────────

function renderGeneralPreview() {
  const rows = [
    { key: 'Email',   val: general.email   },
    { key: 'City',    val: general.city    },
    { key: 'Pincode', val: general.pincode },
    { key: 'State',   val: general.state   },
    { key: 'Country', val: general.country },
  ];

  gpBody.innerHTML = rows.map(({ key, val }) => `
    <div class="gp-row">
      <span class="gp-key">${key}</span>
      <span class="gp-val${val ? '' : ' empty'}">${val || '—'}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
//  Slot selector (Profile tab)
// ─────────────────────────────────────────────

function renderSlotTabs() {
  for (let i = 0; i < MAX_SLOTS; i++) {
    const tab = document.getElementById(`slot-tab-${i}`);
    const pip = document.getElementById(`slot-pip-${i}`);
    if (!tab || !pip) continue;
    tab.classList.toggle('active', i === activeSlot);
    pip.classList.toggle('has-data', hasData(profiles[i]));
  }
  saveLabel.textContent = `Save User ${activeSlot + 1}`;
}

document.querySelectorAll('.slot-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeSlot = parseInt(btn.dataset.slot);
    loadSlot(activeSlot);
    renderSlotTabs();
  });
});

// ─────────────────────────────────────────────
//  Gender pills
// ─────────────────────────────────────────────

function selectGenderPill(value) {
  pillBtns.forEach((b) => b.classList.toggle('selected', b.dataset.value === value));
  selectedGender = value || '';
}

pillBtns.forEach((btn) => btn.addEventListener('click', () => selectGenderPill(btn.dataset.value)));

// ─────────────────────────────────────────────
//  Aadhar formatting & eye toggle
// ─────────────────────────────────────────────

inpAadhar.addEventListener('input', () => {
  const f = formatAadhar(inpAadhar.value);
  inpAadhar.value = f;
  inpAadhar.setSelectionRange(f.length, f.length);
});

btnToggle.addEventListener('click', () => {
  aadharVisible = !aadharVisible;
  inpAadhar.type = aadharVisible ? 'text' : 'password';
  iconEye.classList.toggle('hidden', aadharVisible);
  iconEyeOff.classList.toggle('hidden', !aadharVisible);
});

// ─────────────────────────────────────────────
//  Load / Save / Clear — User Slots
// ─────────────────────────────────────────────

function loadSlot(index) {
  const p         = profiles[index];
  inpName.value   = p.name   || '';
  inpAge.value    = p.age    || '';
  inpAadhar.value = p.aadhar ? formatAadhar(p.aadhar) : '';
  selectGenderPill(p.gender || '');
}

async function saveCurrentSlot() {
  const name   = inpName.value.trim();
  const age    = inpAge.value.trim();
  const aadhar = inpAadhar.value.replace(/\s/g, '');
  const gender = selectedGender;

  if (!name && !age && !aadhar && !gender) { showStatus('Nothing to save', 'error'); return; }
  if (aadhar && aadhar.length !== 12)       { showStatus('Aadhar must be 12 digits', 'error'); return; }

  const wasEmpty = !hasData(profiles[activeSlot]);
  profiles[activeSlot] = { name, age, gender, aadhar };
  await chrome.storage.local.set({ ffProfiles: profiles });

  // Auto-select newly saved slot
  if (wasEmpty) selectedUsers.add(activeSlot);

  renderSlotTabs();
  updateFillButton();
  showStatus(`User ${activeSlot + 1} saved!`, 'saved');
}

async function clearCurrentSlot() {
  profiles[activeSlot] = { name: '', gender: '', age: '', aadhar: '' };
  await chrome.storage.local.set({ ffProfiles: profiles });
  inpName.value = ''; inpAge.value = ''; inpAadhar.value = '';
  selectGenderPill('');
  selectedUsers.delete(activeSlot);
  renderSlotTabs();
  updateFillButton();
  showStatus(`User ${activeSlot + 1} cleared`, 'saved');
}

btnSave.addEventListener('click', saveCurrentSlot);
btnClear.addEventListener('click', clearCurrentSlot);

// ─────────────────────────────────────────────
//  Load / Save / Clear — General Details
// ─────────────────────────────────────────────

function loadGeneralForm() {
  inpEmail.value   = general.email   || '';
  inpCity.value    = general.city    || '';
  inpPincode.value = general.pincode || '';
  inpState.value   = general.state   || '';
  inpCountry.value = general.country || '';
}

async function saveGeneral() {
  const email   = inpEmail.value.trim();
  const city    = inpCity.value.trim();
  const pincode = inpPincode.value.trim();
  const state   = inpState.value.trim();
  const country = inpCountry.value.trim();

  if (!email && !city && !pincode && !state && !country) {
    showStatus('Nothing to save', 'error'); return;
  }

  general = { email, city, pincode, state, country };
  await chrome.storage.local.set({ ffGeneral: general });
  renderGeneralPreview();
  updateFillButton();
  showStatus('General details saved!', 'saved');
}

async function clearGeneral() {
  general = { email: '', city: '', state: '', country: '', pincode: '' };
  await chrome.storage.local.set({ ffGeneral: general });
  loadGeneralForm();
  renderGeneralPreview();
  updateFillButton();
  showStatus('General details cleared', 'saved');
}

btnSaveGen.addEventListener('click', saveGeneral);
btnClearGen.addEventListener('click', clearGeneral);

// ─────────────────────────────────────────────
//  Autofill helpers
// ─────────────────────────────────────────────

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch { /* already injected or restricted page */ }
}

function showFillResult(msg, type) {
  fillResult.textContent = msg;
  fillResult.className   = `fill-result ${type}`;
  fillResult.classList.remove('hidden');
  setTimeout(() => fillResult.classList.add('hidden'), 4500);
}

// ─────────────────────────────────────────────
//  Fill selected users + general details
// ─────────────────────────────────────────────

async function fillSelected() {
  const selectedProfiles = [...selectedUsers]
    .sort()                               // fill in slot order (1→2→3→4)
    .map((i) => profiles[i])
    .filter(hasData);

  if (selectedProfiles.length === 0 && !hasGeneral()) {
    showFillResult('Nothing to fill. Save profiles or general details first.', 'info');
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id) { showFillResult('No active tab found.', 'error'); return; }
  await ensureContentScript(tab.id);

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, {
      type:     'FF_FILL_ALL',
      profiles: selectedProfiles,
      general,
      options:  { triggerEvents: optTrigger.checked }
    });

  } catch {
    showFillResult('Could not connect to page. Try refreshing.', 'error');
    return;
  }

  if (!response || response.filled === 0) {
    showFillResult('No matching fields found on this page.', 'info');
  } else {
    const uc  = selectedProfiles.length;
    const msg = [
      `✓ Filled ${response.filled} fields`,
      uc       ? `across ${uc} user${uc > 1 ? 's' : ''}` : '',
      hasGeneral() ? '+ general details' : '',
    ].filter(Boolean).join(' ') + '.';
    showFillResult(msg, 'success');
  }
}

btnFillAll.addEventListener('click', fillSelected);

// ─────────────────────────────────────────────
//  Backup & Restore (Export / Import JSON)
// ─────────────────────────────────────────────

function triggerFallbackDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showStatus('Export downloaded!', 'saved');
}

function exportBackup() {
  try {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles,
      general
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const filename = `formfill-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const dataUri  = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);

    if (chrome.downloads && typeof chrome.downloads.download === 'function') {
      chrome.downloads.download({
        url: dataUri,
        filename: filename,
        saveAs: false
      }, () => {
        if (chrome.runtime.lastError) {
          triggerFallbackDownload(dataUri, filename);
        } else {
          showStatus('Export downloaded!', 'saved');
        }
      });
    } else {
      triggerFallbackDownload(dataUri, filename);
    }
  } catch (err) {
    showStatus('Export failed', 'error');
  }
}


function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await readTextFile(file);
    if (!text || !text.trim()) throw new Error('Empty file');

    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Invalid JSON format');

    // Flexible profile array extraction
    const rawProfiles = Array.isArray(data.profiles)
      ? data.profiles
      : Array.isArray(data.ffProfiles)
      ? data.ffProfiles
      : Array.isArray(data)
      ? data
      : null;

    if (rawProfiles) {
      for (let i = 0; i < MAX_SLOTS; i++) {
        const p = rawProfiles[i];
        if (p && typeof p === 'object') {
          profiles[i] = {
            name: String(p.name || '').trim(),
            gender: String(p.gender || '').trim(),
            age: String(p.age || '').trim(),
            aadhar: String(p.aadhar || '').trim()
          };
        } else {
          profiles[i] = { name: '', gender: '', age: '', aadhar: '' };
        }
      }
    } else if (data.name || data.aadhar || data.age || data.gender) {
      profiles[0] = {
        name: String(data.name || '').trim(),
        gender: String(data.gender || '').trim(),
        age: String(data.age || '').trim(),
        aadhar: String(data.aadhar || '').trim()
      };
    }

    // General details extraction
    const rawGen = data.general || data.ffGeneral || null;
    if (rawGen && typeof rawGen === 'object') {
      general = {
        email: String(rawGen.email || '').trim(),
        city: String(rawGen.city || '').trim(),
        state: String(rawGen.state || '').trim(),
        country: String(rawGen.country || '').trim(),
        pincode: String(rawGen.pincode || '').trim()
      };
    }

    // 1. Save to local storage synchronously
    await chrome.storage.local.set({ ffProfiles: profiles, ffGeneral: general });

    // 2. Re-calculate selected users
    selectedUsers.clear();
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (hasData(profiles[i])) selectedUsers.add(i);
    }

    // 3. Force rebuild all views
    loadSlot(activeSlot);
    renderSlotTabs();
    loadGeneralForm();
    renderUserGrid(true);
    renderGeneralPreview();
    updateFillButton();

    showStatus('Backup restored!', 'saved');
  } catch (err) {
    console.error('[FormFill Pro] Import error:', err);
    showStatus('Invalid backup file', 'error');
  } finally {
    if (fileImport) fileImport.value = '';
  }
}

if (btnExport) btnExport.addEventListener('click', exportBackup);

if (btnImport && fileImport) {
  btnImport.addEventListener('click', (e) => {
    e.preventDefault();
    fileImport.click();
  });

  fileImport.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      await importBackup(e.target.files[0]);
    }
  });
}




// ─────────────────────────────────────────────
//  Init — load from storage
// ─────────────────────────────────────────────

async function init() {
  const stored = await chrome.storage.local.get(['ffProfiles', 'ffProfile', 'ffGeneral']);

  // Migrate old single-profile format → slot 0
  if (stored.ffProfile && !stored.ffProfiles) {
    profiles[0] = stored.ffProfile;
    await chrome.storage.local.set({ ffProfiles: profiles });
    await chrome.storage.local.remove('ffProfile');
  } else if (stored.ffProfiles && Array.isArray(stored.ffProfiles)) {
    stored.ffProfiles.forEach((p, i) => {
      if (i < MAX_SLOTS) profiles[i] = p || { name: '', gender: '', age: '', aadhar: '' };
    });
  }

  if (stored.ffGeneral) {
    general = { ...general, ...stored.ffGeneral };
  }

  // Auto-select all slots that have data
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (hasData(profiles[i])) selectedUsers.add(i);
  }

  // Initialise views
  renderSlotTabs();
  loadSlot(0);
  loadGeneralForm();

  // Fill tab is default — render it
  renderUserGrid();
  renderGeneralPreview();
  updateFillButton();
}

init();
