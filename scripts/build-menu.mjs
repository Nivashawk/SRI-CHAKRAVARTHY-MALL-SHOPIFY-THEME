// Rebuilds the store's main menu with category dropdowns.
//
// Children are COLLECTION-type items carrying the collection's resourceId, not
// HTTP links. snippets/mega-menu-list.liquid reads link.object.handle to find
// the dropdown thumbnail; an HTTP link has no .object, so the menu would render
// text-only with no error to tell you why.
import { readFileSync, writeFileSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const OUT = process.argv[2] ?? '/tmp';
const gids = JSON.parse(readFileSync(`${OUT}/gidmap.json`, 'utf8'));

// The menu id is per-store, so it is resolved by handle at run time. It used to
// be a hardcoded gid for the development store, which meant this script either
// failed or -- worse -- wrote into a shop nobody intended once pointed elsewhere.
// `menus(query: "handle:x")` is silently ignored by the Admin API and returns
// every menu, so nodes[0] is whichever menu happens to come first. Match exactly.
const MENU_HANDLE = 'main-menu';
const found = await gql(`query { menus(first: 50) { nodes { id handle title } } }`);
const menu = found.menus.nodes.find((n) => n.handle === MENU_HANDLE);
if (!menu) throw new Error(`menu not found: ${MENU_HANDLE}`);
const col = (handle, title) => {
  const c = gids[handle];
  if (!c) throw new Error(`collection not found: ${handle}`);
  return { title: title ?? c.title, type: 'COLLECTION', resourceId: c.id };
};

const items = [
  { title: 'Collections', type: 'HTTP', url: '/collections/all', items: [
      col('kanchipuram'), col('banarasi'), col('soft-silk'), col('chanderi'),
      col('tussar'), col('organza'), col('ikat'), col('gadwal'),
      col('silk-cotton'), col('georgette'),
  ]},
  { title: 'Occasions', type: 'HTTP', url: '/collections/all', items: [
      col('wedding'), col('festive'), col('everyday'),
  ]},
  { title: 'Shop by Price', type: 'HTTP', url: '/collections/all', items: [
      col('under-5000', 'Under ₹5,000'),
      col('5000-10000', '₹5,000 – ₹10,000'),
      col('10000-25000', '₹10,000 – ₹25,000'),
      col('above-25000', 'Above ₹25,000'),
  ]},
  // Every product was created the same day, so this is not yet a real
  // distinction — but the sort keeps it correct as the catalogue grows.
  { title: 'New Arrivals', type: 'HTTP', url: '/collections/all?sort_by=created-descending' },
];

writeFileSync(`${OUT}/menuvars.json`, JSON.stringify({
  id: menu.id,
  title: menu.title,
  handle: MENU_HANDLE,
  items,
}, null, 1));
console.log('menu items:', items.length,
  '| children:', items.reduce((n, i) => n + (i.items?.length ?? 0), 0));
