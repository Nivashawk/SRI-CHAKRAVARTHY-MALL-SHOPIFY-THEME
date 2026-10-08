import { describe, it, expect } from 'vitest';
import { findOrder, trackingSteps, orderDetailHtml, normalizeOrder, relativeTime, formatEventTime, orderStatusLabel, statusTone } from '../assets/account.js';

// Opening one order. The list answers "what did I buy"; this screen answers
// "where is it", which is the question people actually come back to ask.

const order = {
  id: '1043',
  number: '#1043',
  placed_at: '2026-09-29T08:14:22Z',
  total: '12450.00',
  currency: 'INR',
  item_count: 2,
  status: 'out_for_delivery',
  tracking: { carrier: 'ST Courier', number: 'TN123456789', url: 'https://example.com/track' },
  items: [
    { title: 'Kanchipuram silk saree', variant_title: 'Deep maroon', quantity: 1,
      price: '9800.00', line_total: '9800.00', sku: 'SAR-MRN-01' },
    { title: 'Matching blouse piece', quantity: 2, price: '1325.00', line_total: '2650.00' },
  ],
};

describe('findOrder', () => {
  it('finds the order the customer tapped', () => {
    expect(findOrder([order], '1043')).toBe(order);
  });

  it('does not care whether the id arrived as a number or a string', () => {
    expect(findOrder([{ ...order, id: 1043 }], '1043').number).toBe('#1043');
  });

  it('returns nothing rather than the wrong order', () => {
    expect(findOrder([order], '9999')).toBeUndefined();
    expect(findOrder(null, '1043')).toBeUndefined();
  });
});

describe('trackingSteps', () => {
  const keys = (status) => trackingSteps({ status }).map((step) => step.key);
  const stateOf = (status, key) => trackingSteps({ status }).find((s) => s.key === key)?.state;

  it('walks the parcel from placed to delivered', () => {
    expect(keys('out_for_delivery')).toEqual(['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered']);
  });

  it('marks what has happened, what is happening, and what has not', () => {
    expect(stateOf('shipped', 'placed')).toBe('done');
    expect(stateOf('shipped', 'shipped')).toBe('current');
    expect(stateOf('shipped', 'delivered')).toBe('todo');
  });

  it('shows a delivered parcel as finished, with nothing still pending', () => {
    expect(trackingSteps({ status: 'delivered' }).every((s) => s.state !== 'todo')).toBe(true);
    expect(stateOf('delivered', 'delivered')).toBe('current');
  });

  it('treats payment received as the order being placed, not a step of its own', () => {
    expect(keys('paid')).not.toContain('paid');
    expect(stateOf('paid', 'placed')).toBe('current');
  });

  it('does not pretend a cancelled or returned order is on its way', () => {
    expect(keys('cancelled')).toEqual(['placed', 'cancelled']);
    expect(stateOf('cancelled', 'cancelled')).toBe('current');
    expect(keys('returned')).toEqual(['placed', 'shipped', 'returned']);
  });

  it('falls back to the first step for a status it does not know', () => {
    expect(stateOf('something_new', 'placed')).toBe('current');
  });

  it('labels every step in words, never in courier codes', () => {
    for (const step of trackingSteps({ status: 'DRS' })) {
      expect(step.label).not.toMatch(/_|^[A-Z]{3}$/);
    }
  });
});

