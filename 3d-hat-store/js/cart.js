
/**
 * ============================================================
 * KRVN — cart.js
 * Cart page logic: render items, manage quantities,
 * validate form, and generate WhatsApp checkout link.
 * ============================================================
 *
 * DATA FLOW:
 *   localStorage('krvn_cart')
 *     └─► renderCart()  ──► UI update
 *         └─► updateSummary()
 *
 *   Form fields  ──► validateForm()
 *     └─► buildWhatsAppLink()
 *         └─► window.open(whatsappURL)
 *
 * WHATSAPP PHONE NUMBER:
 *   Set YOUR store number in KRVN_WHATSAPP_NUMBER below.
 *   Format: country code + number, digits only.
 *   Example: '447911123456' for UK +44 7911 123456
 * ============================================================
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// CONFIG — Edit these values for your store
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  /**
   * Your WhatsApp Business number (digits only, no + or spaces).
   * IMPORTANT: Replace with your actual number before going live.
   */
  WHATSAPP_NUMBER: '1234567890',

  /** Currency symbol for display */
  CURRENCY_SYMBOL: '$',

  /** localStorage key (must match the key used in main.js) */
  STORAGE_KEY: 'krvn_cart',

  /**
   * Promo codes: key = code (uppercase), value = discount object.
   * type: 'percent' | 'fixed'
   * amount: number (percent = 0–100, fixed = dollar amount)
   */
  PROMO_CODES: {
    'KRVN10':  { type: 'percent', amount: 10,  label: '10% off applied!' },
    'KRVN20':  { type: 'percent', amount: 20,  label: '20% off applied!' },
    'WELCOME': { type: 'fixed',   amount: 15,  label: '$15 off applied!' },
    'DROPONE': { type: 'percent', amount: 100, label: '100% off — you lucky thing!' },
  },
};


// ─────────────────────────────────────────────────────────────
// STATE — Module-level state object
// ─────────────────────────────────────────────────────────────
const STATE = {
  cart:          [],       // Current cart items array
  currentStep:   1,        // Active checkout step (1, 2, or 3)
  appliedPromo:  null,     // { code, type, amount, label } | null
  selectedSize:  '',       // Selected hat size from size-selector
  whatsappURL:   '',       // Generated WA URL (stored for fallback btn)
};


// ─────────────────────────────────────────────────────────────
// DOM REFERENCES — Cached for performance
// ─────────────────────────────────────────────────────────────
const DOM = {
  // Cart items area (step 1)
  cartEmpty:       () => document.getElementById('cart-empty'),
  cartItemsWrap:   () => document.getElementById('cart-items-wrap'),
  cartItemsList:   () => document.getElementById('cart-items-list'),
  cartActions:     () => document.getElementById('cart-actions'),
  step1Cta:        () => document.getElementById('step-1-cta'),
  clearCartBtn:    () => document.getElementById('clear-cart-btn'),
  proceedBtn:      () => document.getElementById('proceed-to-details'),

  // Steps
  step1:           () => document.getElementById('step-1'),
  step2:           () => document.getElementById('step-2'),
  step3:           () => document.getElementById('step-3'),
  backToStep1:     () => document.getElementById('back-to-step1'),
  generateWA:      () => document.getElementById('generate-whatsapp'),

  // Summary sidebar
  summaryItems:    () => document.getElementById('summary-items'),
  summarySubtotal: () => document.getElementById('summary-subtotal'),
  summaryTotal:    () => document.getElementById('summary-total'),
  mobileTotal:     () => document.getElementById('mobile-total'),
  mobileProceed:   () => document.getElementById('mobile-proceed-btn'),

  // Step indicators
  step2Indicator:  () => document.getElementById('step-2-indicator'),
  step3Indicator:  () => document.getElementById('step-3-indicator'),

  // Form fields
  firstName:       () => document.getElementById('field-first-name'),
  lastName:        () => document.getElementById('field-last-name'),
  whatsapp:        () => document.getElementById('field-whatsapp'),
  email:           () => document.getElementById('field-email'),
  address:         () => document.getElementById('field-address'),
  city:            () => document.getElementById('field-city'),
  zip:             () => document.getElementById('field-zip'),
  country:         () => document.getElementById('field-country'),
  notes:           () => document.getElementById('field-notes'),
  formErrors:      () => document.getElementById('form-errors'),

  // Size selector
  sizeBtns:        () => document.querySelectorAll('.size-btn'),

  // Promo
  promoInput:      () => document.getElementById('promo-input'),
  applyPromo:      () => document.getElementById('apply-promo'),
  promoMsg:        () => document.getElementById('promo-msg'),

  // Confirmation
  waFallbackBtn:   () => document.getElementById('wa-fallback-btn'),
  startOverBtn:    () => document.getElementById('start-over-btn'),

  // Header
  cartCount:       () => document.getElementById('cart-count'),
  toast:           () => document.getElementById('toast'),
};


