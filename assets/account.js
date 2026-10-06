/* ---------------------------------------------------------------------------
   Sri Chakravarthy — customer account area.

   The customer signs in with a phone number and a one-time code. Odoo is the
   identity provider: the same sign-in works across the shop's POS, rewards,
   invoicing and virtual try-on. This file is the storefront half — it calls
   Odoo directly from the browser and holds nothing but the customer's own
   token.

   Shopify's own account system is not involved. On this plan it cannot accept
   an outside login, and a Shopify account always needs an email address, which
   a phone-first customer may not have.

   Phase 1 is sign-in and profile, because that is what Odoo has built. Orders,
   addresses and returns arrive when their endpoints do.

   Two things to know before changing this file:

   * Everything in assets/ is public. The customer's own token is the only
     credential here, and it authenticates only that customer. Never put a
     shared key in this file.
   * Odoo decides what a customer may see. This script is a convenience layer;
     if it ever becomes the thing keeping one customer out of another's data,
     something has gone wrong upstream.
   --------------------------------------------------------------------------- */

const STORAGE_KEY = 'scm.account.session';
const REFRESH_MARGIN_MS = 60_000; // renew a minute early, so nothing expires mid-action
const CODE_LENGTH = 6;

/* --- pure helpers, tested in test/account.test.js ------------------------- */

const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;
const MAX_IDENTIFIER = 254;

/**
 * Normalise a typed Indian mobile to E.164, or null if it is not one.
 *
 * Every spelling of one number has to collapse to a single string: it is the
 * login identity, and two spellings would mean two accounts for one person.
 * Only Indian mobiles are accepted — rejecting the rest before a code is ever
 * requested is what stops an attacker forcing paid messages to numbers abroad.
 */
export function normalizeIndianMobile(input) {
  if (typeof input !== 'string' || input.length > 32) return null;

  // Strip what people type. What survives must be ASCII digits with at most a
  // leading plus — \d would also match Devanagari digits, giving one number a
  // second spelling.
  const cleaned = input.replace(/[\s()\-.]/g, '');
  if (!/^\+?[0-9]+$/.test(cleaned)) return null;

  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  return INDIAN_MOBILE.test(digits) ? `+91${digits}` : null;
}

/** One sign-in box takes either a phone number or an email address. */
export function classifyIdentifier(input) {
  if (typeof input !== 'string') return { kind: 'invalid' };
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_IDENTIFIER) return { kind: 'invalid' };

  if (trimmed.includes('@')) {
    // Deliberately loose: the real check is whether the code arrives.
    return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(trimmed)
      ? { kind: 'email', value: trimmed.toLowerCase() }
      : { kind: 'invalid' };
  }

  const phone = normalizeIndianMobile(trimmed);
  return phone ? { kind: 'phone', value: phone } : { kind: 'invalid' };
}

/** 'valid' | 'refresh' | 'expired' — anything we cannot read is 'expired'. */
export function sessionState(session, now = Date.now()) {
  const expiresAt = Number(session?.expiresAt);
  if (!Number.isFinite(expiresAt)) return 'expired';
  if (now >= expiresAt) return 'expired';
  return expiresAt - now <= REFRESH_MARGIN_MS ? 'refresh' : 'valid';
}

const MESSAGES = {
  invalid_identifier: 'Enter a 10-digit mobile number or an email address.',
  missing_code: `Enter the ${CODE_LENGTH}-digit code.`,
  invalid_code: 'That code is not right. Check it and try again.',
  code_expired: 'That code has expired. Ask for a new one.',
  too_many_attempts: 'Too many tries. Ask for a new code in a few minutes.',
  too_many_requests: 'Too many requests. Please wait a few minutes and try again.',
  network: 'We could not reach the server. Check your connection and try again.',
};

/**
 * A sentence a customer can act on. Unknown codes fall back to something
 * neutral: an internal code shown on screen helps nobody, and `no_account`
 * must never be echoed, or the sign-in box becomes a way to find out who
 * shops here.
 */
