// Rebuilds the store's main menu with category dropdowns.
//
// Children are COLLECTION-type items carrying the collection's resourceId, not
// HTTP links. snippets/mega-menu-list.liquid reads link.object.handle to find
// the dropdown thumbnail; an HTTP link has no .object, so the menu would render
// text-only with no error to tell you why.
import { readFileSync, writeFileSync } from 'node:fs';

const gids = JSON.parse(readFileSync('/tmp/gidmap.json', 'utf8'));
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

writeFileSync('/tmp/menuvars.json', JSON.stringify({
  id: 'gid://shopify/Menu/268235604216',
  title: 'Main menu',
  handle: 'main-menu',
  items,
}, null, 1));
console.log('menu items:', items.length,
  '| children:', items.reduce((n, i) => n + (i.items?.length ?? 0), 0));
