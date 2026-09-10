// Creates the eight `specs.*` product metafield definitions the spec table
// reads. Definitions are store configuration, not theme code, so they do not
// travel with `theme push` -- a fresh store renders an empty spec table until
// this has run.
//
//   node scripts/build-metafield-definitions.mjs
//
// Idempotent: an existing definition is left alone, never recreated. Order here
// is the pinned order in Admin, which is also the order the block renders rows.
import { gql } from './shopify-api.mjs';

// Label text matches README's spec table so Admin and the storefront agree.
const DEFS = [
  { key: 'colour',   name: 'Colour' },
  { key: 'weave',    name: 'Weave' },
  { key: 'occasion', name: 'Occasion' },
  { key: 'blouse',   name: 'Blouse piece' },
  { key: 'length',   name: 'Saree length' },
  { key: 'zari',     name: 'Zari' },
  { key: 'weight',   name: 'Weight' },
  { key: 'care',     name: 'Care' },
];

const existing = new Set();
{
  const d = await gql(`
    query {
      metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "specs") {
        nodes { key name pinnedPosition }
      }
    }`);
  for (const n of d.metafieldDefinitions.nodes) existing.add(n.key);
}

let created = 0;
for (const { key, name } of DEFS) {
  if (existing.has(key)) { console.log(`  = specs.${key} (exists)`); continue; }
  await gql(`
    mutation($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id key }
        userErrors { field message }
      }
    }`, {
    definition: {
      name, namespace: 'specs', key,
      ownerType: 'PRODUCT',
      type: 'single_line_text_field',
      // Pinned so the client edits them as ordinary fields on the product page
      // rather than hunting through "Show all" every time.
      pin: true,
    },
  });
  console.log(`  + specs.${key}`);
  created++;
}

console.log(`${DEFS.length} definitions: ${created} created, ${DEFS.length - created} already present`);
console.log('Values are a separate step: node scripts/build-product-specs.mjs <outdir>');