export function errorMessage(code) {
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

// Odoo's codes for "this session is over". Anything else — a 500, a timeout, a
// train tunnel — is a problem with the request, not with being signed in.
const AUTH_FAILURE_CODES = new Set([
  'missing_token',
  'token_invalid',
  'session_revoked',
  'signed_out_everywhere',
  'invalid_refresh_token',
  'token_reuse_detected',
]);

/**
 * Did this request fail because the customer is no longer signed in?
 *
 * Only a yes here may clear the session. Treating every failure as a sign-out
 * is how a moment without signal used to throw a customer back to the sign-in
 * screen and lose their place.
 */
export function isAuthFailure(result) {
  if (!result || result.ok) return false;
  if (result.status === 401 || result.status === 403) return true;
  return AUTH_FAILURE_CODES.has(result.code);
}

/**
 * Should we try the refresh token before asking the customer to sign in again?
 *
 * Odoo issues tokens with no expiry and reports `expires_in: 0`, so we assume a
 * short life (see sessionFromTokens) and renew quietly. The refresh token is
 * good for 60 days — an access token that has lapsed is a reason to use it, not
 * a reason to throw the customer out.
 */
export function canRefresh(session, now = Date.now()) {
  if (!session?.refreshToken) return false;
  return sessionState(session, now) !== 'valid';
}

/**
 * What the header's account icon should do when clicked.
 *
 * Signed out, it opens the sign-in popup over whatever the customer was
 * looking at — most people sign in part-way through shopping, and sending
 * them to another page loses their place. Signed in, the click goes through
 * to the account page as an ordinary link.
 *
 * A session that merely needs refreshing is still a session: the account page
 * renews it on load, so interrupting with a sign-in box would be wrong.
 */
export function shouldOpenSignInPopup(session, now = Date.now()) {
  return sessionState(session, now) === 'expired';
}

/**
 * Demo mode, switched on by ?mock=1 in the URL.
 *
 * In demo mode nothing leaves the browser: no request reaches Odoo and no SMS
 * is sent. It exists so the screens can be shown and approved before the live
 * endpoints are ready — and it is exported so the page can say loudly that it
 * is pretending, because "no code arrived" otherwise looks like a bug.
 */
export function isMockMode(search) {
  try {
    return new URLSearchParams(search ?? '').get('mock') === '1';
  } catch {
    return false;
  }
}

/** Show which number a code went to without printing the whole thing. */
export function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length === 0) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 4) return '••••••';
  return `••••••${digits.slice(-4)}`;
}

/* --- order formatting ----------------------------------------------------- */

