import { describe, it, expect } from 'vitest';
import { formatMoney, formatOrderDate, orderStatusLabel, statusTone, orderCardHtml } from '../assets/account.js';

// What a customer reads on the orders screen. Money and dates are where a
// small mistake looks like a big one: a saree priced ₹12,450 shown as ₹12.45
// or a delivery date a day out both destroy trust faster than a missing page.

describe('formatMoney', () => {
  it('writes rupees the way Indian customers read them', () => {
    // Indian grouping: 12,450 not 12,450 — and 1,24,500 not 124,500.
    expect(formatMoney('12450.00', 'INR')).toBe('₹12,450.00');
    expect(formatMoney('124500.00', 'INR')).toBe('₹1,24,500.00');
  });

  it('accepts a number as well as a string', () => {
    expect(formatMoney(2499, 'INR')).toBe('₹2,499.00');
  });

  it('keeps the paise', () => {
    expect(formatMoney('2499.50', 'INR')).toBe('₹2,499.50');
  });

  it('falls back to showing the raw value rather than NaN', () => {
    expect(formatMoney('not money', 'INR')).toBe('not money');
    expect(formatMoney(null, 'INR')).toBe('');
  });
});

describe('formatOrderDate', () => {
  it('writes a date a customer can scan', () => {
    expect(formatOrderDate('2026-09-29T08:14:22Z')).toMatch(/29 Sep 2026/);
  });

  it('returns nothing for a missing or broken date instead of "Invalid Date"', () => {
    expect(formatOrderDate(null)).toBe('');
    expect(formatOrderDate('whenever')).toBe('');
  });
});

describe('orderStatusLabel', () => {
  it('says what has happened in words, not codes', () => {
    expect(orderStatusLabel('placed')).toBe('Order placed');
    expect(orderStatusLabel('shipped')).toBe('Shipped');
    expect(orderStatusLabel('out_for_delivery')).toBe('Out for delivery');
    expect(orderStatusLabel('delivered')).toBe('Delivered');
    expect(orderStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('never shows an internal code to a customer', () => {
    for (const unknown of ['DRS', 'rto_initiated', '', null, undefined]) {
      expect(orderStatusLabel(unknown), String(unknown)).not.toMatch(/_|^[A-Z]{3}$/);
      expect(orderStatusLabel(unknown).length).toBeGreaterThan(0);
    }
  });
});

describe('statusTone', () => {
  it('colours an order by whether it is finished, stopped or still moving', () => {
    expect(statusTone('delivered')).toBe('done');
    for (const s of ['cancelled', 'returned', 'refunded']) expect(statusTone(s), s).toBe('stop');
    for (const s of ['placed', 'paid', 'packed', 'shipped', 'out_for_delivery', 'DRS', null]) {
      expect(statusTone(s), String(s)).toBe('progress');
    }
  });
});

describe('orderCardHtml', () => {
  const order = {
    id: '1017',
    number: '#1017',
    placed_at: '2026-10-07T08:14:22Z',
    total: '12450.00',
    currency: 'INR',
    status: 'packed',
    tracking: { carrier: 'ST Courier', number: '53038567223', url: null },
    items: [{ title: 'Tussar saree', quantity: 1, line_total: '12450.00' }],
  };
  const html = orderCardHtml(order);

  it('heads the card with the date, the total and the number', () => {
    expect(html).toContain('scm-order__strip');
    expect(html).toContain('7 Oct 2026');
    expect(html).toContain('₹12,450.00');
    expect(html).toContain('#1017');
  });

  it('shows the status as a pill in its tone', () => {
    expect(html).toContain('scm-pill--progress');
    expect(html).toContain('Being packed');
    expect(orderCardHtml({ ...order, status: 'delivered' })).toContain('scm-pill--done');
    expect(orderCardHtml({ ...order, status: 'cancelled' })).toContain('scm-pill--stop');
  });

  it('shows the AWB when the courier has given no tracking page', () => {
    expect(html).toContain('ST Courier · 53038567223');
    expect(html).not.toContain('<a');
  });

  it('links to the tracking page once there is one', () => {
    const linked = orderCardHtml({ ...order, tracking: { ...order.tracking, url: 'https://example.com/t' } });
    expect(linked).toContain('href="https://example.com/t"');
  });

  it('opens the order from the card', () => {
    expect(html).toContain('data-order="1017"');
    expect(html).toContain('View details');
  });

  it('escapes what came from outside', () => {
    const nasty = orderCardHtml({ ...order, number: '<script>x()</script>', items: [{ title: '<img src=x>' }] });
    expect(nasty).not.toContain('<script>x()');
    expect(nasty).not.toContain('<img src=x>');
  });
});
