// Seeds the store with mock saree data.
//   node scripts/seed.mjs collections
//   node scripts/seed.mjs products
//   node scripts/seed.mjs images
//   node scripts/seed.mjs menu
//   node scripts/seed.mjs all
// Every step is idempotent: existing handles are reused, not duplicated.
import { readFileSync } from 'node:fs';
import { gql, apiVersion } from './shopify-api.mjs';
import { PRODUCTS, WEAVES, OCCASIONS, PRICE_BANDS } from './catalog.mjs';

const step = process.argv[2] ?? 'all';
const IMG = new URL('./mock-images/', import.meta.url).pathname;

/* ---------------------------------------------------------------- helpers */

async function findCollection(handle) {
  const d = await gql(`query($q:String!){ collections(first:1, query:$q){ nodes{ id handle } } }`,
    { q: `handle:${handle}` });
  return d.collections.nodes[0]?.id ?? null;
}

async function makeSmartCollection(handle, title, rules) {
  const existing = await findCollection(handle);
  if (existing) { console.log(`  = ${handle} (exists)`); return existing; }
  const d = await gql(`
    mutation($input:CollectionInput!){
      collectionCreate(input:$input){ collection{ id handle } userErrors{ field message } }
    }`, {
    input: {
      handle, title,
      ruleSet: { appliedDisjunctively: false, rules },
    },
  });
  console.log(`  + ${handle}`);
  return d.collectionCreate.collection.id;
}

async function findProduct(handle) {
  const d = await gql(`query($q:String!){ products(first:1, query:$q){ nodes{ id handle } } }`,
    { q: `handle:${handle}` });
  return d.products.nodes[0]?.id ?? null;
}

/* ------------------------------------------------------------ collections */

async function seedCollections() {
  console.log('Collections by weave:');
  for (const [tag, title] of Object.entries(WEAVES)) {
    await makeSmartCollection(tag, title,
      [{ column: 'TAG', relation: 'EQUALS', condition: tag }]);
  }
  console.log('Collections by occasion:');
  for (const [tag, title] of Object.entries(OCCASIONS)) {
    await makeSmartCollection(tag, title,
      [{ column: 'TAG', relation: 'EQUALS', condition: tag }]);
  }
  console.log('Collections by price band:');
  for (const b of PRICE_BANDS) {
    const rules = [];
    if (b.min) rules.push({ column: 'VARIANT_PRICE', relation: 'GREATER_THAN', condition: String(b.min) });
    if (b.max) rules.push({ column: 'VARIANT_PRICE', relation: 'LESS_THAN', condition: String(b.max) });
    await makeSmartCollection(b.h, b.title, rules);
  }
}

/* --------------------------------------------------------------- products */

async function seedProducts() {
  for (const p of PRODUCTS) {
    if (await findProduct(p.h)) { console.log(`  = ${p.h} (exists)`); continue; }
    const d = await gql(`
      mutation($product:ProductCreateInput!){
        productCreate(product:$product){ product{ id handle variants(first:1){ nodes{ id } } } userErrors{ field message } }
      }`, {
      product: {
        handle: p.h,
        title: p.t,
        vendor: 'Sri Chakravarthy',
        productType: 'Saree',
        status: 'ACTIVE',
        tags: ['saree', p.weave, p.occasion],
        descriptionHtml:
          `<p>A ${WEAVES[p.weave].toLowerCase()} saree, handwoven with a contrast zari border and pallu. ` +
          `Comes with an unstitched blouse piece.</p>` +
          `<p><em>Placeholder copy and imagery for layout review.</em></p>`,
      },
    });
    const prod = d.productCreate.product;
    const variantId = prod.variants.nodes[0].id;
    await gql(`
      mutation($productId:ID!, $variants:[ProductVariantsBulkInput!]!){
        productVariantsBulkUpdate(productId:$productId, variants:$variants){
          productVariants{ id price } userErrors{ field message }
        }
      }`, {
      productId: prod.id,
      variants: [{ id: variantId, price: String(p.price), inventoryPolicy: 'CONTINUE' }],
    });
    console.log(`  + ${p.h}  ₹${p.price.toLocaleString('en-IN')}`);
  }
}