// ─────────────────────────────────────────────────────────────
// CART DATA — Read & Write localStorage
// ─────────────────────────────────────────────────────────────

/** Reads cart array from localStorage. Returns [] on failure. */
function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/** Persists the cart array to localStorage. */
function writeCart(cart) {
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(cart));
}

/** Clears the entire cart from localStorage. */
function clearCart() {
  localStorage.removeItem(CONFIG.STORAGE_KEY);
  STATE.cart = [];
  STATE.appliedPromo = null;
}


// ─────────────────────────────────────────────────────────────
// PRICE CALCULATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Calculates the cart subtotal (sum of price × qty for all items).
 * @param {Array} cart
 * @returns {number}
 */
function calcSubtotal(cart) {
  return cart.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
}

/**
 * Applies the active promo discount to a subtotal.
 * @param {number} subtotal
 * @param {Object|null} promo
 * @returns {number} Final total after discount
 */
function calcTotal(subtotal, promo) {
  if (!promo) return subtotal;

  if (promo.type === 'percent') {
    return subtotal * (1 - promo.amount / 100);
  }
  if (promo.type === 'fixed') {
    return Math.max(0, subtotal - promo.amount);
  }
  return subtotal;
}

/**
 * Formats a number as a price string.
 * @param {number} amount
 * @returns {string} e.g. "$89.00"
 */
function fmt(amount) {
  return `${CONFIG.CURRENCY_SYMBOL}${amount.toFixed(2)}`;
}


// ─────────────────────────────────────────────────────────────
// RENDER — Cart Items List (Step 1)
// ─────────────────────────────────────────────────────────────

/**
 * Renders the full cart UI.
 * Handles both empty and populated states.
 */
function renderCart() {
  STATE.cart = readCart();
  const cart  = STATE.cart;
  const empty = cart.length === 0;

  // Show/hide empty vs items UI
  toggleEl(DOM.cartEmpty(),     empty);
  toggleEl(DOM.cartItemsWrap(), !empty);
  toggleEl(DOM.step1Cta(),      !empty);

  if (empty) {
    updateSummary([]);
    updateCartBadge(0);
    return;
  }

  // Build item rows
  const list = DOM.cartItemsList();
  list.innerHTML = '';

  cart.forEach(item => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.dataset.id = item.id;
    li.setAttribute('role', 'listitem');

    li.innerHTML = `
      <div class="cart-item-product">
        <div class="cart-item-thumb" aria-hidden="true">
          <span>HAT</span>
        </div>
        <div class="cart-item-meta">
          <div class="cart-item-name">${escHtml(item.name)}</div>
          <div class="cart-item-id">SKU: KRVN-${escHtml(item.id)}</div>
          <button
            class="cart-item-remove"
            data-remove="${escHtml(item.id)}"
            aria-label="Remove ${escHtml(item.name)} from cart"
          >✕ Remove</button>
        </div>
      </div>

      <div class="cart-item-qty" role="group" aria-label="Quantity for ${escHtml(item.name)}">
        <button class="qty-btn" data-qty-dec="${escHtml(item.id)}" aria-label="Decrease quantity">−</button>
        <span class="qty-value" aria-live="polite">${item.qty || 1}</span>
        <button class="qty-btn" data-qty-inc="${escHtml(item.id)}" aria-label="Increase quantity">+</button>
      </div>

      <div class="cart-item-price">${fmt(item.price * (item.qty || 1))}</div>
    `;

    list.appendChild(li);
  });

  updateSummary(cart);
  updateCartBadge(cart.reduce((n, i) => n + (i.qty || 1), 0));
}

/**
 * Updates the summary sidebar with current cart data.
 * @param {Array} cart
 */