/** Rupees as Indian customers read them: ₹1,24,500.00, not ₹124,500.00. */
export function formatMoney(amount, currency = 'INR') {
  if (amount === null || amount === undefined || amount === '') return '';
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A date a customer can scan: 29 Sep 2026.
 *
 * Written out by hand rather than through Intl, which renders the same month
 * as "Sep" or "Sept" depending on the browser's ICU build — a difference the
 * customer would see between their phone and their laptop. The day is the
 * local one, so an order placed late at night in Chennai shows that evening's
 * date rather than the UTC one.
 */
export function formatOrderDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const ORDER_STATUS = {
  placed: 'Order placed',
  paid: 'Payment received',
  packed: 'Being packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  refunded: 'Refunded',
};

/**
 * Courier and ERP systems speak in codes — DRS, RTO, rto_initiated. A customer
 * should never be shown one; anything we do not recognise becomes a plain
 * holding phrase.
 */
export function orderStatusLabel(status) {
  return ORDER_STATUS[status] ?? 'In progress';
}

/* --- one order ------------------------------------------------------------ */

/**
 * The journey a parcel takes. Odoo's `status` is one of these, and the screen
 * shows the whole road so a customer can see both where the parcel is and
 * what is still to come.
 */
const JOURNEY = [
  { key: 'placed', label: 'Order placed' },
  { key: 'packed', label: 'Being packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

/** The order the customer tapped. Ids arrive as strings or numbers. */
export function findOrder(orders, id) {
  if (!Array.isArray(orders)) return undefined;
  return orders.find((order) => String(order?.id) === String(id));
}

/**
 * The journey, with each step marked done, current or still to come.
 *
 * A cancelled or returned order never finishes the road, and showing it the
 * ordinary way would promise a delivery that is not coming — so those end on
 * their own step instead.
 */
export function trackingSteps(order) {
  const status = order?.status === 'paid' ? 'placed' : order?.status;
  const step = (key, label, state) => ({ key, label, state });

  if (status === 'cancelled') {
    return [step('placed', 'Order placed', 'done'), step('cancelled', 'Cancelled', 'current')];
  }
  if (status === 'returned' || status === 'refunded') {
    return [
      step('placed', 'Order placed', 'done'),
      step('shipped', 'Shipped', 'done'),
      step(status, orderStatusLabel(status), 'current'),
    ];
  }

  // An unrecognised status is treated as "only just placed" rather than
  // guessed at — the list screen does the same.
  const index = Math.max(0, JOURNEY.findIndex((entry) => entry.key === status));
  return JOURNEY.map((entry, i) =>
    step(entry.key, entry.label, i < index ? 'done' : i === index ? 'current' : 'todo'));
}

/** The items of an order, shared by the list row and the detail screen. */
function orderItemsHtml(order) {
  return (order.items ?? []).map((item) => {
    const image = item.image_url
      ? `<img class="scm-item__image" src="${escapeHtml(item.image_url)}" alt="" loading="lazy" width="64" height="85">`
      : `<span class="scm-item__image scm-item__image--none" aria-hidden="true"></span>`;

    const title = item.product_url
      ? `<a class="scm-item__title" href="${escapeHtml(item.product_url)}">${escapeHtml(item.title ?? '')}</a>`
      : `<span class="scm-item__title">${escapeHtml(item.title ?? '')}</span>`;

    const detail = [
      item.variant_title,
      item.quantity > 1 ? `Qty ${item.quantity}` : null,
    ].filter(Boolean).map(escapeHtml).join(' \u00b7 ');

    return `
      <li class="scm-item">
        ${image}
        <div class="scm-item__text">
          ${title}
          ${detail ? `<span class="scm-item__detail">${detail}</span>` : ''}
        </div>
        <span class="scm-item__price">${escapeHtml(formatMoney(item.line_total ?? item.price, order.currency))}</span>
      </li>
    `;
  }).join('');
}

/**
 * One order, opened.
 *
 * Odoo's customer endpoint sends the status and the AWB but not yet the
 * courier's own history, so the journey above carries the screen. When
 * `events` does arrive the history is added underneath, and until then no
 * empty frame is drawn.
 */
export function orderDetailHtml(order) {
  const carrier = order.tracking?.carrier ?? 'the courier';

  const steps = trackingSteps(order).map((step) => `
    <li class="scm-track__step scm-track__step--${step.state}"${step.state === 'current' ? ' aria-current="step"' : ''}>
      <span class="scm-track__label">${escapeHtml(step.label)}</span>
    </li>`).join('');

  let tracking = '';
  if (order.tracking?.number) {
    const number = `<span class="scm-track__awb">${escapeHtml(carrier)} \u00b7 ${escapeHtml(order.tracking.number)}</span>`;
    tracking = order.tracking.url
      ? `<p class="scm-track__carrier">${number} <a class="scm-link" href="${escapeHtml(order.tracking.url)}" target="_blank" rel="noopener">Follow on ${escapeHtml(carrier)}</a></p>`
      : `<p class="scm-track__carrier">${number}</p>`;
  }

  const events = (order.events ?? []).map((event) => `
    <li class="scm-track__event">
      <span class="scm-track__when">${escapeHtml(formatOrderDate(event.at))}</span>
      <span class="scm-track__what">${escapeHtml(event.status ?? '')}</span>
      ${event.location ? `<span class="scm-track__where">${escapeHtml(event.location)}</span>` : ''}
    </li>`).join('');

  const items = orderItemsHtml(order);

  return `
    <button class="scm-link scm-order__back" type="button" data-orders-back>\u2190 Back to orders</button>
    <h1 class="scm-account__title">${escapeHtml(order.number ?? '')}</h1>
    <p class="scm-account__lead">
      ${escapeHtml(formatOrderDate(order.placed_at))}
      ${order.total ? ` \u00b7 ${escapeHtml(formatMoney(order.total, order.currency))}` : ''}
    </p>

    <section class="scm-track" aria-label="Delivery">
      <h2 class="scm-track__title">${escapeHtml(orderStatusLabel(order.status))}</h2>
      <ol class="scm-track__steps">${steps}</ol>
      ${tracking}
      ${events ? `<ol class="scm-track__events">${events}</ol>` : ''}
    </section>

    ${items ? `<ul class="scm-order__items scm-order__items--detail">${items}</ul>` : ''}
  `;
}

/* --- session storage ------------------------------------------------------ */

// localStorage throws in some privacy modes, and a thrown error here would take
// the whole page down. Every access is guarded; the worst case is a customer
// signing in again.

export function readSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSession(session) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* a session that cannot be saved still works until the page is closed */
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/* --- the Odoo client ------------------------------------------------------ */

export class OdooAccountApi {
  /**
   * @param {{baseUrl: string, fetchImpl?: typeof fetch}} options
   */
  constructor({ baseUrl, fetchImpl }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.fetch = fetchImpl ?? ((...args) => window.fetch(...args));
  }

  async call(path, { method = 'POST', body, token } = {}) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      // A blocked CORS preflight lands here too, indistinguishable from the
      // network being down. Both mean the same thing to the customer.
      return { ok: false, code: 'network' };
    }

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      /* an empty or non-JSON body is handled by the status check below */
    }

    if (!response.ok || payload.status === 'error') {
      return { ok: false, code: payload.error ?? 'network', status: response.status };
    }
    return { ok: true, data: payload };
  }

  requestCode(identifier) {
    return this.call('/api/v1/auth/otp/request', { body: { identifier } });
  }

  verifyCode(identifier, code, device) {
    return this.call('/api/v1/auth/otp/verify', { body: { identifier, code, device } });
  }

  refresh(refreshToken) {
    return this.call('/api/v1/auth/token/refresh', { body: { refresh_token: refreshToken } });
  }

  logout(token, everywhere = false) {
    return this.call('/api/v1/auth/logout', { token, body: { all: everywhere } });
  }

  profile(token) {
    return this.call('/api/v1/partners/me', { method: 'GET', token });
  }

  updateProfile(token, fields) {
    return this.call('/api/v1/partners/me', { method: 'PATCH', token, body: fields });
  }

  deleteAccount(token) {
    return this.call('/api/v1/partners/me', { method: 'DELETE', token });
  }

  /**
   * Order history. Odoo has not built this yet — it answers 404 today — so the
   * screen handles "not connected" as a normal state rather than an error.
   *
   * Expected shape, as specified to the Odoo team:
   *   { status: "ok", orders: [ { id, number, placed_at, total, currency,
   *     item_count, status, tracking: {carrier, number, url} | null,
   *     items: [ { title, quantity, price, image_url } ] } ] }
   */
  orders(token) {
    return this.call('/api/v1/partners/me/orders', { method: 'GET', token });
  }
}

