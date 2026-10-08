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
 * Is anyone signed in on this browser?
 *
 * Wider than "is the access token good": a lapsed token with a refresh token
 * behind it is a customer who signed in and has not left. Mirrored by the
 * inline script in layout/theme.liquid, which sets html.scm-signed-in before
 * the page paints — keep the two in step.
 */
export function isSignedIn(session, now = Date.now()) {
  if (!session) return false;
  return sessionState(session, now) !== 'expired' || Boolean(session.refreshToken);
}

/**
 * What the Checkout and Buy it now buttons do: send the shopper to sign in
 * first, or let them through. Shopify's checkout cannot ask for our sign-in,
 * so this is the last point at which we can.
 */
export function checkoutAction(session, now = Date.now()) {
  return isSignedIn(session, now) ? 'proceed' : 'signin';
}

/**
 * Cart attributes that travel with the order to Shopify, and from there to
 * Odoo, so the order arrives already tied to the customer who placed it.
 * Unknown values are left out rather than sent blank.
 */
export function checkoutAttributes(session) {
  const profile = session?.profile ?? {};
  const attributes = {};
  if (profile.partner_id != null && profile.partner_id !== '') attributes.odoo_partner_id = String(profile.partner_id);
  if (profile.phone) attributes.customer_phone = String(profile.phone);
  return attributes;
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
  // What ST Courier's codes come to once Odoo translates them: an NDR (no one
  // home, address not found) and an RTO (the parcel coming back to us).
  delivery_attempted: 'Delivery attempted',
  rto: 'Returning to us',
  returning: 'Returning to us',
};

const STOPPED = new Set(['cancelled', 'returned', 'refunded', 'rto', 'returning']);

/**
 * Courier and ERP systems speak in codes — DRS, RTO, rto_initiated. A customer
 * should never be shown one; anything we do not recognise becomes a plain
 * holding phrase.
 */
export function orderStatusLabel(status) {
  return ORDER_STATUS[status] ?? 'In progress';
}

/**
 * The colour an order's status is shown in: finished, stopped, or still on
 * its way. Anything unrecognised is still on its way, as the label says.
 */
export function statusTone(status) {
  if (status === 'delivered') return 'done';
  if (STOPPED.has(status)) return 'stop';
  if (status === 'delivery_attempted') return 'alert'; // still coming, but needs the customer
  return 'progress';
}

/* --- times ---------------------------------------------------------------- */

/** Day, month, hour and minute of a moment, in the given (or the browser's) zone. */
function clockParts(date, timeZone) {
  const parts = {};
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone, day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
  });
  for (const part of format.formatToParts(date)) parts[part.type] = part.value;
  return { day: Number(parts.day), month: Number(parts.month) - 1, hour: Number(parts.hour) % 24, minute: parts.minute };
}

/**
 * When a courier update happened: 30 Sep, 2:57 pm. A parcel moves several
 * times a day, so the time matters as much as the date. Months are spelled
 * by hand for the same reason as formatOrderDate.
 */