function updateSummary(cart) {
  const summaryList = DOM.summaryItems();
  summaryList.innerHTML = '';

  cart.forEach(item => {
    const li = document.createElement('li');
    li.className = 'summary-item';
    li.innerHTML = `
      <span class="summary-item-name">${escHtml(item.name)}</span>
      <span class="summary-item-qty">×${item.qty || 1}</span>
      <span class="summary-item-price">${fmt(item.price * (item.qty || 1))}</span>
    `;
    summaryList.appendChild(li);
  });

  const subtotal = calcSubtotal(cart);
  const total    = calcTotal(subtotal, STATE.appliedPromo);

  safeSet(DOM.summarySubtotal(), fmt(subtotal));
  safeSet(DOM.summaryTotal(),    fmt(total));
  safeSet(DOM.mobileTotal(),     fmt(total));
}

/** Updates the cart count badge in the header. */
function updateCartBadge(count) {
  const el = DOM.cartCount();
  if (!el) return;
  el.textContent = count;
}


// ─────────────────────────────────────────────────────────────
// CART MUTATIONS — Qty change, remove, clear
// ─────────────────────────────────────────────────────────────

/**
 * Changes the quantity of a cart item by delta (+1 or -1).
 * Removes the item if qty drops to 0.
 * @param {string} id    - Product ID
 * @param {number} delta - +1 or -1
 */
function changeQty(id, delta) {
  const cart = readCart();
  const idx  = cart.findIndex(item => item.id === id);
  if (idx === -1) return;

  cart[idx].qty = Math.max(0, (cart[idx].qty || 1) + delta);

  if (cart[idx].qty === 0) {
    cart.splice(idx, 1);   // Remove from array if qty hits zero
  }

  writeCart(cart);
  renderCartWithAnim();
}

/**
 * Removes a single item from the cart by ID.
 * @param {string} id
 */
function removeItem(id) {
  const cart    = readCart();
  const updated = cart.filter(item => item.id !== id);
  writeCart(updated);

  // Animate the row out before re-rendering
  const row = document.querySelector(`.cart-item[data-id="${id}"]`);
  if (row && window.gsap) {
    gsap.to(row, {
      x:       -20,
      opacity: 0,
      height:  0,
      paddingBlock: 0,
      duration: 0.35,
      ease: 'power2.in',
      onComplete: renderCart,
    });
  } else {
    renderCart();
  }
}

/** Clears the entire cart and re-renders. */
function handleClearCart() {
  clearCart();
  renderCartWithAnim();
  showToast('Cart cleared');
}

/** Re-renders cart with a subtle fade animation. */
function renderCartWithAnim() {
  renderCart();
  const list = DOM.cartItemsList();
  if (list && window.gsap && list.children.length) {
    gsap.from(Array.from(list.children), {
      opacity: 0,
      y: 10,
      duration: 0.35,
      stagger: 0.05,
      ease: 'power2.out',
    });
  }
}


// ─────────────────────────────────────────────────────────────
// STEP NAVIGATION
// ─────────────────────────────────────────────────────────────

/**
 * Transitions to a given checkout step.
 * Hides the current step, shows the target step, and
 * updates the step indicator in the header.
 * @param {number} step - 1, 2, or 3
 */
function goToStep(step) {
  const steps = [DOM.step1(), DOM.step2(), DOM.step3()];

  steps.forEach((el, i) => {
    if (!el) return;
    const isTarget = (i + 1) === step;
    toggleEl(el, isTarget);

    if (isTarget && window.gsap) {
      gsap.from(el, {
        opacity: 0,
        y: 20,
        duration: 0.45,
        ease: 'power3.out',
      });
    }
  });

  // Update step indicator dots
  document.querySelectorAll('.step').forEach((dot, i) => {
    const dotStep = i / 2 + 1;  // 0 → step1, 1 (connector) → skip, 2 → step2 etc.
  });

  // Update step indicators properly
  updateStepIndicators(step);
  STATE.currentStep = step;

  // Scroll to top of cart left column
  const cartLeft = document.querySelector('.cart-left');
  if (cartLeft) {
    const y = cartLeft.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
}

/** Marks step indicators as active/completed. */
function updateStepIndicators(activeStep) {
  document.querySelectorAll('.checkout-steps .step').forEach(dot => {
    const n = parseInt(dot.dataset.step);
    dot.classList.toggle('active',    n === activeStep);
    dot.classList.toggle('completed', n < activeStep);
  });
}


// ─────────────────────────────────────────────────────────────
// SIZE SELECTOR
// ─────────────────────────────────────────────────────────────
function initSizeSelector() {
  DOM.sizeBtns().forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.sizeBtns().forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      STATE.selectedSize = btn.dataset.size;

      // Animate selection
      if (window.gsap) {
        gsap.fromTo(btn,
          { scale: 0.92 },
          { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.6)' }
        );
      }
    });
  });
}


