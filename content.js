// ─────────────────────────────────────────────
//  FormFill Pro — Content Script  (v4)
//  Handles both native <select> and custom
//  <ul>/<li> floating-dropdown components.
//
//  Specifically handles:
//   • readonly text inputs with <ul>/<li> dropdowns
//   • disabled Photo ID Number that becomes enabled
//     after the ID type is selected
//
//  Fill order (race-condition-free):
//   Pass 1 — ALL users: Name → Age → Gender → Direct Aadhar
//   Pass 2 — ALL users: Photo ID Type → wait → Photo ID Number
//   Pass 3 — Once:      General Details
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
                 'given','surname','applicant'],
      autocomplete: ['name','given-name','family-name','username']
    },
    gender: {
      keywords: ['gender','sex','genderid','gender_id','biologicalsex','biological_sex',
                 'selectgender','choosegender'],
      autocomplete: ['sex']
    },
    age: {
      keywords: ['age','years','agein','howold','yourage'],
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
                 'proofofidentity','identitydocument'],
      autocomplete: []
    },
    photoidnumber: {
      keywords: ['idnumber','id_number','documentnumber','document_number',
                 'docnumber','doc_number','photoidnumber','photo_id_number',
                 'idno','id_no','proofnumber','proof_number','govtidnumber',
                 'identitynumber','identity_number','verificationnumber',
                 'licencenumber','passportnumber','pannumber'],
      autocomplete: []
    },
    email: {
      keywords: ['email','emailaddress','email_address','emailid','email_id',
                 'mail','contactemail','contact_email','useremail','user_email'],
      autocomplete: ['email']
    },
    city: {
      keywords: ['city','cityname','city_name','town','municipality',
                 'addresscity','address_city','hometown','home_town'],
      autocomplete: ['address-level2']
    },
    state: {
      keywords: ['state','statename','state_name','province','region',
                 'addressstate','address_state'],
      autocomplete: ['address-level1']
    },
    country: {
      keywords: ['country','countryname','country_name','nation',
                 'addresscountry','address_country'],
      autocomplete: ['country','country-name']
    },
    pincode: {
      keywords: ['pincode','pin_code','pin','zipcode','zip_code','zip',
                 'postalcode','postal_code','postcode','post_code',
                 'addresspin','address_pin'],
      autocomplete: ['postal-code']
    }
  };

  function norm(s) {
    return (s || '').toLowerCase().replace(/[\s_\-]+/g, '');
  }

  // Pre-normalize hints table keywords once
  for (const k in FIELD_HINTS) {
    FIELD_HINTS[k].normKeywords = FIELD_HINTS[k].keywords.map(norm);
    FIELD_HINTS[k].normAutocomplete = FIELD_HINTS[k].autocomplete.map(norm);
  }

  const GENDER_SYNONYMS = {
    male:               ['male','m','1','boy','man','gentleman','mr'],
    female:             ['female','f','2','girl','woman','lady','mrs','miss','ms'],
    other:              ['other','o','3','nonbinary','non-binary','transgender','x'],
    'prefer not to say':['prefernottosay','notspecified','notdisclosed',
                         'undisclosed','na','n/a','none','0','unknown']
  };

  const AADHAR_OPTION_KEYWORDS = [
    'aadhaar','aadhar','adhaar','adhar','uid','uidai',
    'aadhaarcard','aadharcard','aadhaar card','aadhar card'
  ];

  // ═══════════════════════════════════════════
  //  UTILITIES & ELEMENT METADATA CACHE
  // ═══════════════════════════════════════════


  let metaCache = new Map();

  function getElMeta(el) {
    if (metaCache.has(el)) return metaCache.get(el);

    const sig = ['id','name','placeholder','aria-label','label','autocomplete','title','class']
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

  /** Visible check — does NOT filter on disabled. */
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function waitFor(condition, timeoutMs = 2500, intervalMs = 15) {
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
  //  FILL — plain text input (React/Vue safe)
  // ═══════════════════════════════════════════

  function fillText(el, value, fireEvents) {
    const wasReadonly = el.hasAttribute('readonly');
    const wasDisabled = el.hasAttribute('disabled');
    if (wasReadonly) el.removeAttribute('readonly');
    if (wasDisabled) el.removeAttribute('disabled');

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
                || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else        el.value = value;

    const eventsToFire = [
      new Event('input',  { bubbles: true }),
      new Event('change', { bubbles: true }),
      new KeyboardEvent('keydown', { bubbles: true }),
      new KeyboardEvent('keypress',{ bubbles: true }),
      new KeyboardEvent('keyup',   { bubbles: true }),
      new FocusEvent('blur',       { bubbles: true }),
    ];
    for (const ev of eventsToFire) el.dispatchEvent(ev);

    if (wasReadonly) el.setAttribute('readonly', '');
    // Do NOT restore disabled — that would blank out the value again
  }

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
      .filter((r) => isVisible(r) && !r.disabled && !globalUsed.has(r));

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
      const first = group[0];
      const s = scoreField(first, key);
      if (s > bestScore) { bestScore = s; bestGroup = group; }
    }
    return bestGroup;
  }

  function fillRadioGroup(radios, value, isGender, fireEvents) {
    let match = null;
    if (isGender) {
      match = radios.find((r) => {
        const text = (r.value || '') + ' ' + (r.id || '') + ' ' + labelText(r);
        return matchGenderText(text, value) || matchGenderText(r.value, value);
      });
    } else {
      const target = norm(value);
      match = radios.find((r) => {
        const text = norm((r.value || '') + ' ' + labelText(r));
        return text === target || text.includes(target);
      });
    }

    if (match) {
      match.checked = true;
      match.click();
      if (fireEvents) {
        match.dispatchEvent(new Event('change', { bubbles: true }));
        match.dispatchEvent(new Event('input',  { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════
  //  FILL — native <select>
  // ═══════════════════════════════════════════

  function fillNativeSelect(el, value, fireEvents, isGender = false) {
    const options = Array.from(el.options);

    if (isGender) {
      const match = options.find((o) =>
        matchGenderText(o.text, value) || matchGenderText(o.value, value)
      );
      if (match) {
        el.value = match.value;
        if (fireEvents) {
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input',  { bubbles: true }));
        }
        return true;
      }
      return false;
    }

    const target = norm(value);
    const match =
      options.find((o) => norm(o.text) === target || norm(o.value) === target) ||
      options.find((o) => norm(o.text).includes(target) || norm(o.value).includes(target));

    if (match) {
      el.value = match.value;
      if (fireEvents) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input',  { bubbles: true }));
      }
      return true;
    }
    return false;
  }


  // ═══════════════════════════════════════════
  //  FILL — custom <ul>/<li> floating dropdown
  // ═══════════════════════════════════════════

  async function fillCustomDropdown(triggerEl, matchFn) {
    const before = new Set(Array.from(document.querySelectorAll('li')).filter(isVisible));

    triggerEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    triggerEl.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    triggerEl.click();
    triggerEl.dispatchEvent(new FocusEvent('focus',     { bubbles: true }));

    const freshItems = await waitFor(() => {
      const items = Array.from(document.querySelectorAll('li'))
        .filter((li) => isVisible(li) && !before.has(li) && li.textContent.trim().length > 0);
      return items.length > 0 ? items : null;
    }, 2500);

    const items = freshItems ||
      Array.from(document.querySelectorAll('li'))
        .filter((li) => isVisible(li) && li.textContent.trim().length > 0);

    if (items.length === 0) return false;

    const match = items.find(matchFn);
    if (!match) {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return false;
    }

    match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    match.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    match.click();

    return true;
  }

  function isCustomDropdownInput(el) {
    if (el.tagName !== 'INPUT') return false;
    if (el.hasAttribute('readonly')) return true;
    const s = window.getComputedStyle(el);
    return s.cursor === 'default' && s.caretColor === 'transparent';
  }

  // ═══════════════════════════════════════════
  //  FIND Photo ID Number field
  // ═══════════════════════════════════════════

  function findPhotoIdNumberField(used) {
    const byName = document.querySelector(
      'input[name="idNumber"], input[name="id_number"], input[name="idno"], input[name="idNo"]'
    );
    if (byName && !used.has(byName)) return byName;

    const byLabel = document.querySelector(
      'input[label="Photo ID Number"], input[label="ID Number"], input[label="Document Number"]'
    );
    if (byLabel && !used.has(byLabel)) return byLabel;

    const allInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
    let bestEl = null, bestScore = 1;
    for (const el of allInputs) {
      if (used.has(el)) continue;
      const s = scoreField(el, 'photoidnumber');
      if (s > bestScore) { bestScore = s; bestEl = el; }
    }
    return bestEl;
  }

  // ═══════════════════════════════════════════
  //  FILL Photo ID Number
  // ═══════════════════════════════════════════

  async function fillPhotoIdNumber(el, value) {
    const nativeSetter =
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    function trySet(val) {
      el.removeAttribute('disabled');
      el.removeAttribute('readonly');
      el.disabled  = false;
      el.readOnly  = false;

      el.focus();
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('focus',   { bubbles: true }));

      if (nativeSetter) nativeSetter.call(el, val);
      else              el.value = val;

      el.dispatchEvent(new InputEvent('input', {
        bubbles: true, cancelable: true,
        inputType: 'insertText', data: val
      }));
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('blur',    { bubbles: true }));
      el.dispatchEvent(new FocusEvent('focusout',{ bubbles: true }));
    }

    await waitFor(() => !el.disabled && !el.hasAttribute('disabled'), 2000);

    const formats = [value, value.replace(/\s/g, '')];
    let success = false;

    for (let attempt = 0; attempt < 4 && !success; attempt++) {
      const fmt = formats[attempt % 2];
      trySet(fmt);
      if (el.value === fmt || el.value === value || el.value === value.replace(/\s/g, '')) {
        success = true;
        break;
      }
      await delay(40);
    }

    if (!success) {
      const digits = value.replace(/\s/g, '');
      el.removeAttribute('disabled');
      el.disabled = false;
      el.focus();
      el.select();
      if (nativeSetter) nativeSetter.call(el, digits);
      else              el.value = digits;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: digits }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return true;
  }


  // ═══════════════════════════════════════════
  //  FILL General Details (once per form)
  //  email, city, state, country, pincode
  // ═══════════════════════════════════════════

  async function fillGeneralDetails(general, options, globalUsed) {
    if (!general) return 0;
    const { triggerEvents } = options || {};

    const candidates = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
        ':not([type="reset"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]),' +
        'select, textarea'
      )
    ).filter((el) => isVisible(el) && !el.disabled && !globalUsed.has(el));

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
    const fields = [
      { key: 'email',   value: general.email   },
      { key: 'city',    value: general.city    },
      { key: 'state',   value: general.state   },
      { key: 'country', value: general.country },
      { key: 'pincode', value: general.pincode },
    ];

    for (const { key, value } of fields) {
      if (!value) continue;
      const el = bestFor(key);
      if (!el) continue;
      if (el.tagName === 'SELECT') fillNativeSelect(el, value, triggerEvents);
      else fillText(el, value, triggerEvents);
      globalUsed.add(el);
      filled++;
    }

    return filled;
  }

  // ═══════════════════════════════════════════
  //  PASS 1 — Basic fields for ALL users
  //  (Name, Age, Gender, Direct Aadhar)
  //
  //  None of these steps trigger page enable/disable
  //  state changes, so running them back-to-back for
  //  multiple users is safe.
  // ═══════════════════════════════════════════

  async function fillSingleProfileBasic(profile, options, globalUsed) {
    const { triggerEvents } = options || {};

    const aadharFormatted = profile.aadhar
      ? profile.aadhar.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
      : '';

    // Re-query every call to include newly-visible elements;
    // exclude elements already claimed by a previous user.
    const candidates = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
        ':not([type="reset"]):not([type="image"]):not([type="checkbox"])' +
        ':not([type="radio"]), select, textarea'
      )
    ).filter((el) => isVisible(el) && !el.disabled && !globalUsed.has(el));

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

    // ── 1. NAME ──────────────────────────────
    if (profile.name) {
      const el = bestFor('name');
      if (el) {
        if (el.tagName === 'SELECT') fillNativeSelect(el, profile.name, triggerEvents);
        else fillText(el, profile.name, triggerEvents);
        globalUsed.add(el); filled++;
      }
    }

    // ── 2. AGE ───────────────────────────────
    if (profile.age) {
      const el = bestFor('age');
      if (el) {
        if (el.tagName === 'SELECT') fillNativeSelect(el, profile.age, triggerEvents);
        else fillText(el, profile.age, triggerEvents);
        globalUsed.add(el); filled++;
      }
    }

    // ── 3. GENDER ────────────────────────────
    if (profile.gender) {
      let ok = false;

      // 1. Try radio group first if available
      const radioGroup = bestRadioGroupFor('gender', globalUsed);
      if (radioGroup && radioGroup.length > 0) {
        ok = fillRadioGroup(radioGroup, profile.gender, true, triggerEvents);
        if (ok) {
          radioGroup.forEach((r) => globalUsed.add(r));
          filled++;
        }
      }

      // 2. Try select or custom dropdown
      if (!ok) {
        const el = bestFor('gender');
        if (el) {
          const genderMatchFn = (li) => {
            const text = li.textContent || '';
            const val  = li.getAttribute('value') || li.getAttribute('data-value') || '';
            return matchGenderText(text, profile.gender) || matchGenderText(val, profile.gender);
          };

          if (el.tagName === 'SELECT') {
            ok = fillNativeSelect(el, profile.gender, triggerEvents, true);
          } else if (isCustomDropdownInput(el)) {
            ok = await fillCustomDropdown(el, genderMatchFn);
          } else {
            fillText(el, profile.gender, triggerEvents);
            ok = true;
          }
          if (ok) { globalUsed.add(el); filled++; }
        }
      }
    }


    // ── 4. PHOTO ID TYPE / PROOF ─────────────
    if (profile.aadhar) {
      const aadharMatchFn = (li) => {
        const text = norm(li.textContent);
        return AADHAR_OPTION_KEYWORDS.some((kw) => text.includes(norm(kw)));
      };

      const typeEl = bestFor('photoidtype');
      if (typeEl) {
        let ok = false;
        if (typeEl.tagName === 'SELECT') {
          const match = Array.from(typeEl.options).find((o) =>
            AADHAR_OPTION_KEYWORDS.some(
              (kw) => norm(o.text).includes(norm(kw)) || norm(o.value).includes(norm(kw))
            )
          );
          if (match) {
            typeEl.value = match.value;
            if (triggerEvents) {
              typeEl.dispatchEvent(new Event('change', { bubbles: true }));
              typeEl.dispatchEvent(new Event('input',  { bubbles: true }));
            }
            ok = true;
          }
        } else if (isCustomDropdownInput(typeEl)) {
          ok = await fillCustomDropdown(typeEl, aadharMatchFn);
        }
        if (ok) {
          globalUsed.add(typeEl);
          filled++;
        }
      }
    }

    // ── 5. DIRECT AADHAR FIELD ───────────────
    // (a standalone Aadhar input, separate from Photo ID Number)
    if (aadharFormatted) {
      const el = bestFor('aadhar');
      if (el) {
        if (el.tagName === 'SELECT') fillNativeSelect(el, aadharFormatted, triggerEvents);
        else fillText(el, aadharFormatted, triggerEvents);
        globalUsed.add(el); filled++;
      }
    }

    return filled;
  }

  // ═══════════════════════════════════════════
  //  PASS 2 — Photo ID Number (once enabled)
  //
  //  Called AFTER Pass 1 has selected Photo ID
  //  Type for ALL users, allowing the site to
  //  enable all ID number inputs asynchronously.
  // ═══════════════════════════════════════════

  async function fillSingleProfilePhotoId(profile, options, globalUsed) {
    if (!profile.aadhar) return 0;

    const aadharFormatted = profile.aadhar.replace(/(\d{4})(?=\d)/g, '$1 ').trim();

    let filled = 0;

    // ── PHOTO ID NUMBER ────────────────────────
    const idNumEl = findPhotoIdNumberField(globalUsed);
    if (idNumEl) {
      const ok = await fillPhotoIdNumber(idNumEl, aadharFormatted);
      if (ok) {
        globalUsed.add(idNumEl);
        filled++;
      }
    }

    return filled;
  }

  // ═══════════════════════════════════════════
  //  MESSAGE LISTENER
  //
  //  FF_FILL     — single profile + general
  //  FF_FILL_ALL — array of profiles + general
  const extAPI = typeof browser !== 'undefined' ? browser : chrome;

  extAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'FF_FILL' && message.type !== 'FF_FILL_ALL') return false;

    (async () => {
      metaCache = new Map(); // Fresh element metadata cache for maximum speed
      const options  = message.options  || {};
      const general  = message.general  || {};
      const profiles = message.type === 'FF_FILL_ALL'
        ? message.profiles
        : [message.profile];

      const globalUsed = new Set();
      let totalFilled  = 0;


      // ── Pass 1: General details FIRST ───────────────────────────
      totalFilled += await fillGeneralDetails(general, options, globalUsed);

      // ── Pass 2: Name, Age, Gender, Photo ID Type for ALL users ──
      for (const profile of profiles) {
        if (!profile) continue;
        if (!profile.name && !profile.gender && !profile.age && !profile.aadhar) continue;
        totalFilled += await fillSingleProfileBasic(profile, options, globalUsed);
      }

      // Short delay for page to enable ID Number inputs after Type selection
      await delay(200);

      // ── Pass 3: Photo ID Number for ALL users (once enabled) ────
      for (const profile of profiles) {
        if (!profile || !profile.aadhar) continue;
        totalFilled += await fillSingleProfilePhotoId(profile, options, globalUsed);
      }

      sendResponse({ filled: totalFilled });

    })();

    return true; // keep message channel open for async sendResponse
  });
}