const ASSUMED_TOKEN_SECONDS = 900; // 15 minutes, the lifetime the contract asks for

/**
 * Turn a verify or refresh response into the session we store.
 *
 * Odoo currently answers `expires_in: 0`, and its token carries no `exp` claim,
 * so by their configuration the token never expires. Taken at face value, zero
 * means "already expired" and the customer would be thrown back to the sign-in
 * screen the instant they signed in. So any lifetime that is not a positive
 * number is treated as "not told", and we assume a short one: the refresh call
 * then renews it quietly. Remove this once Odoo sets a real TTL — tracked with
 * them as the `exp` claim question.
 */
export function sessionFromTokens(data, now = Date.now()) {
  const given = Number(data?.expires_in);
  const seconds = Number.isFinite(given) && given > 0 ? given : ASSUMED_TOKEN_SECONDS;
  return {
    accessToken: data?.access_token,
    refreshToken: data?.refresh_token,
    expiresAt: now + seconds * 1000,
    profile: data?.profile ?? null,
  };
}

/**
 * The customer's name, or null when there isn't one worth showing.
 *
 * Odoo names a brand-new partner after their phone number, so greeting them
 * with "Hello, +918825464712" is both odd and a way of printing their number
 * back at them on a shared screen.
 */
export function displayName(profile) {
  const name = typeof profile?.name === 'string' ? profile.name.trim() : '';
  if (name.length === 0) return null;

  const digitsOf = (value) => String(value ?? '').replace(/[^0-9]/g, '');
  const nameDigits = digitsOf(name);
  const phoneDigits = digitsOf(profile?.phone);
  const isJustThePhone =
    nameDigits.length > 0 &&
    nameDigits === name.replace(/[^0-9+\s-]/g, '').replace(/[^0-9]/g, '') &&
    phoneDigits.endsWith(nameDigits);

  return isJustThePhone ? null : name;
}

/* --- demo mode ------------------------------------------------------------
   Odoo has not yet enabled CORS on /api/v1, so the browser cannot reach the
   real endpoints from the storefront. Adding ?mock=1 to the account URL runs
   the same screens against canned responses in the documented shape, so the
   client can see and approve the flow meanwhile. The code is 123456.
   Delete this block once the live endpoints answer.
   -------------------------------------------------------------------------- */

export function createMockFetch() {
  let profile = {
    partner_id: 41,
    name: 'Nivas S',
    phone: '+919876543210',
    email: null,
    gender: null,
    birthday: null,
    street: '12 Gandhi Nagar',
    street2: null,
    city: 'Chennai',
    state: 'Tamil Nadu',
    zip: '600099',
    country: 'India',
    phone_verified: true,
  };

  const reply = (body, status = 200) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

  return async (url, options = {}) => {
    const path = String(url).split('?')[0];
    const body = options.body ? JSON.parse(options.body) : {};
    await new Promise((resolve) => setTimeout(resolve, 400)); // feels like a network

    if (path.endsWith('/auth/otp/request')) {
      return reply({ status: 'ok', sent: true, channel: 'sms', expires_in: 300 });
    }
    if (path.endsWith('/auth/otp/verify')) {
      if (body.code !== '123456') return reply({ status: 'error', error: 'invalid_code' }, 400);
      return reply({
        status: 'ok',
        new_customer: false,
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 900,
        profile,
      });
    }
    if (path.endsWith('/auth/token/refresh')) {
      return reply({ status: 'ok', access_token: 'mock-access-token-2', refresh_token: 'mock-refresh-2', expires_in: 900, profile });
    }
    if (path.endsWith('/auth/logout')) return reply({ status: 'ok' });
    if (path.endsWith('/partners/me/orders')) {
      return reply({
        status: 'ok',
        orders: [
          {
            id: '1043',
            number: '#1043',
            placed_at: '2026-09-29T08:14:22Z',
            total: '12450.00',
            currency: 'INR',
            item_count: 2,
            status: 'out_for_delivery',
            tracking: { carrier: 'ST Courier', number: 'TN123456789', url: 'https://example.com/track' },
            // The live endpoint does not send `events` yet; demo mode shows the
            // shape we have asked Odoo for, so the screen can be reviewed now.
            events: [
              { at: '2026-09-29T12:30:00Z', status: 'Booked', location: 'Chennai' },
              { at: '2026-09-30T04:10:00Z', status: 'In transit', location: 'TNKGR-Krishnagiri hub' },
              { at: '2026-09-30T09:27:00Z', status: 'Out for delivery', location: 'TNABR-AMBUR \u2192 Gandhi Nagar' },
            ],
            items: [
              { title: 'Kanchipuram silk saree', variant_title: 'Deep maroon', quantity: 1,
                price: '9800.00', line_total: '9800.00', sku: 'SAR-MRN-01',
                image_url: '/cdn/shop/files/saree-mustard-navy-border-1.jpg?width=200' },
              { title: 'Matching blouse piece', quantity: 1, price: '2650.00', line_total: '2650.00' },
            ],
          },
          {
            id: '1021',
            number: '#1021',
            placed_at: '2026-08-11T05:02:00Z',
            total: '4999.00',
            currency: 'INR',
            item_count: 1,
            status: 'delivered',
            tracking: null,
            items: [{ title: 'Soft silk saree', variant_title: 'Parrot green', quantity: 1,
                       price: '4999.00', line_total: '4999.00',
                       image_url: '/cdn/shop/files/saree-parrot-green-maroon-1.jpg?width=200' }],
          },
        ],
      });
    }
    if (path.endsWith('/partners/me')) {
      if (options.method === 'DELETE') return reply({ status: 'ok' });
      if (options.method === 'PATCH') {
        profile = { ...profile, ...body };
        return reply({ status: 'ok', profile });
      }
      return reply({ status: 'ok', profile });
    }
    return reply({ status: 'error', error: 'not_found' }, 404);
  };
}