export function formatEventTime(iso, timeZone) {
  const date = new Date(iso ?? '');
  if (Number.isNaN(date.getTime())) return '';
  const { day, month, hour, minute } = clockParts(date, timeZone);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${day} ${MONTHS[month]}, ${hour12}:${minute} ${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * How fresh an update is: "just now", "5 minutes ago", "3 hours ago" — and,
 * once it is a day old, the date and time, which say more than "2 days ago".
 */
export function relativeTime(iso, now = Date.now(), timeZone) {
  const then = new Date(iso ?? '').getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return formatEventTime(iso, timeZone);
}

/* --- the order, as the screens read it ------------------------------------ */

/**
 * One shape for an order, whichever names Odoo used.
 *
 * We asked for `status` and `tracking { carrier, number, url }`; Odoo's own
 * order endpoint answers with `customer_status`, `awb_no`, `courier` and
 * `tracking_url`, plus `last_status_at`, `delivered_at` and `events`. Both are
 * read here, so the screens work with either and keep working when Odoo moves
 * from one to the other. Safe to apply twice.
 */
export function normalizeOrder(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const given = raw.tracking ?? {};
  const number = given.number ?? raw.awb_no ?? null;
  const tracking = number
    ? { carrier: given.carrier ?? raw.courier ?? null, number: String(number), url: given.url ?? raw.tracking_url ?? null }
    : null;

  const time = (event) => {
    const t = new Date(event.at ?? '').getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .filter((event) => event && (event.at || event.status))
    .map((event) => ({ at: event.at ?? null, status: event.status ?? '', location: event.location ?? null }))
    .sort((a, b) => time(b) - time(a));

  return {
    ...raw,
    status: raw.status ?? raw.customer_status ?? null,
    tracking,
    lastStatus: raw.lastStatus ?? raw.last_status ?? null,
    lastStatusAt: raw.lastStatusAt ?? raw.last_status_at ?? null,
    deliveredAt: raw.deliveredAt ?? raw.delivered_at ?? null,
    events,
  };
}

/**
 * Where to follow a parcel when Odoo sends no link of its own.
 *
 * ST Courier's site has no address that takes an AWB: its form posts the
 * number and opens a fixed page. So the best we can do is open that page with
 * the AWB already on the customer's clipboard (see the click handler).
 */
const CARRIER_PAGES = {
  'st courier': 'https://stcourier.com/#track_shipment',
};

export function carrierTrackingPage(carrier) {
  return CARRIER_PAGES[String(carrier ?? 'st courier').trim().toLowerCase()] ?? null;
}

/** The control that takes a customer to the courier, or nothing. */
function trackControlHtml(tracking, className) {
  if (!tracking?.number) return '';
  const carrier = escapeHtml(tracking.carrier ?? 'ST Courier');
  if (tracking.url) {
    return `<a class="${className}" href="${escapeHtml(tracking.url)}" target="_blank" rel="noopener">Track on ${carrier}</a>`;
  }
  if (!carrierTrackingPage(tracking.carrier)) return '';
  return `<button class="${className}" type="button" data-track-awb="${escapeHtml(tracking.number)}"
            data-track-page="${escapeHtml(carrierTrackingPage(tracking.carrier))}">Track on ${carrier}</button>`;
}

/** +918825464712 → +91 88254 64712. Anything else is left as it came. */
export function formatPhone(phone) {
  const value = String(phone ?? '');
  const match = value.match(/^\+91(\d{5})(\d{5})$/);
  return match ? `+91 ${match[1]} ${match[2]}` : value;
}

/* --- the signed-in frame -------------------------------------------------- */

/**
 * Every signed-in screen sits in the same frame: a sidebar saying who you are,
 * where you are and how to leave, and the screen itself beside it. On a phone
 * the sidebar folds into a row of tabs above the screen (see custom.css).
 */
export function accountShellHtml(current, profile, content) {
  const name = displayName(profile);
  const hello = name ? `Hello, ${escapeHtml(name.split(' ')[0])}` : 'Your account';
  const phone = formatPhone(profile?.phone);

  const tab = (key, label) => current === key
    ? `<button class="scm-tab scm-tab--current" type="button" data-tab="${key}" aria-current="page">${label}</button>`
    : `<button class="scm-tab" type="button" data-tab="${key}">${label}</button>`;

  return `
    <div class="scm-shell">
      <aside class="scm-side">
        <div class="scm-side__who">
          <p class="scm-side__hello">${hello}</p>
          ${phone ? `<p class="scm-side__phone">${escapeHtml(phone)}</p>` : ''}
        </div>
        <nav class="scm-nav" aria-label="Account">
          ${tab('profile', 'Profile')}
          ${tab('orders', 'Orders')}
          <button class="scm-tab scm-side__signout" type="button" data-action="signout">Sign out</button>
        </nav>
      </aside>
      <div class="scm-main">${content}</div>
    </div>
  `;
}

/* --- the orders list ------------------------------------------------------ */

/**
 * One order in the list.
 *
 * Laid out the way every shop's order history is: a strip with when, how
 * much and which order; the items; then where it is and a way in. A saree is
 * remembered by its photograph, not its SKU, so the picture carries the row.
 *
 * Everything optional is treated as optional: `tracking` can be null, the
 * tracking `url` can be null while the number exists, and an item may have
 * no image. Each piece appears only when it is there.
 */
export function orderCardHtml(raw, now = Date.now()) {
  const order = normalizeOrder(raw);
  const { tracking } = order;
  const updated = order.lastStatusAt ? `Updated ${relativeTime(order.lastStatusAt, now)}` : '';
  const trackingHtml = tracking
    ? `<span class="scm-order__awb">${escapeHtml(tracking.carrier ?? 'Courier')} \u00b7 ${escapeHtml(tracking.number)}</span>
       ${updated ? `<span class="scm-order__updated">${escapeHtml(updated)}</span>` : ''}
       ${trackControlHtml(tracking, 'scm-link')}
       <span class="scm-track__note" data-track-note hidden role="status"></span>`
    : '';

  const items = orderItemsHtml(order);

  return `
    <li class="scm-order">
      <div class="scm-order__strip">
        ${orderFactsHtml(order)}
        <span class="scm-pill scm-pill--${statusTone(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span>
      </div>
      ${items ? `<ul class="scm-order__items">${items}</ul>` : ''}
      <div class="scm-order__foot">
        <div class="scm-order__tracking">${trackingHtml}</div>
        <button class="scm-button scm-button--ghost" type="button" data-order="${escapeHtml(String(order.id ?? ''))}">View details</button>
      </div>
    </li>
  `;
}

/** Placed / total / order number, as labelled columns. */
function orderFactsHtml(order) {
  const fact = (label, value) => value
    ? `<div class="scm-fact"><dt class="scm-fact__label">${label}</dt><dd class="scm-fact__value">${escapeHtml(value)}</dd></div>`
    : '';
  return `
    <dl class="scm-facts">
      ${fact('Order placed', formatOrderDate(order.placed_at))}
      ${fact('Total', order.total ? formatMoney(order.total, order.currency) : '')}
      ${fact('Order', order.number ?? '')}
    </dl>
  `;
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
  if (STOPPED.has(status)) {
    return [
      step('placed', 'Order placed', 'done'),
      step('shipped', 'Shipped', 'done'),
      step(status, orderStatusLabel(status), 'current'),
    ];
  }
  // A failed attempt is where "out for delivery" would be: the parcel got
  // that far, and will be tried again or held for collection.
  if (status === 'delivery_attempted') {
    const at = JOURNEY.findIndex((entry) => entry.key === 'out_for_delivery');
    return JOURNEY.map((entry, i) => i === at
      ? step('delivery_attempted', 'Delivery attempted', 'current')
      : step(entry.key, entry.label, i < at ? 'done' : 'todo'));
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
 * One order, opened: where the parcel is, how fresh that is, how to follow
 * it with the courier, and everything the courier has reported so far.
 *
 * Odoo writes ST Courier's status into Shopify and passes it on here. Until
 * it sends the courier's own history (`events`), the journey carries the
 * screen and the history card says what will appear there.
 */
export function orderDetailHtml(raw, now = Date.now()) {
  const order = normalizeOrder(raw);
  const { tracking } = order;

  const stepDate = (key) => {
    if (key === 'placed') return formatOrderDate(order.placed_at);
    if (key === 'delivered' && order.deliveredAt) return formatOrderDate(order.deliveredAt);
    return '';
  };
  const steps = trackingSteps(order).map((step) => {
    const when = stepDate(step.key);
    return `
    <li class="scm-track__step scm-track__step--${step.state}"${step.state === 'current' ? ' aria-current="step"' : ''}>
      <span class="scm-track__label">${escapeHtml(step.label)}</span>
      ${when ? `<span class="scm-track__date">${escapeHtml(when)}</span>` : ''}
    </li>`;
  }).join('');

  let freshness = '';
  if (order.status === 'delivered' && order.deliveredAt) {
    freshness = `Delivered on ${formatEventTime(order.deliveredAt)}`;
  } else if (order.lastStatusAt) {
    freshness = `Updated ${relativeTime(order.lastStatusAt, now)}`;
  }

  const courier = tracking ? `
      <div class="scm-courier">
        <div class="scm-courier__info">
          <span class="scm-courier__name">${escapeHtml(tracking.carrier ?? 'Courier')}</span>
          <span class="scm-courier__awb">AWB <strong>${escapeHtml(tracking.number)}</strong></span>
          <button class="scm-link scm-courier__copy" type="button" data-copy="${escapeHtml(tracking.number)}">Copy</button>
        </div>
        ${trackControlHtml(tracking, 'scm-button scm-courier__track')}
        <p class="scm-track__note" data-track-note hidden role="status"></p>
      </div>` : '';

  const events = order.events.map((event, i) => `
    <li class="scm-track__event${i === 0 ? ' scm-track__event--latest' : ''}">
      <span class="scm-track__when">${escapeHtml(formatEventTime(event.at))}</span>
      <span class="scm-track__what">${escapeHtml(event.status)}</span>
      ${event.location ? `<span class="scm-track__where">${escapeHtml(event.location)}</span>` : ''}
    </li>`).join('');

  const history = events
    ? `<ol class="scm-track__events">${events}</ol>`
    : `<p class="scm-track__empty">${tracking
        ? 'The courier\'s updates will appear here as the parcel moves.'
        : 'Courier updates will appear here once your order is handed to the courier.'}</p>`;

  const items = orderItemsHtml(order);

  return `
    <button class="scm-link scm-order__back" type="button" data-orders-back>\u2190 Back to orders</button>
    <div class="scm-pane__head">
      <h1 class="scm-account__title">Order ${escapeHtml(order.number ?? '')}</h1>
    </div>
    <div class="scm-order__strip scm-order__strip--detail">${orderFactsHtml(order)}</div>

    <section class="scm-track" aria-label="Delivery">
      <div class="scm-track__head">
        <div class="scm-track__status">
          <span class="scm-pill scm-pill--${statusTone(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span>
          <p class="scm-track__updated" data-updated>${escapeHtml(freshness)}</p>
        </div>
        <button class="scm-button scm-button--ghost scm-track__refresh" type="button" data-action="refresh-order">Refresh</button>
      </div>
      <ol class="scm-track__steps">${steps}</ol>
      ${courier}
    </section>

    <section class="scm-card" aria-labelledby="scm-history-title">
      <h2 class="scm-card__title" id="scm-history-title">Shipment updates</h2>
      ${history}
    </section>

    ${items ? `
    <section class="scm-card" aria-labelledby="scm-items-title">
      <h2 class="scm-card__title" id="scm-items-title">Items</h2>
      <ul class="scm-order__items scm-order__items--detail">${items}</ul>
    </section>` : ''}
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
  markSignedIn(isSignedIn(session));
}

export function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
  markSignedIn(false);
}

/**
 * html.scm-signed-in decides which buy buttons show (see custom.css): Shopify's
 * express buttons for a signed-in customer, our sign-in-first Buy it now for
 * everyone else. Set early by layout/theme.liquid; kept true to the session here.
 */
function markSignedIn(signedIn) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('scm-signed-in', signedIn);
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
            // ST Courier gives no tracking link, so — as live — there is none.
            tracking: { carrier: 'ST Courier', number: '53038567223', url: null },
            last_status_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
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
            tracking: { carrier: 'ST Courier', number: '53038561021', url: null },
            delivered_at: '2026-08-13T09:40:00Z',
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

// `group` picks the card a field sits in; `wide` spans the whole row.
const FIELDS = [
  { key: 'name', label: 'Full name', type: 'text', autocomplete: 'name', group: 'personal' },
  { key: 'email', label: 'Email', type: 'email', autocomplete: 'email', group: 'personal' },
  { key: 'street', label: 'Address', type: 'text', autocomplete: 'address-line1', group: 'address', wide: true },
  { key: 'street2', label: 'Address line 2', type: 'text', autocomplete: 'address-line2', group: 'address', wide: true },
  { key: 'city', label: 'City', type: 'text', autocomplete: 'address-level2', group: 'address' },
  { key: 'state', label: 'State', type: 'text', autocomplete: 'address-level1', group: 'address' },
  { key: 'zip', label: 'PIN code', type: 'text', autocomplete: 'postal-code', inputmode: 'numeric', group: 'address' },
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
    // Set by openSignIn when the popup stands between the shopper and
    // checkout: why they are being asked, and what to do once they are in.
    this.reason = null;
    this.onSignedIn = null;
    if (!popup) this.body.addEventListener('click', (event) => this.handleTrackingClick(event));
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

    if (this.popup && this.onSignedIn) return this.continueSignedIn();
    if (this.popup) return this.showSignedInPrompt();
    return this.showAccount();
  }

  /**
   * Signed in, and the popup was opened on the way to somewhere — checkout.
   * Say where we are going, then go; the shopper has already said what they
   * wanted to do once and should not have to press it again.
   */
  continueSignedIn() {
    const next = this.onSignedIn;
    this.onSignedIn = null;
    this.render(`
      <h2 class="scm-account__title" id="scm-dialog-title">Thank you</h2>
      <p class="scm-account__lead" role="status">Taking you to checkout…</p>
    `);
    next();
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
    const [title, lead] = this.reason === 'checkout'
      ? ['Sign in to check out', 'Sign in with your mobile number so we can send you order and delivery updates. New here? The same code creates your account.']
      : ['Welcome back', 'Sign in with your mobile number.'];
    this.render(`
      <h1 class="scm-account__title">${title}</h1>
      <p class="scm-account__lead">${lead}</p>
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

    if (this.popup && this.onSignedIn) return this.continueSignedIn();
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

  /** Draw a signed-in screen inside the account frame and wire the frame up. */
  renderShell(current, content) {
    this.render(accountShellHtml(current, this.session.profile, content), { signedIn: true });
    for (const button of this.body.querySelectorAll('[data-tab]')) {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (tab === 'orders') this.showOrders(this.session.profile);
        else this.showProfile(this.session.profile);
      });
    }
    this.body.querySelector('[data-action="signout"]').addEventListener('click', () => this.signOut(false));
  }

  async showOrders(profile) {
    this.renderShell('orders', `
      <h1 class="scm-account__title">Your orders</h1>
      <p class="scm-account__lead">Loading…</p>
    `);

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
      const orders = (result.data.orders ?? []).map(normalizeOrder);
      this.orders = orders;
      body = orders.length === 0
        ? `<div class="scm-card scm-empty">
             <p class="scm-account__lead">You haven't placed an order yet.</p>
             <a class="scm-button" href="/collections/all">Start shopping</a>
           </div>`
        : `<ul class="scm-orders">${orders.map((order) => orderCardHtml(order)).join('')}</ul>`;
    }

    this.renderShell('orders', `
      <h1 class="scm-account__title">Your orders</h1>
      ${body}
    `);

    for (const button of this.body.querySelectorAll('[data-order]')) {
      button.addEventListener('click', () => this.showOrderDetail(button.dataset.order));
    }
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

    this.renderShell('orders', orderDetailHtml(order));

    const back = this.body.querySelector('[data-orders-back]');
    if (back) back.addEventListener('click', () => this.showOrders(this.session.profile));

    const refresh = this.body.querySelector('[data-action="refresh-order"]');
    if (refresh) refresh.addEventListener('click', () => this.refreshOrder(order.id, refresh));
  }

  /**
   * Ask Odoo again, then redraw the same order. Odoo is the one listening to
   * ST Courier, so this is as fresh as the status gets.
   */
  async refreshOrder(id, button) {
    button.disabled = true;
    button.textContent = 'Checking…';
    const result = await this.api.orders(this.session.accessToken);
    if (result.ok) {
      this.orders = (result.data.orders ?? []).map(normalizeOrder);
      if (!findOrder(this.orders, id)) return this.showOrders(this.session.profile);
      this.showOrderDetail(id);
      const updated = this.body.querySelector('[data-updated]');
      if (updated && !updated.textContent.trim()) updated.textContent = 'Checked just now';
      const again = this.body.querySelector('[data-action="refresh-order"]');
      if (again) again.textContent = 'Up to date';
      return;
    }
    button.disabled = false;
    button.textContent = 'Refresh';
    const updated = this.body.querySelector('[data-updated]');
    if (updated) updated.textContent = 'Could not check just now. Try again in a moment.';
  }

  /**
   * Copy and Track, on the list and on an opened order. One listener on the
   * body, which survives every redraw.
   */
  handleTrackingClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const copy = target?.closest('[data-copy]');
    if (copy) {
      copyText(copy.dataset.copy).then((ok) => {
        copy.textContent = ok ? 'Copied' : 'Copy failed';
        window.setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
      });
      return;
    }

    const track = target?.closest('[data-track-awb]');
    if (!track) return;
    const awb = track.dataset.trackAwb;
    // Open first, while the click still counts as the customer's own: a
    // window opened after an await is treated as a pop-up and blocked.
    window.open(track.dataset.trackPage, '_blank', 'noopener');
    const note = track.parentElement?.querySelector('[data-track-note]');
    copyText(awb).then((ok) => {
      if (!note) return;
      note.textContent = ok
        ? `AWB ${awb} is copied. Paste it into the box on ST Courier's page and press Search.`
        : `Enter AWB ${awb} in the box on ST Courier's page and press Search.`;
      note.hidden = false;
    });
  }

  showProfile(profile) {
    const name = displayName(profile);
    const field = (spec) => {
      // Leave Name empty rather than pre-filling the phone number Odoo
      // used as a placeholder — otherwise the customer has to delete
      // their own number before they can type their name.
      const value = spec.key === 'name' ? (name ?? '') : (profile[spec.key] ?? '');
      return `
        <label class="scm-field${spec.wide ? ' scm-field--wide' : ''}">
          <span class="scm-field__label">${spec.label}</span>
          <input class="scm-field__input" name="${spec.key}" type="${spec.type}"
                 autocomplete="${spec.autocomplete}"
                 ${spec.inputmode ? `inputmode="${spec.inputmode}"` : ''}
                 value="${escapeHtml(value)}">
        </label>`;
    };
    const group = (key) => FIELDS.filter((spec) => spec.group === key).map(field).join('');

    this.renderShell('profile', `
      <div class="scm-pane__head">
        <h1 class="scm-account__title">Profile</h1>
      </div>
      ${name ? '' : `<p class="scm-account__lead">Add your name below so we know who to address.</p>`}

      <form class="scm-account__form" data-form="profile" novalidate>
        <fieldset class="scm-card">
          <legend class="scm-card__title">Personal details</legend>
          <div class="scm-grid scm-grid--2">
            ${group('personal')}
            <div class="scm-field">
              <span class="scm-field__label">Mobile number</span>
              <p class="scm-field__static">${escapeHtml(formatPhone(profile.phone))}
                <span class="scm-field__hint">Used to sign in</span></p>
            </div>
          </div>
        </fieldset>

        <fieldset class="scm-card">
          <legend class="scm-card__title">Delivery address</legend>
          <div class="scm-grid scm-grid--3">
            ${group('address')}
          </div>
        </fieldset>

        <p class="scm-error" data-error hidden></p>
        <div class="scm-save">
          <p class="scm-note" data-saved hidden role="status">Saved.</p>
          <button class="scm-button" type="submit">Save changes</button>
        </div>
      </form>

      <section class="scm-card scm-card--quiet" aria-labelledby="scm-settings-title">
        <h2 class="scm-card__title" id="scm-settings-title">Account settings</h2>
        <div class="scm-settings">
          <div class="scm-setting">
            <p class="scm-setting__text">Signed in on another phone or computer you no longer use?</p>
            <button class="scm-button scm-button--ghost" type="button" data-action="signout-all">Sign out on all devices</button>
          </div>
          <div class="scm-setting">
            <p class="scm-setting__text">Remove your account and the details saved with it.</p>
            <button class="scm-link scm-link--danger" type="button" data-action="delete">Delete my account</button>
          </div>
        </div>
      </section>
    `);

    const form = this.body.querySelector('[data-form="profile"]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.saveProfile(form);
    });
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

/** Put text on the clipboard; true if it got there. */
async function copyText(text) {
  try {
    await window.navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or a page without clipboard permission.
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    field.remove();
    return ok;
  }
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

/* --- sign in before checkout ----------------------------------------------

   Shopify's checkout cannot ask for our sign-in, so the theme asks on the way
   there: the cart's Checkout button and, for signed-out shoppers, our own
   Buy it now (Shopify's express buttons are hidden for them in custom.css —
   their clicks cannot be held while someone signs in).

   Someone who types /checkout into the address bar still gets through; this
   guards the doors a shopper actually uses.
   -------------------------------------------------------------------------- */

function shopRoot() {
  return window.Shopify?.routes?.root ?? '/';
}

/** Tie the cart to the customer, then leave for checkout. */
async function goToCheckout() {
  const attributes = checkoutAttributes(readSession());
  if (Object.keys(attributes).length > 0) {
    try {
      await fetch(`${shopRoot()}cart/update.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ attributes }),
      });
    } catch {
      // A cart without the attributes is still a cart; the order is matched
      // by phone in Odoo. Never block the sale on this.
    }
  }
  window.location.href = '/checkout';
}

/** Put the product the button belongs to in the cart, then go to checkout. */
async function buyNow(button) {
  const form = button.closest('form');
  if (!form) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`${shopRoot()}cart/add.js`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(form),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      window.alert(problem.description || problem.message || 'We could not add this to your cart. Please try again.');
      return;
    }
    await goToCheckout();
  } catch {
    window.alert('We could not reach the shop. Check your connection and try again.');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

function wireCheckoutGate(openSignIn) {
  const whenSignedIn = (go) => {
    if (checkoutAction(readSession()) === 'proceed') return go();
    openSignIn({ reason: 'checkout', onSignedIn: go });
  };

  // Capture phase, on the document: the cart drawer is re-rendered on every
  // change, so a listener on the button itself would be lost.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'cart-form') return;
    if (event.submitter?.name !== 'checkout') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    whenSignedIn(goToCheckout);
  }, true);

  // The quick-add modal morphs product forms in later, so this is delegated too.
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-scm-buy-now]') : null;
    if (!button) return;
    event.preventDefault();
    whenSignedIn(() => buyNow(button));
  });
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

    /**
     * Open the sign-in popup. `onSignedIn` runs once the shopper is in — at
     * once if they already are — and `reason` changes what the popup says.
     */
    const openSignIn = ({ reason = null, onSignedIn = null } = {}) => {
      area ??= new AccountArea(dialogRoot, { popup: true });
      area.session = readSession();
      area.reason = reason;
      area.onSignedIn = onSignedIn ? () => { dialog.close(); onSignedIn(); } : null;
      area.start();
      if (!dialog.open) dialog.showModal();
    };

    // Whatever the popup was opened for is forgotten when it closes, so a later
    // click on the header icon cannot set off a checkout.
    dialog.addEventListener('close', () => {
      if (!area) return;
      area.reason = null;
      area.onSignedIn = null;
    });

    for (const link of document.querySelectorAll('.account-button__link')) {
      link.addEventListener('click', (event) => {
        if (!shouldOpenSignInPopup(readSession())) return; // signed in: follow the link
        event.preventDefault();
        openSignIn();
      });
    }

    // Clicking the dark area outside the card closes it, as people expect.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });

    wireCheckoutGate(openSignIn);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
