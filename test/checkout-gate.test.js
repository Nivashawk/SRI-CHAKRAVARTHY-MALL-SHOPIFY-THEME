import { describe, it, expect } from 'vitest';
import { isSignedIn, checkoutAction, checkoutAttributes } from '../assets/account.js';

// Checkout cannot ask for our sign-in, so the theme asks before the shopper
// leaves for it. Getting "signed in" wrong in one direction lets anonymous
// orders through; in the other it nags someone who signed in an hour ago.

const now = Date.parse('2026-10-08T10:00:00Z');
const profile = { partner_id: 41, name: 'Nivas S', phone: '+918825464712' };

describe('isSignedIn', () => {
  it('is false with no session', () => {
    expect(isSignedIn(null, now)).toBe(false);
  });

  it('is true while the access token is good', () => {
    expect(isSignedIn({ accessToken: 'a', expiresAt: now + 60_000, profile }, now)).toBe(true);
  });

  it('stays true after the access token lapses, while a refresh token is held', () => {
    // Odoo's access tokens are assumed short-lived; the 60-day refresh token
    // is what decides whether someone is still signed in.
    expect(isSignedIn({ accessToken: 'a', refreshToken: 'r', expiresAt: now - 1, profile }, now)).toBe(true);
  });

  it('is false once the access token lapses with nothing to renew it', () => {
    expect(isSignedIn({ accessToken: 'a', expiresAt: now - 1, profile }, now)).toBe(false);
  });
});

describe('checkoutAction', () => {
  it('asks a signed-out shopper to sign in', () => {
    expect(checkoutAction(null, now)).toBe('signin');
  });

  it('lets a signed-in shopper straight through', () => {
    expect(checkoutAction({ refreshToken: 'r', expiresAt: now - 1, profile }, now)).toBe('proceed');
  });
});

describe('checkoutAttributes', () => {
  it('ties the cart to the Odoo customer', () => {
    expect(checkoutAttributes({ profile })).toEqual({
      odoo_partner_id: '41',
      customer_phone: '+918825464712',
    });
  });

  it('leaves out what it does not know rather than sending blanks', () => {
    expect(checkoutAttributes({ profile: { phone: '+918825464712' } })).toEqual({
      customer_phone: '+918825464712',
    });
    expect(checkoutAttributes(null)).toEqual({});
  });
});
