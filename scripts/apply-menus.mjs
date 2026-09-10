// Applies the menu variable files emitted by build-menu.mjs and
// build-footer-menus.mjs.
//
//   node scripts/build-gidmap.mjs       /tmp
//   node scripts/build-footer-menus.mjs /tmp
//   node scripts/build-menu.mjs         /tmp
//   node scripts/apply-menus.mjs        /tmp
//
// The README used to say "apply each emitted file with menuCreate" without
// saying how, so this was a hand-run mutation. Menus are the one piece of the
// storefront that fails silently when missing -- a footer column with no menu
// renders as a heading with nothing under it, and no error anywhere says why.
import { readFileSync, readdirSync } from 'node:fs';
import { gql } from './shopify-api.mjs';

const OUT = process.argv[2] ?? '/tmp';

// The Admin API's `menus(query: "handle:x")` filter is SILENTLY IGNORED -- it
// returns every menu on the store regardless. Taking nodes[0] therefore hands
// back an unrelated menu, and updating that renames a default menu instead of
// creating the one you asked for. Filter exactly, in JS.
async function findMenu(handle) {
  const d = await gql(`query { menus(first: 50) { nodes { id handle } } }`);
  return d.menus.nodes.find((n) => n.handle === handle)?.id ?? null;
}

// Update in place when the handle already exists. Recreating would mint a new
// menu and leave the old one orphaned, and section groups bind to the handle.
async function apply(file) {
  const m = JSON.parse(readFileSync(`${OUT}/${file}`, 'utf8'));
  const id = m.id ?? await findMenu(m.handle);
  const count = m.items.reduce((n, i) => n + 1 + (i.items?.length ?? 0), 0);

  if (id) {
    await gql(`
      mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
        menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
          menu { id handle } userErrors { field message }
        }
      }`, { id, title: m.title, handle: m.handle, items: m.items });
    console.log(`  ~ ${m.handle} updated (${count} items)`);
  } else {
    await gql(`
      mutation($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) {
          menu { id handle } userErrors { field message }
        }
      }`, { title: m.title, handle: m.handle, items: m.items });
    console.log(`  + ${m.handle} created (${count} items)`);
  }
}

const files = readdirSync(OUT)
  .filter((f) => f === 'menuvars.json' || /^menu_.*\.json$/.test(f));
if (!files.length) {
  console.error(`No menu files in ${OUT}. Run build-footer-menus.mjs and build-menu.mjs first.`);
  process.exit(1);
}
for (const f of files) await apply(f);
console.log(`${files.length} menus applied`);