/* ----------------------------------------------------------------- images */

async function uploadOne(filename) {
  const bytes = readFileSync(IMG + filename);
  const d = await gql(`
    mutation($input:[StagedUploadInput!]!){
      stagedUploadsCreate(input:$input){
        stagedTargets{ url resourceUrl parameters{ name value } }
        userErrors{ field message }
      }
    }`, {
    input: [{
      filename, mimeType: 'image/jpeg', httpMethod: 'POST', resource: 'IMAGE',
      fileSize: String(bytes.length),
    }],
  });
  const t = d.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const { name, value } of t.parameters) form.append(name, value);
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), filename);
  const up = await fetch(t.url, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`staged upload failed for ${filename}: ${up.status} ${await up.text()}`);
  return t.resourceUrl;
}

async function seedImages() {
  for (const p of PRODUCTS) {
    const id = await findProduct(p.h);
    if (!id) { console.log(`  ! ${p.h} missing — run the products step first`); continue; }
    const d0 = await gql(`query($id:ID!){ product(id:$id){ media(first:5){ nodes{ id } } } }`, { id });
    if (d0.product.media.nodes.length) { console.log(`  = ${p.h} (has media)`); continue; }
    const media = [];
    for (const n of ['1', '2']) {
      const resourceUrl = await uploadOne(`${p.h}-${n}.jpg`);
      media.push({ originalSource: resourceUrl, mediaContentType: 'IMAGE', alt: p.t });
    }
    await gql(`
      mutation($productId:ID!, $media:[CreateMediaInput!]!){
        productCreateMedia(productId:$productId, media:$media){
          media{ ... on MediaImage { id } } mediaUserErrors{ field message }
        }
      }`, { productId: id, media });
    console.log(`  + ${p.h} (2 images)`);
  }
}

/* ------------------------------------------------------------------- menu */

function menuItems() {
  const weaveItems = Object.entries(WEAVES).map(([h, title]) => ({
    title, type: 'COLLECTION', url: `/collections/${h}`,
  }));
  const occasionItems = Object.entries(OCCASIONS).map(([h, title]) => ({
    title, type: 'COLLECTION', url: `/collections/${h}`,
  }));
  const priceItems = PRICE_BANDS.map(b => ({
    title: b.title, type: 'COLLECTION', url: `/collections/${b.h}`,
  }));
  return [
    { title: 'New Arrivals', type: 'HTTP', url: '/collections/all' },
    { title: 'Shop by Weave', type: 'HTTP', url: '/collections/all', items: weaveItems },
    { title: 'Shop by Occasion', type: 'HTTP', url: '/collections/all', items: occasionItems },
    { title: 'Shop by Price', type: 'HTTP', url: '/collections/all', items: priceItems },
    { title: 'Our Story', type: 'HTTP', url: '/pages/about' },
  ];
}

async function seedMenu() {
  const handle = 'main-menu';
  const d = await gql(`query($h:String!){ menus(first:1, query:$h){ nodes{ id handle } } }`, { h: `handle:${handle}` });
  const existing = d.menus.nodes[0];
  const items = menuItems();
  if (existing) {
    await gql(`
      mutation($id:ID!, $title:String!, $handle:String!, $items:[MenuItemUpdateInput!]!){
        menuUpdate(id:$id, title:$title, handle:$handle, items:$items){ menu{ id } userErrors{ field message } }
      }`, { id: existing.id, title: 'Main menu', handle, items });
    console.log('  ~ main-menu updated');
  } else {
    await gql(`
      mutation($title:String!, $handle:String!, $items:[MenuItemCreateInput!]!){
        menuCreate(title:$title, handle:$handle, items:$items){ menu{ id } userErrors{ field message } }
      }`, { title: 'Main menu', handle, items });
    console.log('  + main-menu created');
  }
}

/* ------------------------------------------------------------------- main */

console.log(`Admin API version: ${await apiVersion()}`);
if (step === 'collections' || step === 'all') await seedCollections();
if (step === 'products'    || step === 'all') await seedProducts();
if (step === 'images'      || step === 'all') await seedImages();
if (step === 'menu'        || step === 'all') await seedMenu();
console.log('done.');
