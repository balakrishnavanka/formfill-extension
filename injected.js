window.addEventListener('FormFillPokeReact', function(e) {
  try {
    const { id, handlerName, eventType, strVal, cx, cy } = e.detail;
    const el = document.querySelector(`[data-formfill-id="${id}"]`);
    if (!el) return;

    const propKey = Object.keys(el).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    
    let props = propKey ? el[propKey] : null;
    if (!props && fiberKey) {
       const fiber = el[fiberKey];
       props = fiber ? (fiber.memoizedProps || fiber.pendingProps || (fiber.return ? fiber.return.memoizedProps : null)) : null;
    }
    
    if (props) {
      if (handlerName) {
        // Single handler inject (like onClick)
        let fakeNative;
        if (eventType === 'click' || eventType.startsWith('mouse') || eventType.startsWith('pointer')) {
          const opts = { bubbles: true, cancelable: true, view: window, clientX: cx||0, clientY: cy||0, screenX: cx||0, screenY: cy||0, button: 0, buttons: 1 };
          fakeNative = new MouseEvent(eventType, opts);
        } else {
          fakeNative = new Event(eventType, { bubbles: true, cancelable: true });
        }
        
        const spoofedNative = new Proxy(fakeNative, { 
          get: (t, p) => p === 'isTrusted' ? true : (typeof t[p] === 'function' ? t[p].bind(t) : t[p]) 
        });
        const fakeEvt = {
          type: eventType, target: el, currentTarget: el, bubbles: true, cancelable: true, isTrusted: true,
          defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
          stopPropagation() {}, isPropagationStopped: () => false, persist() {},
          nativeEvent: spoofedNative,
          clientX: cx||0, clientY: cy||0, button: 0
        };
        if (typeof props[handlerName] === 'function') props[handlerName](fakeEvt);
      } else if (strVal !== undefined) {
        // setElementValue mode
        const fakeNative = new Event('change', { bubbles: true });
        const spoofedNative = new Proxy(fakeNative, { 
          get: (t, p) => p === 'isTrusted' ? true : (typeof t[p] === 'function' ? t[p].bind(t) : t[p]) 
        });
        const fakeEvt = {
          type: 'change', target: el, currentTarget: el, bubbles: true, cancelable: true, isTrusted: true,
          defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
          stopPropagation() {}, isPropagationStopped: () => false, persist() {},
          nativeEvent: spoofedNative
        };
        if (typeof props['onChange'] === 'function') props['onChange'](fakeEvt);
        if (typeof props['onInput'] === 'function') props['onInput'](fakeEvt);
      }
    } else {
      // Fallback for non-React
      if (strVal !== undefined) {
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: strVal }));
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: strVal }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  } catch(err) {
    console.error('[FormFill] Injected script error:', err);
  }
});