describe('orderDetailHtml', () => {
  const html = orderDetailHtml(order);

  it('leads with the order, its date and what it came to', () => {
    expect(html).toContain('#1043');
    expect(html).toContain('29 Sep 2026');
    expect(html).toContain('₹12,450.00');
  });

  it('shows the courier, the tracking number and a way to follow it', () => {
    expect(html).toContain('ST Courier');
    expect(html).toContain('TN123456789');
    expect(html).toContain('https://example.com/track');
  });

  it('lists every item with its own line total', () => {
    expect(html).toContain('Kanchipuram silk saree');
    expect(html).toContain('Matching blouse piece');
    expect(html).toContain('₹9,800.00');
    expect(html).toContain('₹2,650.00');
  });

  it('offers a way back to the list', () => {
    expect(html).toContain('data-orders-back');
  });

  it('shows the courier history once Odoo sends it, and no empty frame before then', () => {
    expect(html).not.toContain('scm-track__events');
    const withEvents = orderDetailHtml({
      ...order,
      events: [
        { at: '2026-09-30T04:00:00Z', status: 'Out for Delivery', location: 'TNABR-AMBUR → Gandhi Nagar' },
      ],
    });
    expect(withEvents).toContain('scm-track__events');
    expect(withEvents).toContain('Out for Delivery');
    expect(withEvents).toContain('Gandhi Nagar');
    expect(withEvents).toMatch(/30 Sep, \d{1,2}:\d{2} [ap]m/); // updates carry the time, not just the day
  });

  it('escapes anything a customer did not write themselves', () => {
    const nasty = orderDetailHtml({
      ...order,
      items: [{ title: '<img src=x onerror=alert(1)>', quantity: 1, line_total: '1.00' }],
      tracking: { carrier: '"><script>bad()</script>', number: 'X', url: null },
    });
    expect(nasty).not.toContain('<img src=x');
    expect(nasty).not.toContain('<script>bad()');
  });

  it('survives an order with no items and no tracking at all', () => {
    const bare = orderDetailHtml({ id: '7', number: '#7', status: 'placed', currency: 'INR' });
    expect(bare).toContain('#7');
    expect(bare).toContain('Order placed');
  });
});

// --- tracking ---------------------------------------------------------------

describe('normalizeOrder', () => {
  it('reads the field names Odoo actually sends', () => {
    // As captured from Odoo's order endpoint on 6 Oct (docs/odoo-order-api-test-log.md).
    const odoo = normalizeOrder({
      id: 7, number: '#1017', customer_status: 'packed',
      awb_no: '53038567223', courier: 'ST Courier', tracking_url: null,
      last_status: 'Booked', last_status_at: '2026-10-07T10:00:00Z', delivered_at: null, events: [],
    });
    expect(odoo.status).toBe('packed');
    expect(odoo.tracking).toEqual({ carrier: 'ST Courier', number: '53038567223', url: null });
    expect(odoo.lastStatus).toBe('Booked');
    expect(odoo.lastStatusAt).toBe('2026-10-07T10:00:00Z');
    expect(odoo.deliveredAt).toBeNull();
  });

  it('reads the shape we asked for, and is safe to apply twice', () => {
    const once = normalizeOrder(order);
    expect(once.status).toBe('out_for_delivery');
    expect(once.tracking.number).toBe('TN123456789');
    expect(normalizeOrder(once)).toEqual(once);
  });

  it('puts the newest courier update first and drops empty ones', () => {
    const { events } = normalizeOrder({
      ...order,
      events: [
        { at: '2026-09-29T12:30:00Z', status: 'Booked' },
        { at: '2026-09-30T09:27:00Z', status: 'Out for delivery' },
        {},
        { at: '2026-09-30T04:10:00Z', status: 'In transit' },
      ],
    });
    expect(events.map((e) => e.status)).toEqual(['Out for delivery', 'In transit', 'Booked']);
  });

  it('has no tracking until there is a number', () => {
    expect(normalizeOrder({ id: 1, status: 'placed' }).tracking).toBeNull();
  });
});

describe('courier statuses', () => {
  it('names a failed delivery attempt and a return in words', () => {
    expect(orderStatusLabel('delivery_attempted')).toBe('Delivery attempted');
    expect(orderStatusLabel('rto')).toBe('Returning to us');
    expect(statusTone('delivery_attempted')).toBe('alert');
    expect(statusTone('rto')).toBe('stop');
  });

  it('shows a failed attempt where the parcel is, not back at the start', () => {
    const steps = trackingSteps({ status: 'delivery_attempted' });
    const current = steps.find((s) => s.state === 'current');
    expect(current.label).toBe('Delivery attempted');
    expect(steps.at(-1).state).toBe('todo');
  });

  it('shows a parcel on its way back as such', () => {
    expect(trackingSteps({ status: 'rto' }).map((s) => s.key)).toEqual(['placed', 'shipped', 'rto']);
  });
});

