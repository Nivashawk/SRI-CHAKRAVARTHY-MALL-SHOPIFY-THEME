import { describe, it, expect } from 'vitest';
import {
  classifyIdentifier,
  normalizeIndianMobile,
  sessionState,
  errorMessage,
  maskPhone,
  isMockMode,
  sessionFromTokens,
  displayName,
} from '../assets/account.js';

// The account area runs entirely in the browser and talks straight to Odoo.
// These are its decisions that do not involve the DOM or the network, and each
// of them is one a customer feels directly: whether their number is accepted,
// whether they stay signed in, and what they are told when something fails.

describe('classifyIdentifier — one box takes a phone or an email', () => {
  it('reads a 10-digit mobile as a phone, in E.164', () => {
    expect(classifyIdentifier('9876543210')).toEqual({ kind: 'phone', value: '+919876543210' });
  });

  it('reads a number with +91, spaces or a leading zero as the same phone', () => {
    for (const typed of ['+91 98765 43210', '09876543210', '+919876543210', '91-9876543210']) {
      expect(classifyIdentifier(typed), typed).toEqual({ kind: 'phone', value: '+919876543210' });
    }
  });

  it('reads an address as an email, lower-cased and trimmed', () => {
    expect(classifyIdentifier('  Ravi@Example.COM ')).toEqual({
      kind: 'email',
      value: 'ravi@example.com',
    });
  });

  it('rejects a foreign number rather than sending a code abroad', () => {
    expect(classifyIdentifier('+14155552671').kind).toBe('invalid');
  });

  it('rejects something that is neither', () => {
    for (const bad of ['', '   ', 'ravi', '12345', 'ravi@', '@example.com', null, undefined]) {
      expect(classifyIdentifier(bad).kind, String(bad)).toBe('invalid');
    }
  });
});

describe('normalizeIndianMobile', () => {
  it('accepts every prefix India issues to mobiles', () => {
    for (const first of ['6', '7', '8', '9']) {
      expect(normalizeIndianMobile(`${first}876543210`)).toBe(`+91${first}876543210`);
    }
  });

  it('rejects prefixes India does not issue', () => {
    for (const first of ['0', '1', '2', '3', '4', '5']) {
      expect(normalizeIndianMobile(`${first}876543210`), first).toBeNull();
    }
  });

  it('rejects unicode digits instead of letting one number have two spellings', () => {
    expect(normalizeIndianMobile('९८७६५४३२१०')).toBeNull();
  });

  it('rejects the wrong number of digits', () => {
    expect(normalizeIndianMobile('987654321')).toBeNull();
    expect(normalizeIndianMobile('98765432101')).toBeNull();
  });
});

describe('sessionState — when to use, refresh or discard the token', () => {
  const NOW = 1790000000000; // milliseconds

  it('is valid well before expiry', () => {
    expect(sessionState({ expiresAt: NOW + 600_000 }, NOW)).toBe('valid');
  });

  it('asks for a refresh in the last minute, before the customer notices', () => {
    expect(sessionState({ expiresAt: NOW + 30_000 }, NOW)).toBe('refresh');
  });

  it('is expired once the moment passes', () => {
    expect(sessionState({ expiresAt: NOW - 1 }, NOW)).toBe('expired');
  });

  it('treats a missing or damaged session as expired rather than trusting it', () => {
    for (const bad of [null, undefined, {}, { expiresAt: 'soon' }, { expiresAt: NaN }]) {
      expect(sessionState(bad, NOW), JSON.stringify(bad)).toBe('expired');
    }
  });
});

describe('errorMessage — Odoo returns codes, customers need sentences', () => {
  it('explains the failures a customer can act on', () => {
    expect(errorMessage('invalid_code')).toMatch(/code/i);
    expect(errorMessage('code_expired')).toMatch(/expired|new code/i);
    expect(errorMessage('too_many_attempts')).toMatch(/too many|wait/i);
    expect(errorMessage('too_many_requests')).toMatch(/too many|wait/i);
  });

  it('never leaks an internal code to the customer', () => {
    for (const code of ['invalid_json', 'token_reuse_detected', 'kaboom', '', null]) {
      const text = errorMessage(code);
      expect(text, String(code)).not.toMatch(/[a-z]+_[a-z]+/);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('does not say whether an account exists', () => {
    // Telling a stranger "no account found" turns the sign-in box into a way to
    // discover who shops here.
    expect(errorMessage('no_account')).not.toMatch(/no account|not found|unregistered/i);
  });
});

describe('sessionFromTokens — turning Odoo’s reply into a session', () => {
  const NOW = 1790000000000;

  it('uses the lifetime Odoo gives', () => {
    const session = sessionFromTokens({ access_token: 'a', expires_in: 900 }, NOW);
    expect(session.expiresAt).toBe(NOW + 900_000);
  });

  it('does not expire the session instantly when Odoo sends expires_in: 0', () => {
    // Odoo's live reply carries `expires_in: 0`, and its token has no `exp`
    // claim at all. Taken literally that is "already expired", which would
    // bounce the customer back to the sign-in screen the moment they signed in.
    // Until they set a real lifetime, assume a short one and let refresh renew.
    const session = sessionFromTokens({ access_token: 'a', expires_in: 0 }, NOW);
    expect(session.expiresAt).toBeGreaterThan(NOW);
    expect(sessionState(session, NOW)).toBe('valid');
  });

  it('assumes a short lifetime when none is given at all', () => {
    for (const reply of [{}, { expires_in: null }, { expires_in: 'soon' }, { expires_in: -60 }]) {
      const session = sessionFromTokens(reply, NOW);
      expect(sessionState(session, NOW), JSON.stringify(reply)).toBe('valid');
    }
  });
});

describe('displayName — Odoo defaults a new customer’s name to their phone number', () => {
  it('has no name to show when the name is just the phone number', () => {
    expect(displayName({ name: '+918825464712', phone: '+918825464712' })).toBeNull();
  });

  it('ignores formatting differences between the two', () => {
    expect(displayName({ name: '8825464712', phone: '+918825464712' })).toBeNull();
  });

  it('returns a real name', () => {
    expect(displayName({ name: 'Ravi Kumar', phone: '+918825464712' })).toBe('Ravi Kumar');
  });

  it('copes with a blank or missing name', () => {
    expect(displayName({ name: '', phone: '+91882' })).toBeNull();
    expect(displayName({ phone: '+91882' })).toBeNull();
    expect(displayName(null)).toBeNull();
  });
});

describe('isMockMode — demo data must never be mistaken for the real thing', () => {
  it('is on only when the URL asks for it', () => {
    expect(isMockMode('?mock=1')).toBe(true);
    expect(isMockMode('?preview_theme_id=190822416669&mock=1')).toBe(true);
  });

  it('is off for a normal visit', () => {
    for (const search of ['', '?preview_theme_id=190822416669', '?mock=0', '?mock=true', '?mocked=1']) {
      expect(isMockMode(search), search).toBe(false);
    }
  });
});

describe('maskPhone — for showing the number a code went to', () => {
  it('shows only the last four digits', () => {
    expect(maskPhone('+919876543210')).toBe('••••••3210');
  });

  it('never returns the digits before those four', () => {
    expect(maskPhone('+919876543210')).not.toContain('9876');
  });

  it('copes with a missing number', () => {
    expect(maskPhone(null)).toBe('');
    expect(maskPhone('')).toBe('');
  });
});
