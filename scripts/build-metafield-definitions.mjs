// Creates the product metafield definitions the theme reads:
//   - the eight `specs.*` fields behind the spec table
//   - `detail.regions`, the close-up regions behind the detail explorer
// Definitions are store configuration, not theme code, so they do not travel
// with `theme push` -- a fresh store renders an empty spec table (and no detail
// explorer) until this has run.
//
//   node scripts/build-metafield-definitions.mjs
//
// Idempotent: an existing definition is left alone, never recreated. Order here
// is the pinned order in Admin, which is also the order the spec block renders rows.
import { gql } from './shopify-api.mjs';

const spec = (key, name) => ({
  namespace: 'specs', key, name,
  type: 'single_line_text_field',
  // Pinned so the client edits them as ordinary fields on the product page
  // rather than hunting through "Show all" every time.
  pin: true,
});

// Label text matches README's spec table so Admin and the storefront agree.
const DEFS = [
  spec('colour',   'Colour'),
  spec('weave',    'Weave'),
  spec('occasion', 'Occasion'),
  spec('blouse',   'Blouse piece'),
  spec('length',   'Saree length'),
  spec('zari',     'Zari'),
  spec('weight',   'Weight'),
  spec('care',     'Care'),
  {
    namespace: 'detail', key: 'regions', name: 'Detail explorer regions',
    type: 'json',
    description: 'Close-up regions cropped from the main photo. Written by ' +
      'scripts/build-detail-regions.mjs; do not hand-edit.',
    // Unpinned: raw JSON coordinates are not something the client should trip
    // over on every product, and they are generated, not typed.
    pin: false,
  },
];

const namespaces = [...new Set(DEFS.map((d) => d.namespace))];
const existing = new Set();
for (const namespace of namespaces) {
  const d = await gql(`
    query($namespace: String!) {
      metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: $namespace) {
        nodes { key }
      }
    }`, { namespace });
  for (const n of d.metafieldDefinitions.nodes) existing.add(`${namespace}.${n.key}`);
}

let created = 0;
for (const { namespace, key, name, type, description, pin } of DEFS) {
  const id = `${namespace}.${key}`;
  if (existing.has(id)) { console.log(`  = ${id} (exists)`); continue; }
  await gql(`
    mutation($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id key }
        userErrors { field message }
      }
    }`, {
    definition: { name, namespace, key, ownerType: 'PRODUCT', type, pin, ...(description && { description }) },
  });
  console.log(`  + ${id}`);
  created++;
}

console.log(`${DEFS.length} definitions: ${created} created, ${DEFS.length - created} already present`);
console.log('Values are separate steps:');
console.log('  node scripts/build-product-specs.mjs <outdir>');
console.log('  node scripts/build-detail-regions.mjs <outdir>');