describe('times', () => {
  const now = Date.parse('2026-10-08T10:00:00Z');

  it('says how fresh an update is in words while it is recent', () => {
    expect(relativeTime('2026-10-08T09:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-10-08T09:55:00Z', now)).toBe('5 minutes ago');
    expect(relativeTime('2026-10-08T09:00:00Z', now)).toBe('1 hour ago');
    expect(relativeTime('2026-10-08T07:00:00Z', now)).toBe('3 hours ago');
  });

  it('gives the date and time once it is older than a day', () => {
    expect(relativeTime('2026-10-06T09:00:00Z', now, 'Asia/Kolkata')).toBe('6 Oct, 2:30 pm');
  });

  it('writes an update time the way people say it', () => {
    expect(formatEventTime('2026-09-30T09:27:00Z', 'Asia/Kolkata')).toBe('30 Sep, 2:57 pm');
    expect(formatEventTime('2026-09-30T18:40:00Z', 'Asia/Kolkata')).toBe('1 Oct, 12:10 am');
    expect(formatEventTime('nonsense')).toBe('');
  });
});

describe('tracking on the order screen', () => {
  const now = Date.parse('2026-10-08T10:00:00Z');
  const booked = {
    id: '1017', number: '#1017', placed_at: '2026-10-07T08:00:00Z', total: '1.00', currency: 'INR',
    customer_status: 'shipped', awb_no: '53038567223', courier: 'ST Courier', tracking_url: null,
    last_status_at: '2026-10-08T09:00:00Z', items: [],
  };

  it('offers to copy the AWB and follow it on ST Courier', () => {
    const html = orderDetailHtml(booked, now);
    expect(html).toContain('data-copy="53038567223"');
    expect(html).toContain('data-track-awb="53038567223"');
    expect(html).toContain('Track on ST Courier');
  });

  it('uses the courier link itself when Odoo sends one', () => {
    const html = orderDetailHtml({ ...booked, tracking_url: 'https://track.example/530' }, now);
    expect(html).toContain('href="https://track.example/530"');
    expect(html).not.toContain('data-track-awb');
  });

  it('says when the status last changed, and can be refreshed', () => {
    const html = orderDetailHtml(booked, now);
    expect(html).toContain('Updated 1 hour ago');
    expect(html).toContain('data-action="refresh-order"');
  });

  it('says when it was delivered', () => {
    const html = orderDetailHtml({ ...booked, customer_status: 'delivered', delivered_at: '2026-10-08T06:00:00Z' }, now);
    expect(html).toMatch(/Delivered on 8 Oct/);
  });

  it('explains the empty history instead of drawing an empty box', () => {
    const html = orderDetailHtml(booked, now);
    expect(html).toContain('scm-track__empty');
    expect(html).not.toContain('scm-track__events');
  });

  it('marks the newest courier update', () => {
    const html = orderDetailHtml({ ...booked, events: [
      { at: '2026-10-07T12:00:00Z', status: 'Booked', location: 'Chennai' },
      { at: '2026-10-08T05:00:00Z', status: 'In transit', location: 'Krishnagiri hub' },
    ] }, now);
    expect(html.indexOf('In transit')).toBeLessThan(html.indexOf('Booked'));
    expect(html).toMatch(/scm-track__event--latest[^]*In transit/);
  });

  it('escapes the AWB everywhere it is used', () => {
    const html = orderDetailHtml({ ...booked, awb_no: '"><img src=x>' }, now);
    expect(html).not.toContain('<img src=x>');
  });
});
