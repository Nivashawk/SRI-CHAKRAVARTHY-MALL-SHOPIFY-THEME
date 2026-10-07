import { describe, it, expect } from 'vitest';
import { accountShellHtml, formatPhone } from '../assets/account.js';

// The frame every signed-in screen sits in: who you are, where you are, and
// the way out. The tab marking is tested directly because it once shipped
// with a class name the stylesheet never matched, so no tab ever looked chosen.

const profile = { name: 'Nivas S', phone: '+918825464712' };

describe('accountShellHtml', () => {
  it('marks the current tab, and only that one', () => {
    const html = accountShellHtml('orders', profile, '');
    const orders = html.match(/<button[^>]*data-tab="orders"[^>]*>/)[0];
    const prof = html.match(/<button[^>]*data-tab="profile"[^>]*>/)[0];
    expect(orders).toContain('scm-tab--current');
    expect(orders).toContain('aria-current="page"');
    expect(prof).not.toContain('scm-tab--current');
    expect(prof).not.toContain('aria-current');
  });

  it('greets the customer by first name', () => {
    expect(accountShellHtml('profile', profile, '')).toContain('Hello, Nivas');
  });

  it('does not greet a customer by their phone number', () => {
    const html = accountShellHtml('profile', { name: '+918825464712', phone: '+918825464712' }, '');
    expect(html).not.toContain('Hello, +91');
    expect(html).toContain('Your account');
  });

  it('puts the screen inside the main column', () => {
    expect(accountShellHtml('profile', profile, '<p id="x">hi</p>'))
      .toMatch(/class="scm-main"[^>]*>\s*<p id="x">hi<\/p>/);
  });

  it('always offers a way to sign out', () => {
    expect(accountShellHtml('orders', profile, '')).toContain('data-action="signout"');
  });

  it('escapes the name', () => {
    const html = accountShellHtml('profile', { name: '<b>x</b>', phone: '' }, '');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('formatPhone', () => {
  it('spaces an Indian mobile the way it is read aloud', () => {
    expect(formatPhone('+918825464712')).toBe('+91 88254 64712');
  });

  it('leaves anything else as it came', () => {
    expect(formatPhone('+14155550100')).toBe('+14155550100');
    expect(formatPhone(undefined)).toBe('');
  });
});
