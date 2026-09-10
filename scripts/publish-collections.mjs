// Publishes every collection to the Online Store sales channel.
//
//   node scripts/publish-collections.mjs
//
// collectionCreate does NOT publish, and an unpublished collection is invisible
// to Liquid: `block.settings.collection` resolves to nil, so a collection-card
// renders Horizon's "Collection title" placeholder over a placeholder image with
// no error anywhere saying why. Products imported by CSV are published
// automatically, which makes the failure look like a theme bug rather than a
// publishing one.
//
// Idempotent: publishing an already-published resource is a no-op.
import { gql } from './shopify-api.mjs';

const pubs = await gql(`query { publications(first: 20) { nodes { id name } } }`);
const online = pubs.publications.nodes.find((p) => p.name === 'Online Store');
if (!online) throw new Error('No "Online Store" publication on this store');

const all = [];
let cursor = null;
for (;;) {
  const d = await gql(`
    query($after: String) {
      collections(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id handle resourcePublicationsCount { count } }
      }
    }`, { after: cursor });
  all.push(...d.collections.nodes);
  if (!d.collections.pageInfo.hasNextPage) break;
  cursor = d.collections.pageInfo.endCursor;
}

let done = 0;
for (const c of all) {
  if (c.resourcePublicationsCount.count > 0) {
    console.log(`  = ${c.handle} (already published)`);
    continue;
  }
  await gql(`
    mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable { availablePublicationsCount { count } }
        userErrors { field message }
      }
    }`, { id: c.id, input: [{ publicationId: online.id }] });
  console.log(`  + ${c.handle}`);
  done++;
}
console.log(`${all.length} collections: ${done} published, ${all.length - done} already were`);