// ─────────────────────────────────────────────────────────────
// PROMO CODE HANDLING
// ─────────────────────────────────────────────────────────────
function handleApplyPromo() {
  const input   = DOM.promoInput();
  const msgEl   = DOM.promoMsg();
  const code    = (input?.value || '').trim().toUpperCase();
  const promo   = CONFIG.PROMO_CODES[code];

  if (!code) {
    setPromoMsg('Enter a promo code first.', true);
    return;
  }

  if (!promo) {
    setPromoMsg('Invalid code. Try again.', true);
    if (window.gsap) gsap.fromTo(input, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(2, 0.5)' });
    return;
  }

  STATE.appliedPromo = { code, ...promo };
  setPromoMsg(promo.label, false);
  updateSummary(STATE.cart);

  if (input) { input.value = ''; input.disabled = true; }
  if (DOM.applyPromo()) DOM.applyPromo().disabled = true;
}

function setPromoMsg(text, isError) {
  const el = DOM.promoMsg();
  if (!el) return;
  el.textContent = text;
  el.className = 'promo-msg' + (isError ? ' error' : '');
}


// ─────────────────────────────────────────────────────────────
// FORM VALIDATION
// ─────────────────────────────────────────────────────────────

/**
 * Validates all required form fields.
 * Returns { valid: boolean, errors: string[] }
 */
function validateForm() {
  const errors = [];

  const fields = [
    { el: DOM.firstName(), label: 'First Name',   rule: v => v.length >= 2 },
    { el: DOM.lastName(),  label: 'Last Name',    rule: v => v.length >= 2 },
    { el: DOM.whatsapp(),  label: 'WhatsApp Number', rule: v => /^\+?[\d\s\-]{7,20}$/.test(v) },
    { el: DOM.address(),   label: 'Delivery Address', rule: v => v.length >= 5 },
    { el: DOM.city(),      label: 'City',         rule: v => v.length >= 2 },
    { el: DOM.zip(),       label: 'Postcode',     rule: v => v.length >= 2 },
    { el: DOM.country(),   label: 'Country',      rule: v => v.length > 0 },
  ];

  // Reset all error states
  fields.forEach(({ el }) => el?.classList.remove('error'));

  // Validate each field
  fields.forEach(({ el, label, rule }) => {
    if (!el) return;
    const value = el.value.trim();
    if (!rule(value)) {
      errors.push(`${label} is required or invalid.`);
      el.classList.add('error');
    }
  });

  // Size must be selected
  if (!STATE.selectedSize) {
    errors.push('Please select a hat size.');
  }

  return { valid: errors.length === 0, errors };
}

/** Displays validation errors in the form error block. */
function showFormErrors(errors) {
  const el = DOM.formErrors();
  if (!el) return;

  el.hidden = false;
  el.innerHTML = errors.map(e => `<p>⚠ ${e}</p>`).join('');

  // Animate the error block in
  if (window.gsap) {
    gsap.from(el, { opacity: 0, y: -10, duration: 0.35, ease: 'power2.out' });
  }

  // Scroll to first invalid field
  const firstError = document.querySelector('.form-input.error');
  if (firstError) {
    firstError.focus();
    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/** Clears all form errors. */
function clearFormErrors() {
  const el = DOM.formErrors();
  if (el) { el.hidden = true; el.innerHTML = ''; }
  document.querySelectorAll('.form-input.error').forEach(i => i.classList.remove('error'));
}


// ─────────────────────────────────────────────────────────────
// WHATSAPP MESSAGE BUILDER
// ─────────────────────────────────────────────────────────────

/**
 * Builds the full WhatsApp order message from cart + form data.
 * The message is pre-formatted for easy reading in WhatsApp.
 *
 * @returns {string} Formatted order message (plain text, URL-encoded)
 */
function buildOrderMessage() {
  const cart       = STATE.cart;
  const subtotal   = calcSubtotal(cart);
  const total      = calcTotal(subtotal, STATE.appliedPromo);
  const now        = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // ── Line items ──────────────────────────────────────────────
  const itemLines = cart.map(item =>
    `  • ${item.name} (×${item.qty || 1}) — ${fmt(item.price * (item.qty || 1))}`
  ).join('\n');

  // ── Promo line (only if applied) ────────────────────────────
  const promoLine = STATE.appliedPromo
    ? `\n🏷️ Promo Applied: ${STATE.appliedPromo.code} (${STATE.appliedPromo.label})`
    : '';

  // ── Notes line ──────────────────────────────────────────────
  const notesVal  = DOM.notes()?.value.trim();
  const notesLine = notesVal ? `\n📝 Notes: ${notesVal}` : '';

  // ── Email line (optional) ────────────────────────────────────
  const emailVal  = DOM.email()?.value.trim();
  const emailLine = emailVal ? `\n📧 Email: ${emailVal}` : '';

  // ── Full message ─────────────────────────────────────────────
  const message = `
🧢 *KRVN — New Order Request*
━━━━━━━━━━━━━━━━━━━━
🗓️ Date: ${now}

*ORDER ITEMS:*
${itemLines}

━━━━━━━━━━━━━━━━━━━━
💰 Subtotal: ${fmt(subtotal)}${promoLine}
✅ *Estimated Total: ${fmt(total)}*
(Shipping to be confirmed)

━━━━━━━━━━━━━━━━━━━━
*CUSTOMER DETAILS:*
👤 Name: ${DOM.firstName()?.value.trim()} ${DOM.lastName()?.value.trim()}
📱 WhatsApp: +${DOM.whatsapp()?.value.trim()}${emailLine}

*SHIPPING ADDRESS:*
🏠 ${DOM.address()?.value.trim()}
   ${DOM.city()?.value.trim()}, ${DOM.zip()?.value.trim()}
   ${DOM.country()?.value.trim()}

🎩 Hat Size: ${STATE.selectedSize}${notesLine}

━━━━━━━━━━━━━━━━━━━━
Please confirm availability and send payment details. Thank you! 🙏
`.trim();

  return message;
}

/**
 * Constructs the full WhatsApp deep-link URL.
 * Opens WhatsApp web/app with the store number pre-filled
 * and the order message in the compose box.
 *
 * URL FORMAT:
 *   https://wa.me/{PHONE}?text={ENCODED_MESSAGE}
 *
 * wa.me is WhatsApp's official short-link service.
 * It redirects to the native app on mobile, WhatsApp Web on desktop.
 *
 * @returns {string} Full WhatsApp URL
 */
function buildWhatsAppURL() {
  const message = buildOrderMessage();
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encoded}`;
}


// ─────────────────────────────────────────────────────────────
// CHECKOUT FLOW — Step 2 → Step 3
// ─────────────────────────────────────────────────────────────

/**
 * Handles the "Send Order via WhatsApp" button click.
 * Validates the form, builds the WA URL, opens WhatsApp,
 * then moves to the confirmation step.
 */
function handleWhatsAppCheckout() {
  clearFormErrors();

  const { valid, errors } = validateForm();

  if (!valid) {
    showFormErrors(errors);
    return;
  }

  // Build the WhatsApp URL
  const url = buildWhatsAppURL();
  STATE.whatsappURL = url;

  // Set fallback button href on confirmation page
  const fallback = DOM.waFallbackBtn();
  if (fallback) fallback.href = url;

  // Animate the WA button
  const btn = DOM.generateWA();
  if (btn && window.gsap) {
    gsap.to(btn, {
      scale:    0.96,
      duration: 0.1,
      yoyo:     true,
      repeat:   1,
      onComplete: () => {
        openWhatsApp(url);
        goToStep(3);
        // Clear the cart after successful order send
        clearCart();
        updateCartBadge(0);
      },
    });
  } else {
    openWhatsApp(url);
    goToStep(3);
    clearCart();
    updateCartBadge(0);
  }
}

/**
 * Opens WhatsApp in a new tab.
 * Modern browsers require this to be called inside a user
 * event handler to avoid pop-up blockers.
 * @param {string} url
 */
function openWhatsApp(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}


// ─────────────────────────────────────────────────────────────
// TOAST NOTIFICATION
// ─────────────────────────────────────────────────────────────

/**
 * Shows a brief toast notification.
 * @param {string} message
 * @param {number} duration - ms to show (default 2500)
 */
function showToast(message, duration = 2500) {
  const toast = DOM.toast();
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), duration);
}


// ─────────────────────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Shows or hides an element using the `hidden` attribute.
 * @param {HTMLElement|null} el
 * @param {boolean} visible
 */
function toggleEl(el, visible) {
  if (!el) return;
  el.hidden = !visible;
}

/**
 * Safely sets the textContent of an element.
 * @param {HTMLElement|null} el
 * @param {string} text
 */
function safeSet(el, text) {
  if (el) el.textContent = text;
}

/**
 * Escapes HTML special characters to prevent XSS when using innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}


// ─────────────────────────────────────────────────────────────
// EVENT DELEGATION — Cart item interactions
// ─────────────────────────────────────────────────────────────

/**
 * Single event listener on the items list handles all
 * quantity and remove button clicks via event delegation.
 * This avoids attaching individual listeners to each row.
 */
function bindCartItemEvents() {
  const list = DOM.cartItemsList();
  if (!list) return;

  list.addEventListener('click', (e) => {
    // Quantity decrease
    const decId = e.target.dataset.qtyDec;
    if (decId) { changeQty(decId, -1); return; }

    // Quantity increase
    const incId = e.target.dataset.qtyInc;
    if (incId) { changeQty(incId, +1); return; }

    // Remove item
    const removeId = e.target.dataset.remove;
    if (removeId) { removeItem(removeId); return; }
  });
}


// ─────────────────────────────────────────────────────────────
// PAGE ENTRANCE ANIMATION
// ─────────────────────────────────────────────────────────────
function animatePageIn() {
  if (!window.gsap) return;

  const tl = gsap.timeline({ delay: 0.2 });

  tl.from('.cart-page-header', {
    y:        -20,
    opacity:  0,
    duration: 0.7,
    ease:     'power3.out',
  })
  .from('.cart-step', {
    y:        30,
    opacity:  0,
    duration: 0.6,
    ease:     'power3.out',
  }, '-=0.4')
  .from('.summary-card', {
    y:        30,
    opacity:  0,
    duration: 0.6,
    ease:     'power3.out',
  }, '-=0.45');
}


// ─────────────────────────────────────────────────────────────
// MOBILE NAV (shared with main.js pattern)
// ─────────────────────────────────────────────────────────────
function initMobileNav() {
  const toggle = document.getElementById('nav-toggle');
  const nav    = document.getElementById('mobile-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  document.querySelectorAll('.mob-link').forEach(l => {
    l.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}


// ─────────────────────────────────────────────────────────────
// INITIALISE
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Page entrance ─────────────────────────────────────────
  animatePageIn();
  initMobileNav();

  // ── Initial render ─────────────────────────────────────────
  renderCart();
  initSizeSelector();

  // ── Cart item event delegation ─────────────────────────────
  bindCartItemEvents();

  // ── Clear cart button ──────────────────────────────────────
  DOM.clearCartBtn()?.addEventListener('click', handleClearCart);

  // ── Step 1 → Step 2 ────────────────────────────────────────
  DOM.proceedBtn()?.addEventListener('click', () => {
    if (STATE.cart.length === 0) {
      showToast('Your cart is empty!');
      return;
    }
    goToStep(2);
  });

  // Mobile proceed button (mirrors main proceed button)
  DOM.mobileProceed()?.addEventListener('click', () => {
    if (STATE.cart.length === 0) {
      showToast('Your cart is empty!');
      return;
    }
    goToStep(2);
  });

  // ── Step 2 → Step 1 (back) ─────────────────────────────────
  DOM.backToStep1()?.addEventListener('click', () => goToStep(1));

  // ── Step 2 → Step 3 (WhatsApp checkout) ───────────────────
  DOM.generateWA()?.addEventListener('click', handleWhatsAppCheckout);

  // ── Confirmation: fallback & start over ───────────────────
  DOM.startOverBtn()?.addEventListener('click', () => {
    goToStep(1);
    renderCart();
  });

  // ── Promo code ─────────────────────────────────────────────
  DOM.applyPromo()?.addEventListener('click', handleApplyPromo);

  // Allow Enter key in promo input
  DOM.promoInput()?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleApplyPromo();
  });

  // ── Clear form errors on input ────────────────────────────
  document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => {
      input.classList.remove('error');
      // If all errors are gone, hide the error block
      const anyErrors = document.querySelector('.form-input.error');
      if (!anyErrors) {
        const errBlock = DOM.formErrors();
        if (errBlock) errBlock.hidden = true;
      }
    });
  });

  // ── Sync cart across tabs ─────────────────────────────────
  // If user changes cart in another tab, refresh this one
  window.addEventListener('storage', (e) => {
    if (e.key === CONFIG.STORAGE_KEY) {
      renderCart();
    }
  });

  console.log('[KRVN] cart.js initialized. WhatsApp checkout ready.');
  console.log(`[KRVN] Sending orders to: wa.me/${CONFIG.WHATSAPP_NUMBER}`);
});