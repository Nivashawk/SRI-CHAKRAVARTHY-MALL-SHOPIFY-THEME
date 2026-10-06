import { describe, it, expect } from 'vitest';
import { findOrder, trackingSteps, orderDetailHtml } from '../assets/account.js';

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
    expect(withEvents).toContain('30 Sep 2026');
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
