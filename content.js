// ─────────────────────────────────────────────
//  FormFill Pro — Content Script (v11)
//  Uses chrome.debugger (CDP) for truly trusted
//  mouse events that pass all isTrusted checks.
// ─────────────────────────────────────────────

'use strict';

if (!window.__ffProLoaded) {
  window.__ffProLoaded = true;

  // ═══════════════════════════════════════════
  //  HEURISTIC TABLES
  // ═══════════════════════════════════════════

  const FIELD_HINTS = {
    name: {
      keywords: ['name','fullname','full-name','full_name','yourname','username',
                 'firstname','first-name','first_name','lastname','last-name','last_name',
                 'given','surname','applicant','pilgrimname','pilgrim_name'],
      autocomplete: ['name','given-name','family-name','username']
    },
    gender: {
      keywords: ['gender','sex','genderid','gender_id','biologicalsex','biological_sex',
                 'selectgender','choosegender','pilgrimgender','pilgrim_gender'],
      autocomplete: ['sex']
    },
    age: {
      keywords: ['age','years','agein','howold','yourage','pilgrimage','pilgrim_age'],
      autocomplete: []
    },
    aadhar: {
      keywords: ['aadhar','aadhaar','adhaar','adhar','uid','uidai',
                 'aadharno','aadhaarno','aadhar_no','aadhaar_no',
                 'aadhar_number','aadhaar_number','aadhar-number','aadhaar-number'],
      autocomplete: []
    },
    photoidtype: {
      keywords: ['idtype','id_type','documenttype','document_type','doctype','doc_type',
                 'photoid','photo_id','idproof','id_proof','identitytype','identity_type',
                 'prooftype','proof_type','governmentid','government_id','govid','gov_id',
                 'selectid','chooseid','verificationtype','idcard','id_card',
                 'proofofidentity','identitydocument','idprooftype','id_proof_type',
                 'idprooftypeid','id_proof_type_id','idproofno','identityproof',
                 'photoidproof','photo_id_proof'],
      autocomplete: []
    },
    photoidnumber: {
      keywords: ['idnumber','id_number','documentnumber','document_number',
                 'docnumber','doc_number','photoidnumber','photo_id_number',
                 'idno','id_no','proofnumber','proof_number','govtidnumber',
                 'identitynumber','identity_number','verificationnumber',
                 'licencenumber','passportnumber','pannumber','idproofnumber',
                 'id_proof_number','idproofno','id_proof_no'],
      autocomplete: []
    },
    email: {
      keywords: ['email','emailaddress','email_address','emailid','email_id',
                 'mail','contactemail','contact_email','useremail','user_email',
                 'pilgrimemail','pilgrim_email'],
      autocomplete: ['email']
    },
    city: {
      keywords: ['city','cityname','city_name','town','municipality',
                 'addresscity','address_city','hometown','home_town',
                 'pilgrimcity','pilgrim_city','village','district','mandal','location','place'],
      autocomplete: ['address-level2']
    },
    state: {
      keywords: ['state','statename','state_name','province','region',
                 'addressstate','address_state','pilgrimstate','pilgrim_state'],
      autocomplete: ['address-level1']
    },
    country: {
      keywords: ['country','countryname','country_name','nation',
                 'addresscountry','address_country','pilgrimcountry','pilgrim_country'],
      autocomplete: ['country','country-name']
    },
    pincode: {
      keywords: ['pincode','pin_code','pin','zipcode','zip_code','zip',
                 'postalcode','postal_code','postcode','post_code',
                 'addresspin','address_pin','pilgrimpincode','pilgrim_pincode'],
      autocomplete: ['postal-code']
    }
  };

  function norm(s) {
    return (s || '').toLowerCase().replace(/[\s_\-]+/g, '');
  }

  for (const k in FIELD_HINTS) {
    FIELD_HINTS[k].normKeywords = FIELD_HINTS[k].keywords.map(norm);
    FIELD_HINTS[k].normAutocomplete = FIELD_HINTS[k].autocomplete.map(norm);
  }

  const AADHAR_OPTION_KEYWORDS = [
    'aadhaar','aadhar','adhaar','adhar','uid','uidai',
    'aadhaarcard','aadharcard','aadhaar card','aadhar card',
    'photo id proof','id proof'
  ];

  let metaCache = new Map();

  function getElMeta(el) {
    if (metaCache.has(el)) return metaCache.get(el);

    const sig = ['id','name','type','placeholder','aria-label','label','autocomplete','title','class',
                 'formcontrolname','formControlName','ng-reflect-name','data-testid','data-test-id',
                 'data-qa','data-cy','aria-describedby','aria-labelledby']
      .map((a) => norm(el.getAttribute(a) || ''))
      .join(' ');

    let lblText = '';
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) lblText = norm(lbl.textContent);
    }
    if (!lblText) {
      const anc = el.closest('label');
      if (anc) lblText = norm(anc.textContent);
    }
    if (!lblText) {
      const prev = el.previousElementSibling;
      if (prev && ['LABEL','SPAN','P','DIV'].includes(prev.tagName))
        lblText = norm(prev.textContent);
    }
    if (!lblText) {
      const next = el.nextElementSibling;
      if (next && ['LABEL','SPAN','P','DIV'].includes(next.tagName))
        lblText = norm(next.textContent);
    }
    if (!lblText && el.parentElement) {
      const pLbl = el.parentElement.querySelector('label');
      if (pLbl) lblText = norm(pLbl.textContent);
    }
    if (!lblText) {
      const lblAttr = el.getAttribute('label');
      if (lblAttr) lblText = norm(lblAttr);
    }

    const meta = {
      combined: sig + ' ' + lblText,
      autocomplete: norm(el.getAttribute('autocomplete') || '')
    };
    metaCache.set(el, meta);
    return meta;
  }

  function scoreField(el, key) {
    const hints = FIELD_HINTS[key];
    const meta  = getElMeta(el);
    let score   = 0;
    for (const kw of hints.normKeywords) {
      if (meta.combined.includes(kw)) score += 2;
    }
    for (const ac of hints.normAutocomplete) {
      if (meta.autocomplete.includes(ac)) score += 3;
    }
    return score;
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function waitFor(condition, timeoutMs = 3000, intervalMs = 50) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function poll() {
        const v = condition();
        if (v)                               return resolve(v);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(poll, intervalMs);
      })();
    });
  }

  // ═══════════════════════════════════════════
  //  CDP CLICK — truly trusted mouse events
  //  via chrome.debugger dispatched from the
  //  service worker.
  // ═══════════════════════════════════════════

  function cdpClick(x, y) {
    return new Promise((resolve) => {
      try {
        extAPI.runtime.sendMessage(
          { action: 'CDP_CLICK', payload: { x, y } },
          (resp) => resolve(extAPI.runtime.lastError ? { ok: false } : (resp || { ok: false }))
        );
      } catch (e) {
        resolve({ ok: false });
      }
    });
  }

  function cdpType(text) {
    return new Promise((resolve) => {
      try {
        extAPI.runtime.sendMessage(
          { action: 'CDP_TYPE', payload: { text } },
          (resp) => resolve(extAPI.runtime.lastError ? { ok: false } : (resp || { ok: false }))
        );
      } catch (e) {
        resolve({ ok: false });
      }
    });
  }

  /**
   * Perform a truly trusted click on an element using CDP.
   * Falls back to synthetic events if CDP is unavailable.
   */
  async function trustedClick(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch {}
    await delay(10);

    const rect = el.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);

    const resp = await cdpClick(cx, cy);
    if (!resp || !resp.ok) {
      // Fallback: synthetic events
      el.focus();
      el.click();
    }
    await delay(20);
  }

  /**
   * Type text into the currently focused element using CDP.
   * Falls back to value setter if CDP is unavailable.
   */
  async function trustedType(el, text) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch {}
    await delay(10);

    // Click to focus for real
    const rect = el.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);
    await cdpClick(cx, cy);
    await delay(20);

    // Select all existing text and delete it
    const selectResp = await new Promise((resolve) => {
      try {
        extAPI.runtime.sendMessage(
          { action: 'CDP_SELECT_ALL_DELETE' },
          (resp) => resolve(extAPI.runtime.lastError ? { ok: false } : (resp || { ok: false }))
        );
      } catch (e) {
        resolve({ ok: false });
      }
    });
    await delay(15);

    // Type the text via CDP
    const resp = await cdpType(text);
    
    if (!resp || !resp.ok) {
      // Fallback: advanced synthetic typing simulation (For Firefox)
      await setElementValueFallback(el, text);
    }
    await delay(15);
  }

  /**
   * Advanced fallback value setter for Firefox (which lacks CDP support).
   * It painstakingly simulates individual keystroke events and bypasses React's
   * internal value trackers to spoof a human typing as closely as possible without CDP.
   */
  async function setElementValueFallback(el, strVal) {
    if (!el) return;
    const wasReadonly = el.hasAttribute('readonly');
    const wasDisabled = el.hasAttribute('disabled');
    if (wasReadonly) el.removeAttribute('readonly');
    if (wasDisabled) el.removeAttribute('disabled');
    el.disabled = false;

    el.focus();
    await delay(10);

    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    
    // Clear field first
    if (el._valueTracker) { try { el._valueTracker.setValue(''); } catch {} }
    if (setter) setter.call(el, '');
    else el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Type character by character synthetically
    for (let i = 0; i < strVal.length; i++) {
      const char = strVal[i];
      const keyCode = char.charCodeAt(0);
      const codeStr = 'Key' + char.toUpperCase();

      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: char, code: codeStr, keyCode }));
      el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: char, code: codeStr, keyCode }));
      
      if (el._valueTracker) { try { el._valueTracker.setValue(el.value); } catch {} }
      if (setter) setter.call(el, el.value + char);
      else el.value += char;
      
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: char, code: codeStr, keyCode }));
      
      await delay(5);
    }

    try { el.setAttribute('value', strVal); } catch {}
    el.dispatchEvent(new Event('change', { bubbles: true }));

    if (wasReadonly) el.setAttribute('readonly', '');
  }

  // Removed stealthType as it breaks React state validation

  // ═══════════════════════════════════════════
  //  GENDER MATCHING & RADIO HELPERS
  // ═══════════════════════════════════════════

  function matchGenderText(rawText, targetGender) {
    if (!rawText || !targetGender) return false;
    const text = norm(rawText);
    const target = norm(targetGender);

    if (target === 'male') {
      if (text.includes('female')) return false;
      if (text === 'male' || text === 'm' || text === 'man' || text === 'boy' || text === 'mr' || text === '1') return true;
      if (text.includes('male') || text.includes('purush')) return true;
      return false;
    }
    if (target === 'female') {
      if (text === 'female' || text === 'f' || text === 'woman' || text === 'girl' || text === 'mrs' || text === 'miss' || text === 'ms' || text === '2') return true;
      if (text.includes('female') || text.includes('stri') || text.includes('mahila')) return true;
      return false;
    }
    if (target === 'other') {
      if (text.includes('female') || (text.includes('male') && !text.includes('trans'))) return false;
      if (text === 'other' || text === 'o' || text === 'transgender' || text === 'nonbinary' || text === 'thirdgender' || text === '3') return true;
      if (text.includes('other') || text.includes('trans')) return true;
      return false;
    }
    if (target.includes('prefer') || target.includes('say')) {
      if (text.includes('prefer') || text.includes('not') || text.includes('disclose') || text.includes('specified')) return true;
      return false;
    }
    return text === target || text.includes(target);
  }

  function findRadioGroups(globalUsed) {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
      .filter((r) => isVisible(r) && !globalUsed.has(r));
    const groupsMap = new Map();
    radios.forEach((r) => {
      const key = r.name ? `name:${r.name}` : `parent:${r.parentElement ? (r.parentElement.id || r.parentElement.className || r.parentElement.tagName) : Math.random()}`;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(r);
    });
    return Array.from(groupsMap.values());
  }

  function bestRadioGroupFor(key, globalUsed) {
    const groups = findRadioGroups(globalUsed);
    let bestGroup = null, bestScore = 1;
    for (const group of groups) {
      const s = scoreField(group[0], key);
      if (s > bestScore) { bestScore = s; bestGroup = group; }
    }
    return bestGroup;
  }

  async function fillRadioGroup(radios, value, isGender) {
    const match = isGender
      ? radios.find((r) => {
          const text = (r.value || '') + ' ' + (r.id || '') + ' ' + (getElMeta(r).combined);
          return matchGenderText(text, value) || matchGenderText(r.value, value);
        })
      : radios.find((r) => {
          const target = norm(value);
          const text = norm((r.value || '') + ' ' + getElMeta(r).combined);
          return text === target || text.includes(target);
        });

    if (match) {
      await trustedClick(match);
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════
  //  FILL — native <select>
  // ═══════════════════════════════════════════

  function fillNativeSelect(el, value, isGender = false) {
    const options = Array.from(el.options);
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;

    let match = isGender
      ? options.find((o) => matchGenderText(o.text, value) || matchGenderText(o.value, value))
      : options.find((o) => norm(o.text) === norm(value) || norm(o.value) === norm(value)) ||
        options.find((o) => norm(o.text).includes(norm(value)) || norm(o.value).includes(norm(value)));

    if (match) {
      if (el._valueTracker) { try { el._valueTracker.setValue(''); } catch {} }
      if (selectSetter) selectSetter.call(el, match.value);
      else              el.value = match.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════
  //  FILL — Custom Floating Dropdown
  //  Uses CDP trusted clicks to open and select.
  // ═══════════════════════════════════════════

  const DROPDOWN_OPTION_SELECTORS = [
    '.floatingDropdown_listItem__tU_5x',
    '[class*="floatingDropdown"] li',
    '[class*="listItem"]',
    '[class*="list-item"]',
    'li',
    '[role="option"]',
    '[role="menuitem"]',
  ].join(', ');

  function getVisibleDropdownOptions() {
    return Array.from(document.querySelectorAll(DROPDOWN_OPTION_SELECTORS))
      .filter((el) => isVisible(el) && el.textContent.trim().length > 0);
  }

  function isCustomDropdownInput(el) {
    if (el.tagName !== 'INPUT') return false;

    const role = el.getAttribute('role');
    const hasPopup = el.getAttribute('aria-haspopup');
    if (role === 'combobox' || hasPopup === 'true' || hasPopup === 'listbox') return true;

    if (el.hasAttribute('readonly')) {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['text', 'search', ''].includes(type)) return true;
    }

    const cls = el.getAttribute('class') || '';
    if (cls.includes('floating-input') || cls.includes('floating_input')) return true;

    try {
      const cursor = window.getComputedStyle(el).cursor;
      if (cursor === 'pointer') return true;
    } catch {}

    const style = el.getAttribute('style') || '';
    if (style.includes('cursor: pointer') || style.includes('cursor:pointer')) return true;

    return false;
  }

  async function fillCustomDropdown(triggerEl, matchFn, fallbackValue) {
    if (!triggerEl) return false;
    try { triggerEl.removeAttribute('disabled'); triggerEl.disabled = false; } catch {}

    // Step 1: Check if options are ALREADY visible
    let matchEl = getVisibleDropdownOptions().find(matchFn);
    if (matchEl && isVisible(matchEl)) {
      await trustedClick(matchEl);
      await delay(200);
      return true;
    }

    // Step 2: Open dropdown with a trusted click
    const beforeOptions = new Set(getVisibleDropdownOptions());
    await trustedClick(triggerEl);
    await delay(100);

    // Step 3: Wait for new <li> options to appear
    matchEl = await waitFor(() => {
      const fresh = getVisibleDropdownOptions().filter((o) => !beforeOptions.has(o));
      return fresh.find(matchFn) || null;
    }, 3000, 50);

    // Fallback: search all currently visible options
    if (!matchEl) {
      matchEl = getVisibleDropdownOptions().find(matchFn);
    }

    if (matchEl) {
      await trustedClick(matchEl);
      await delay(50);
      return true;
    }

    // Step 4: Fallback — set value directly
    if (fallbackValue && triggerEl.tagName === 'INPUT') {
      await setElementValueFallback(triggerEl, fallbackValue);
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════
  //  FIND Photo ID Number field
  // ═══════════════════════════════════════════

  function findPhotoIdNumberField(used) {
    const byName = document.querySelector(
      'input[name="idNumber"], input[name="id_number"], input[name="idno"], input[name="idNo"],' +
      'input[formcontrolname="id_proof_number"], input[formcontrolname="id_number"], input[formcontrolname="idNumber"]'
    );
    if (byName && !used.has(byName)) return byName;

    const byLabel = document.querySelector(
      'input[label="Photo ID Number"], input[label="ID Number"], input[label="Document Number"]'
    );
    if (byLabel && !used.has(byLabel)) return byLabel;

    const allInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), input[type="tel"]'));
    let bestEl = null, bestScore = 1;
    for (const el of allInputs) {
      if (used.has(el)) continue;
      const s = scoreField(el, 'photoidnumber');
      if (s > bestScore) { bestScore = s; bestEl = el; }
    }
    return bestEl;
  }

  async function fillPhotoIdNumber(el, value) {
    // Wait longer — the field is typically disabled until Photo ID Type is selected
    // and React needs time to process the dropdown selection and re-render
    await waitFor(() => !el.disabled && !el.hasAttribute('disabled'), 3000);
    try { el.removeAttribute('disabled'); el.disabled = false; } catch {}
    await delay(200);

    const formats = [value, value.replace(/\s/g, '')];
    for (const fmt of formats) {
      await trustedType(el, fmt);
      await delay(200);
      if (el.value === fmt || el.value === value || el.value === value.replace(/\s/g, '')) {
        return true;
      }
    }
    // Last resort fallback
    await setElementValueFallback(el, formats[0]);
    return true;
  }

  function getAllFormElements(root = document) {
    let elements = [];
    try {
      elements.push(...Array.from(root.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
        ':not([type="reset"]):not([type="image"]):not([type="checkbox"])' +
        ':not([type="radio"]), select, textarea'
      )));
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) elements.push(...getAllFormElements(el.shadowRoot));
        if (el.tagName === 'IFRAME') {
          try { if (el.contentDocument) elements.push(...getAllFormElements(el.contentDocument)); } catch {}
        }
      }
    } catch {}
    return elements;
  }

  // ═══════════════════════════════════════════
  //  FILL General Details
  // ═══════════════════════════════════════════

  async function fillGeneralDetails(general, globalUsed) {
    if (!general) return 0;
    const candidates = getAllFormElements().filter((el) => isVisible(el) && !globalUsed.has(el));

    function bestFor(key) {
      let bestEl = null, bestScore = 1;
      for (const el of candidates) {
        if (globalUsed.has(el)) continue;
        const s = scoreField(el, key);
        if (s > bestScore) { bestScore = s; bestEl = el; }
      }
      return bestEl;
    }

    let filled = 0;
    for (const { key, value } of [
      { key: 'email',   value: general.email   },
      { key: 'city',    value: general.city    },
      { key: 'state',   value: general.state   },
      { key: 'country', value: general.country },
      { key: 'pincode', value: general.pincode },
    ]) {
      if (!value) continue;
      const el = bestFor(key);
      if (!el) continue;
      if (el.tagName === 'SELECT') fillNativeSelect(el, value);
      else await trustedType(el, value);
      globalUsed.add(el);
      filled++;
      await delay(20);
    }
    return filled;
  }

  // ═══════════════════════════════════════════
  //  PASS 1 — Basic fields for ALL users
  // ═══════════════════════════════════════════

  async function fillSingleProfileBasic(profile, globalUsed) {
    const aadharFormatted = profile.aadhar
      ? profile.aadhar.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
      : '';

    const candidates = getAllFormElements().filter((el) => isVisible(el) && !globalUsed.has(el));

    function bestFor(key) {
      let bestEl = null, bestScore = 0;
      for (const el of candidates) {
        if (globalUsed.has(el)) continue;
        const s = scoreField(el, key);
        if (s > bestScore) { bestScore = s; bestEl = el; }
      }
      return bestEl;
    }

    let filled = 0;

    // ── 1. NAME ──────────────────────────────
    if (profile.name) {
      let el = bestFor('name');
      if (!el) el = candidates.find((c) => c.tagName === 'INPUT' && ['text','search',''].includes((c.getAttribute('type') || '').toLowerCase()) && !globalUsed.has(c));
      if (el) {
        if (el.tagName === 'SELECT') fillNativeSelect(el, profile.name);
        else await trustedType(el, profile.name);
        globalUsed.add(el); filled++;
        await delay(20);
      }
    }

    // ── 2. AGE ───────────────────────────────
    if (profile.age) {
      let el = bestFor('age');
      if (!el) el = candidates.find((c) => c.tagName === 'INPUT' && (c.getAttribute('type') === 'tel' || c.getAttribute('type') === 'number' || ['text',''].includes((c.getAttribute('type') || '').toLowerCase())) && !globalUsed.has(c));
      if (el) {
        if (el.tagName === 'SELECT') fillNativeSelect(el, profile.age);
        else await trustedType(el, String(profile.age));
        globalUsed.add(el); filled++;
        await delay(20);
      }
    }

    // ── 3. GENDER ────────────────────────────
    if (profile.gender) {
      let ok = false;

      const radioGroup = bestRadioGroupFor('gender', globalUsed);
      if (radioGroup && radioGroup.length > 0) {
        ok = await fillRadioGroup(radioGroup, profile.gender, true);
        if (ok) { radioGroup.forEach((r) => globalUsed.add(r)); filled++; }
      }

      if (!ok) {
        const el = bestFor('gender');
        if (el) {
          const genderMatchFn = (li) => {
            const text = li.textContent || '';
            const val  = li.getAttribute('value') || li.getAttribute('data-value') || '';
            return matchGenderText(text, profile.gender) || matchGenderText(val, profile.gender);
          };
          const displayGender = profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1);

          if (el.tagName === 'SELECT') {
            ok = fillNativeSelect(el, profile.gender, true);
          } else if (isCustomDropdownInput(el)) {
            ok = await fillCustomDropdown(el, genderMatchFn, displayGender);
          } else {
            await trustedType(el, profile.gender);
            ok = true;
          }
          if (ok) { globalUsed.add(el); filled++; }
        }
      }
    }

    // ── 4. PHOTO ID TYPE / PROOF ─────────────
    if (profile.aadhar) {
      const aadharMatchFn = (li) => {
        const text = norm(li.textContent || li.getAttribute('value') || li.getAttribute('data-value') || '');
        return AADHAR_OPTION_KEYWORDS.some((kw) => text.includes(norm(kw)));
      };

      const typeEl = bestFor('photoidtype');
      if (typeEl) {
        let ok = false;
        if (typeEl.tagName === 'SELECT') {
          const match = Array.from(typeEl.options).find((o) =>
            AADHAR_OPTION_KEYWORDS.some((kw) => norm(o.text).includes(norm(kw)) || norm(o.value).includes(norm(kw)))
          );
          if (match) {
            typeEl.value = match.value;
            typeEl.dispatchEvent(new Event('change', { bubbles: true }));
            typeEl.dispatchEvent(new Event('input',  { bubbles: true }));
            ok = true;
          }
        } else if (isCustomDropdownInput(typeEl)) {
          ok = await fillCustomDropdown(typeEl, aadharMatchFn, 'Aadhaar Card');
        } else {
          await trustedType(typeEl, 'Aadhaar Card');
          ok = true;
        }
        if (ok) { globalUsed.add(typeEl); filled++; }
      }
    }

    // ── 5. DIRECT AADHAR FIELD ───────────────
    if (aadharFormatted) {
      const el = bestFor('aadhar');
      if (el) {
        if (el.tagName === 'SELECT') fillNativeSelect(el, aadharFormatted);
        else await trustedType(el, aadharFormatted);
        globalUsed.add(el); filled++;
      }
    }

    // ── 6. PHOTO ID NUMBER ───────────────────
    if (aadharFormatted) {
      const idNumEl = findPhotoIdNumberField(globalUsed);
      if (idNumEl) {
        const ok = await fillPhotoIdNumber(idNumEl, aadharFormatted);
        if (ok) { globalUsed.add(idNumEl); filled++; }
      }
    }

    return filled;
  }

  // ═══════════════════════════════════════════
  //  MESSAGE LISTENER
  // ═══════════════════════════════════════════

  const extAPI = typeof browser !== 'undefined' ? browser : chrome;

  extAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'FF_FILL' && message.type !== 'FF_FILL_ALL') return false;

    // Aggressively prevent password managers (Bitwarden, 1Password, LastPass)
    // from stealing focus or injecting popups during our automated fill
    getAllFormElements().forEach(el => {
      try {
        el.setAttribute('data-bwignore', 'true');
        el.setAttribute('data-1p-ignore', 'true');
        el.setAttribute('data-lpignore', 'true');
      } catch (e) {}
    });

    (async () => {
      metaCache = new Map();
      const general  = message.general  || {};
      const profiles = message.type === 'FF_FILL_ALL' ? message.profiles : [message.profile];

      const globalUsed = new Set();
      let totalFilled  = 0;

      // 🚨 PROGRAMMATICALLY DISABLE CONFLICTING PASSWORD MANAGERS 🚨
      try {
        await new Promise(r => {
          try {
            extAPI.runtime.sendMessage({ action: 'TOGGLE_PM', payload: { disable: true } }, () => {
              const _ = extAPI.runtime.lastError; // clear error
              r();
            });
          } catch (e) { r(); }
        });
        await delay(300); // Give Chrome a moment to unmount their content scripts
      } catch (e) {
        console.warn('[FormFill Pro] Failed to disable password managers', e);
      }

      totalFilled += await fillGeneralDetails(general, globalUsed);

      for (const profile of profiles) {
        if (!profile) continue;
        if (!profile.name && !profile.gender && !profile.age && !profile.aadhar) continue;
        totalFilled += await fillSingleProfileBasic(profile, globalUsed);
        await delay(50); // Short delay between profiles
      }

      // 🚨 PROGRAMMATICALLY RE-ENABLE CONFLICTING PASSWORD MANAGERS 🚨
      try {
        await new Promise(r => {
          try {
            extAPI.runtime.sendMessage({ action: 'TOGGLE_PM', payload: { disable: false } }, () => {
              const _ = extAPI.runtime.lastError;
              r();
            });
          } catch (e) { r(); }
        });
      } catch (e) {
        console.warn('[FormFill Pro] Failed to re-enable password managers', e);
      }

      sendResponse({ filled: totalFilled });
    })();

    return true;
  });
}