/* --- the screens ---------------------------------------------------------- */

const FIELDS = [
  { key: 'name', label: 'Name', type: 'text', autocomplete: 'name' },
  { key: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
  { key: 'street', label: 'Address', type: 'text', autocomplete: 'address-line1' },
  { key: 'street2', label: 'Address line 2', type: 'text', autocomplete: 'address-line2' },
  { key: 'city', label: 'City', type: 'text', autocomplete: 'address-level2' },
  { key: 'state', label: 'State', type: 'text', autocomplete: 'address-level1' },
  { key: 'zip', label: 'PIN code', type: 'text', autocomplete: 'postal-code', inputmode: 'numeric' },
];

class AccountArea {
  /**
   * @param {HTMLElement} root - the container holding [data-account-body]
   * @param {{popup?: boolean}} [options] - popup mode renders only the
   *   sign-in screens; profile and orders belong on the account page, which
   *   has the room for them.
   */
  constructor(root, { popup = false } = {}) {
    this.root = root;
    this.popup = popup;
    this.body = root.querySelector('[data-account-body]') ?? root;
    this.mock = isMockMode(window.location.search);
    this.api = new OdooAccountApi({
      baseUrl: root.dataset.apiBase,
      fetchImpl: this.mock ? createMockFetch() : undefined,
    });
    this.session = readSession();
    this.identifier = null;
    this.resendAt = 0;
  }

  async start() {
    // An expired access token is not a signed-out customer. Odoo's tokens have
    // no expiry of their own, so ours is an assumption; the refresh token lasts
    // 60 days and is the thing that actually decides. Try it before giving up.
    if (canRefresh(this.session)) {
      const refreshed = await this.api.refresh(this.session.refreshToken);
      if (refreshed.ok) {
        this.session = sessionFromTokens(refreshed.data);
        writeSession(this.session);
      } else if (isAuthFailure(refreshed)) {
        clearSession();
        return this.showSignIn();
      }
      // Anything else — Odoo down, no signal — leaves the session alone. The
      // call below will fail too, and says so without logging anyone out.
    }

    if (sessionState(this.session) === 'expired' && !this.session?.refreshToken) {
      return this.showSignIn();
    }

    if (this.popup) return this.showSignedInPrompt();
    return this.showAccount();
  }

  /**
   * What the popup shows to someone already signed in — which happens when
   * they open it from a second tab, or after signing in here.
   */
  showSignedInPrompt() {
    const name = displayName(this.session.profile);
    this.render(`
      <h2 class="scm-account__title">${name ? `Hello, ${escapeHtml(name.split(' ')[0])}` : 'You are signed in'}</h2>
      <p class="scm-account__lead">Your orders and details are in your account.</p>
      <a class="scm-button" href="${escapeHtml(accountPageUrl())}" style="text-align:center;text-decoration:none;display:inline-grid;place-items:center;">Go to my account</a>
      <div class="scm-actions">
        <button class="scm-link" type="button" data-action="signout">Sign out</button>
      </div>
    `);
    this.body.querySelector('[data-action="signout"]').addEventListener('click', () => this.signOut(false));
  }

  /* -- rendering -- */

  /**
   * Draw a step into the body column.
   *
   * Writes into `[data-account-body]`, never into the root — the root also
   * holds the woven border, which must survive every re-render.
   *
   * `signedIn` narrows the border to a hairline: the door carries the weave,
   * the room behind it does not, and the account screens want the width.
   */
  render(html, { signedIn = false } = {}) {
    const banner = this.mock
      ? `<p class="scm-demo" role="status">Demo mode — no real message is sent. The code is 123456. Remove <code>?mock=1</code> from the address to use the live sign-in.</p>`
      : '';
    this.root.classList.toggle('scm-account--in', signedIn);
    this.body.innerHTML = `<div class="scm-step">${banner}${html}</div>`;
    const focusTarget = this.body.querySelector('[data-autofocus]');
    if (focusTarget) focusTarget.focus();
  }

  setBusy(form, busy, label) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? 'Please wait…' : label;
  }

  showError(message) {
    const slot = this.body.querySelector('[data-error]');
    if (!slot) return;
    slot.textContent = message ?? '';
    slot.hidden = !message;
  }

  showSignIn(prefill = '') {
    this.render(`
      <h1 class="scm-account__title">Welcome back</h1>
      <p class="scm-account__lead">Sign in with your mobile number.</p>
      <form class="scm-account__form" data-form="signin" novalidate>
        <label class="scm-field">
          <span class="scm-field__label">Mobile number or email</span>
          <input class="scm-field__input" name="identifier" type="text"
                 inputmode="tel" autocomplete="tel" value="${escapeHtml(prefill)}"
                 placeholder="98765 43210" data-autofocus required>
        </label>
        <p class="scm-error" data-error hidden></p>
        <button class="scm-button" type="submit">Send code</button>
      </form>
    `);

    const form = this.body.querySelector('[data-form="signin"]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitIdentifier(form);
    });
  }

  async submitIdentifier(form) {
    const typed = form.elements.identifier.value;
    const parsed = classifyIdentifier(typed);
    if (parsed.kind === 'invalid') {
      return this.showError(errorMessage('invalid_identifier'));
    }

    this.showError(null);
    this.setBusy(form, true, 'Send code');
    const result = await this.api.requestCode(parsed.value);
    this.setBusy(form, false, 'Send code');

    if (!result.ok) return this.showError(errorMessage(result.code));

    this.identifier = parsed;
    this.resendAt = Date.now() + 30_000;
    this.showCode();
  }

  showCode() {
    const sentTo =
      this.identifier.kind === 'phone' ? maskPhone(this.identifier.value) : this.identifier.value;

    this.render(`
      <h1 class="scm-account__title">Enter the code</h1>
      <p class="scm-account__lead">We sent a ${CODE_LENGTH}-digit code to ${escapeHtml(sentTo)}.</p>
      <form class="scm-account__form" data-form="code" novalidate>
        <label class="scm-field">
          <span class="scm-field__label">Code</span>
          <input class="scm-field__input scm-field__input--code" name="code"
                 type="text" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="${CODE_LENGTH}" pattern="[0-9]*" data-autofocus required>
        </label>
        <p class="scm-error" data-error hidden></p>
        <button class="scm-button" type="submit">Sign in</button>
        <div class="scm-actions">
          <button class="scm-link" type="button" data-action="resend">Send a new code</button>
          <button class="scm-link" type="button" data-action="change">Use a different number</button>
        </div>
      </form>
    `);

    const form = this.body.querySelector('[data-form="code"]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitCode(form);
    });
    form.querySelector('[data-action="change"]').addEventListener('click', () => {
      this.showSignIn(this.identifier.kind === 'email' ? this.identifier.value : '');
    });
    form.querySelector('[data-action="resend"]').addEventListener('click', (event) => {
      this.resend(event.currentTarget);
    });
  }

  async resend(button) {
    const wait = Math.ceil((this.resendAt - Date.now()) / 1000);
    if (wait > 0) {
      return this.showError(`You can ask for a new code in ${wait} seconds.`);
    }
    button.disabled = true;
    const result = await this.api.requestCode(this.identifier.value);
    button.disabled = false;
    if (!result.ok) return this.showError(errorMessage(result.code));
    this.resendAt = Date.now() + 30_000;
    this.showError(null);
  }

  async submitCode(form) {
    const code = form.elements.code.value.trim();
    if (code.length !== CODE_LENGTH) return this.showError(errorMessage('missing_code'));

    this.showError(null);
    this.setBusy(form, true, 'Sign in');
    const result = await this.api.verifyCode(this.identifier.value, code, deviceName());
    this.setBusy(form, false, 'Sign in');

    if (!result.ok) return this.showError(errorMessage(result.code));

    this.session = sessionFromTokens(result.data);
    writeSession(this.session);

    if (this.popup) {
      // Signed in mid-browse: close the popup and leave the customer where
      // they were, rather than marching them off to an account page they
      // did not ask for. The header updates itself on the next load.
      this.showSignedInPrompt();
      window.setTimeout(() => this.root.closest('dialog')?.close(), 1200);
      return;
    }
    this.showAccount();
  }

  /**
   * Shown when we could not reach Odoo, or it answered badly. Deliberately not
   * a sign-in screen: the customer is still signed in, and telling them
   * otherwise would be both wrong and a nuisance.
   */
  showUnavailable(retry) {
    this.render(`
      <h1 class="scm-account__title">Your account</h1>
      <p class="scm-account__lead">We couldn't load your details just now. Your sign-in is still valid — this is on our side.</p>
      <button class="scm-button" type="button" data-action="retry">Try again</button>
    `, { signedIn: true });
    this.body.querySelector('[data-action="retry"]').addEventListener('click', retry);
  }

  async showAccount(tab = 'profile') {
    this.render('<p class="scm-account__lead">Loading your account…</p>', { signedIn: true });

    const result = await this.api.profile(this.session.accessToken);
    if (!result.ok) {
      // Only a rejected token means "signed out". A server error or a lost
      // connection means "try again" — the customer stays signed in.
      if (isAuthFailure(result)) {
        clearSession();
        return this.showSignIn();
      }
      return this.showUnavailable(() => this.showAccount(tab));
    }

    const profile = result.data.profile ?? result.data;
    this.session.profile = profile;
    writeSession(this.session);

    if (tab === 'orders') return this.showOrders(profile);
    return this.showProfile(profile);
  }

  navHtml(current) {
    const tab = (key, label) =>
      `<button class="scm-tab${current === key ? ' account-tab--current' : ''}"
               type="button" data-tab="${key}"
               ${current === key ? 'aria-current="page"' : ''}>${label}</button>`;
    return `<nav class="scm-nav" aria-label="Account">${tab('profile', 'Profile')}${tab('orders', 'Orders')}</nav>`;
  }

  wireNav() {
    for (const button of this.body.querySelectorAll('[data-tab]')) {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (tab === 'orders') this.showOrders(this.session.profile);
        else this.showProfile(this.session.profile);
      });
    }
  }

  async showOrders(profile) {
    this.render(`
      ${this.navHtml('orders')}
      <h1 class="scm-account__title">Your orders</h1>
      <p class="scm-account__lead">Loading…</p>
    `, { signedIn: true });
    this.wireNav();

    const result = await this.api.orders(this.session.accessToken);

    // 404 means the endpoint does not exist yet, which is a different thing
    // from "you have no orders" and must not be dressed up as one.
    const notBuilt = !result.ok && (result.status === 404 || result.code === 'not_found');

    let body;
    if (notBuilt) {
      body = `
        <p class="scm-account__lead">Order history is being connected. In the meantime we can look up
        any order for you — message us on WhatsApp or call the shop and we'll help.</p>`;
    } else if (!result.ok) {
      body = `<p class="scm-error">${escapeHtml(errorMessage(result.code))}</p>`;
    } else {
      const orders = result.data.orders ?? [];
      this.orders = orders;
      body = orders.length === 0
        ? `<p class="scm-account__lead">You haven't placed an order yet.</p>`
        : `<ul class="scm-orders">${orders.map((order) => this.orderHtml(order)).join('')}</ul>`;
    }

    this.render(`
      ${this.navHtml('orders')}
      <h1 class="scm-account__title">Your orders</h1>
      ${body}
    `, { signedIn: true });
    this.wireNav();

    for (const button of this.body.querySelectorAll('[data-order]')) {
      button.addEventListener('click', () => this.showOrderDetail(button.dataset.order));
    }
  }

  /**
   * One order in the list.
   *
   * Odoo sends more than the bare essentials — a product image, the variant,
   * a link back to the product, the AWB number — and a saree is remembered by
   * its photograph, not its SKU, so the picture carries the row.
   *
   * Everything optional is treated as optional: `tracking` can be null, the
   * tracking `url` can be null while the number exists, and an item may have
   * no image. Each piece appears only when it is there.
   */
  orderHtml(order) {
    const carrier = order.tracking?.carrier ?? 'the courier';
    let tracking = '';
    if (order.tracking?.url) {
      tracking = `<a class="scm-link" href="${escapeHtml(order.tracking.url)}" target="_blank" rel="noopener">Track with ${escapeHtml(carrier)}</a>`;
    } else if (order.tracking?.number) {
      // Booked, but the courier has given no tracking page yet.
      tracking = `<p class="scm-order__meta">${escapeHtml(carrier)} \u00b7 ${escapeHtml(order.tracking.number)}</p>`;
    }

    const items = orderItemsHtml(order);

    return `
      <li class="scm-order">
        <div class="scm-order__head">
          <span class="scm-order__number">${escapeHtml(order.number ?? '')}</span>
          <span class="scm-order__status">${escapeHtml(orderStatusLabel(order.status))}</span>
        </div>
        <p class="scm-order__meta">
          ${escapeHtml(formatOrderDate(order.placed_at))} \u00b7
          ${escapeHtml(formatMoney(order.total, order.currency))}
        </p>
        ${items ? `<ul class="scm-order__items">${items}</ul>` : ''}
        <div class="scm-order__actions">
          <button class="scm-link" type="button" data-order="${escapeHtml(String(order.id ?? ''))}">View details</button>
          ${tracking}
        </div>
      </li>
    `;
  }

  /**
   * One order, opened from the list.
   *
   * The list payload already carries everything this screen shows, so opening
   * an order costs no second request and works offline-ish: tapping back and
   * forth never reloads.
   */
  showOrderDetail(id) {
    const order = findOrder(this.orders, id);
    if (!order) return this.showOrders(this.session.profile);

    this.render(`
      ${this.navHtml('orders')}
      ${orderDetailHtml(order)}
    `, { signedIn: true });
    this.wireNav();

    const back = this.body.querySelector('[data-orders-back]');
    if (back) back.addEventListener('click', () => this.showOrders(this.session.profile));
  }

  showProfile(profile) {
    const name = displayName(profile);
    const greeting = name ? `Hello, ${escapeHtml(name.split(' ')[0])}` : 'Your account';
    const lead = name
      ? escapeHtml(profile.phone ?? '')
      : `${escapeHtml(profile.phone ?? '')} — add your name below so we know who to address.`;

    this.render(`
      ${this.navHtml('profile')}
      <h1 class="scm-account__title">${greeting}</h1>
      <p class="scm-account__lead">${lead}</p>

      <form class="scm-account__form" data-form="profile" novalidate>
        ${FIELDS.map((field) => {
          // Leave Name empty rather than pre-filling the phone number Odoo
          // used as a placeholder — otherwise the customer has to delete
          // their own number before they can type their name.
          const value = field.key === 'name' ? (name ?? '') : (profile[field.key] ?? '');
          return `
          <label class="scm-field">
            <span class="scm-field__label">${field.label}</span>
            <input class="scm-field__input" name="${field.key}" type="${field.type}"
                   autocomplete="${field.autocomplete}"
                   ${field.inputmode ? `inputmode="${field.inputmode}"` : ''}
                   value="${escapeHtml(value)}">
          </label>
        `;
        }).join('')}
        <p class="scm-error" data-error hidden></p>
        <p class="scm-note" data-saved hidden>Saved.</p>
        <button class="scm-button" type="submit">Save changes</button>
      </form>

      <div class="scm-actions scm-actions--stacked">
        <button class="scm-link" type="button" data-action="signout">Sign out</button>
        <button class="scm-link" type="button" data-action="signout-all">Sign out on all devices</button>
        <button class="scm-link scm-link--quiet" type="button" data-action="delete">Delete my account</button>
      </div>
    `, { signedIn: true });

    const form = this.body.querySelector('[data-form="profile"]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.saveProfile(form);
    });
    this.wireNav();
    this.body.querySelector('[data-action="signout"]').addEventListener('click', () => this.signOut(false));
    this.body.querySelector('[data-action="signout-all"]').addEventListener('click', () => this.signOut(true));
    this.body.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteAccount());
  }

  async saveProfile(form) {
    const fields = {};
    for (const field of FIELDS) {
      const value = form.elements[field.key].value.trim();
      const current = this.session.profile?.[field.key] ?? '';
      if (value !== current) fields[field.key] = value;
    }
    if (Object.keys(fields).length === 0) return;

    this.showError(null);
    this.setBusy(form, true, 'Save changes');
    const result = await this.api.updateProfile(this.session.accessToken, fields);
    this.setBusy(form, false, 'Save changes');

    if (!result.ok) return this.showError(errorMessage(result.code));

    this.session.profile = result.data.profile ?? { ...this.session.profile, ...fields };
    writeSession(this.session);

    const saved = this.body.querySelector('[data-saved]');
    saved.hidden = false;
    window.setTimeout(() => { saved.hidden = true; }, 3000);
  }

  async signOut(everywhere) {
    await this.api.logout(this.session.accessToken, everywhere);
    clearSession();
    this.session = null;
    this.showSignIn();
  }

  async deleteAccount() {
    const sure = window.confirm(
      'This deletes your account and the details saved with it. Orders already placed are kept, as the law requires. Continue?',
    );
    if (!sure) return;

    const result = await this.api.deleteAccount(this.session.accessToken);
    if (!result.ok) return this.showError(errorMessage(result.code));
    clearSession();
    this.session = null;
    this.showSignIn();
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function deviceName() {
  const ua = window.navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iPhone or iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Browser';
}

/** Where the account page lives, as set in the theme settings. */
function accountPageUrl() {
  return document.querySelector('[data-account-page-url]')?.dataset.accountPageUrl || '/pages/account';
}

/* --- boot ----------------------------------------------------------------

   Two things mount here:

   * the account page, when one is on screen; and
   * the sign-in popup, which lives in the layout on every page.

   The header's account icon stays an ordinary link, so with JavaScript off,
   or before this file loads, it still goes somewhere useful. The click is
   intercepted only when nobody is signed in, and only to open the popup over
   the page the customer is already on.
   -------------------------------------------------------------------------- */

if (typeof document !== 'undefined') {
  const boot = () => {
    for (const root of document.querySelectorAll('[data-account-area]')) {
      const popup = root.hasAttribute('data-account-popup');
      // The popup is filled when it opens, not on page load: no customer
      // should pay for a sign-in screen they never look at.
      if (!popup) new AccountArea(root).start();
    }

    const dialog = document.querySelector('[data-login-dialog]');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    const dialogRoot = dialog.querySelector('[data-account-area]');
    let area = null;

    const open = () => {
      area ??= new AccountArea(dialogRoot, { popup: true });
      area.session = readSession();
      area.start();
      dialog.showModal();
    };

    for (const link of document.querySelectorAll('.account-button__link')) {
      link.addEventListener('click', (event) => {
        if (!shouldOpenSignInPopup(readSession())) return; // signed in: follow the link
        event.preventDefault();
        open();
      });
    }

    // Clicking the dark area outside the card closes it, as people expect.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
