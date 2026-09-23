// The client's navigation taxonomy: every collection, and the menu built from it.
//
// One file so the collections and the menu can never drift apart -- build-collections.mjs
// creates COLLECTIONS from here, build-menu.mjs builds MENU from here, and a handle
// that exists in one but not the other fails loudly instead of rendering an empty
// dropdown.
//
// This is the NEW taxonomy, from the client's handwritten navigation sheet. It sits
// alongside the older saree-weave taxonomy in catalog.mjs, which is untouched: those
// collections stay live (templates/index.json hardcodes 13 of their handles) but no
// longer appear in the main menu.
//
// HANDLES ARE NAMESPACED BY SECTION, and that is load-bearing. "Banarasi", "Soft Silk",
// "Organza", "Cotton" and "Synthetic" each appear under BOTH Saree Collections and
// Salwar Material on the client's sheet, and `banarasi`/`soft-silk`/`organza` are
// already taken by the old weave collections. `saree-banarasi` and `salwar-banarasi`
// are therefore different collections with different tags. Collapse them and one
// product lands in two menus at once.
//
// A collection's HANDLE is also its TAG. To put a product in a collection, tag it with
// that collection's handle -- see taxonomy-tags.md.

// --- rule helpers ----------------------------------------------------------------
// appliedDisjunctively:false means AND across rules, matching seed.mjs:36. There is no
// OR anywhere in this repo.
export const byTag = (tag) => [{ column: 'TAG', relation: 'EQUALS', condition: tag }];

// IS_PRICE_REDUCED is true whenever a variant has a compare-at price above its price.
// It means the Offer Sale collections need no "sale" tag for staff to remember: a
// product joins the moment a compare-at price is set, and leaves when it is cleared.
export const onSale = { column: 'IS_PRICE_REDUCED', relation: 'IS_SET', condition: '' };

// --- the four garment types ------------------------------------------------------
// Parents of the four big dropdowns, so tapping the parent shows everything of that
// type rather than the whole store. `sarees` matches the `saree` tag every existing
// product already carries, so it is populated from day one.
export const TYPES = [
  { h: 'sarees',          title: 'Sarees',          tag: 'saree' },
  { h: 'salwar-material', title: 'Salwar Material', tag: 'salwar-material' },
  { h: 'salwar-suit',     title: 'Salwar Suit',     tag: 'salwar-suit' },
  { h: 'kurti',           title: 'Kurti',           tag: 'kurti' },
];

// --- Saree Collections -----------------------------------------------------------
// Sheet order. `menu` is the label shown in the dropdown where it differs from the
// collection's own title -- the collection page says "Cotton Sarees", the dropdown
// under "Saree Collections" only needs "Cotton".
export const SAREES = [
  { h: 'saree-cotton',          title: 'Cotton Sarees',     menu: 'Cotton' },
  { h: 'saree-linen',           title: 'Linen Sarees',      menu: 'Linen' },
  { h: 'saree-jute',            title: 'Jute Sarees',       menu: 'Jute' },
  { h: 'saree-banarasi',        title: 'Banarasi Sarees',   menu: 'Banarasi' },
  { h: 'saree-semi-tussar',     title: 'Semi Tussar Sarees',    menu: 'Semi Tussar' },
  { h: 'saree-calcutta-tussar', title: 'Calcutta Tussar Sarees', menu: 'Calcutta Tussar' },
  { h: 'saree-baswada',         title: 'Baswada Sarees',    menu: 'Baswada' },
  { h: 'saree-gulabi-dori',     title: 'Gulabi Dori Sarees', menu: 'Gulabi Dori' },
  { h: 'saree-raw-silk',        title: 'Raw Silk Sarees',   menu: 'Raw Silk' },
  { h: 'saree-soft-silk',       title: 'Soft Silk Sarees',  menu: 'Soft Silk' },
  { h: 'saree-art-silk',        title: 'Art Silk Sarees',   menu: 'Art Silk' },
  // PENDING: item 12 on the client's sheet reads "Va_lainar pattu" with a letter
  // struck through and could not be read with confidence. Add it here once the
  // client confirms the spelling -- one line, then re-run build-collections.mjs and
  // the menu scripts.
  { h: 'saree-dola-silk',       title: 'Dola Silk Sarees',  menu: 'Dola Silk' },
  { h: 'saree-tissue',          title: 'Tissue Sarees',     menu: 'Tissue' },
  { h: 'saree-synthetic',       title: 'Synthetic Sarees',  menu: 'Synthetic' },
];

// --- Salwar Material -------------------------------------------------------------
// The sheet's struck-out "Cotton Li" is deliberately omitted.
export const SALWAR_MATERIAL = [
  { h: 'salwar-cotton',       title: 'Cotton Salwar Material',       menu: 'Cotton' },
  { h: 'salwar-linen-cotton', title: 'Linen Cotton Salwar Material', menu: 'Linen Cotton' },
  { h: 'salwar-organza',      title: 'Organza Salwar Material',      menu: 'Organza' },
  { h: 'salwar-banarasi',     title: 'Banarasi Salwar Material',     menu: 'Banarasi' },
  { h: 'salwar-silk',         title: 'Silk Salwar Material',         menu: 'Silk' },
  { h: 'salwar-soft-silk',    title: 'Soft Silk Salwar Material',    menu: 'Soft Silk' },
  { h: 'salwar-synthetic',    title: 'Synthetic Salwar Material',    menu: 'Synthetic' },
];

export const SALWAR_SUITS = [
  { h: 'salwar-suit-2-piece', title: '2 Pcs Salwar Suit', menu: '2 Pcs Set' },
  { h: 'salwar-suit-3-piece', title: '3 Pcs Salwar Suit', menu: '3 Pcs Set' },
];

export const KURTIS = [
  { h: 'kurti-straight-cut', title: 'Straight Cut Kurti', menu: 'Straight Cut' },
  { h: 'kurti-umbrella',     title: 'Umbrella Kurti',     menu: 'Umbrella' },
];

// --- Occasions -------------------------------------------------------------------
// Wedding and Festive REUSE the existing `wedding` and `festive` collections rather
// than making near-duplicates; only the dropdown label differs ("Festive Wear"), and
// a menu label does not touch the collection. `office-wear` is the one new occasion.
export const OCCASIONS = [
  { h: 'wedding',     title: 'Wedding',     menu: 'Wedding',      existing: true },
  { h: 'office-wear', title: 'Office Wear', menu: 'Office Wear' },
  { h: 'festive',     title: 'Festive',     menu: 'Festive Wear', existing: true },
];

// --- Offer Sale ------------------------------------------------------------------
// Each is "on sale" AND a garment type. No tagging required -- see onSale above.
export const SALE = [
  { h: 'sale-sarees',          title: 'Sarees on Offer',          menu: 'Sarees',          tag: 'saree' },
  { h: 'sale-salwar-material', title: 'Salwar Material on Offer', menu: 'Salwar Material', tag: 'salwar-material' },
  { h: 'sale-2-piece',         title: '2 Pcs Sets on Offer',      menu: '2 Pcs Set',       tag: 'salwar-suit-2-piece' },
  { h: 'sale-3-piece',         title: '3 Pcs Sets on Offer',      menu: '3 Pcs Set',       tag: 'salwar-suit-3-piece' },
  { h: 'sale-kurti',           title: 'Kurtis on Offer',          menu: 'Kurti',           tag: 'kurti' },
];

// --- Price bands, INR ------------------------------------------------------------
// The lower edge is offset by 0.01 rather than sitting exactly on the boundary. The
// old bands in catalog.mjs use strict GREATER_THAN/LESS_THAN against shared round
// numbers, so a product priced at exactly 5000 matches NEITHER adjacent band and
// disappears from price navigation entirely. These bands leave no such gap.
export const PRICE_BANDS = [
  { h: 'price-300-599',    title: '₹300 – ₹599',    menu: '₹300 – ₹599',    min: '299.99',  max: '600' },
  { h: 'price-600-999',    title: '₹600 – ₹999',    menu: '₹600 – ₹999',    min: '599.99',  max: '1000' },
  { h: 'price-1000-1499',  title: '₹1,000 – ₹1,499', menu: '₹1,000 – ₹1,499', min: '999.99',  max: '1500' },
  { h: 'price-1500-1999',  title: '₹1,500 – ₹1,999', menu: '₹1,500 – ₹1,999', min: '1499.99', max: '2000' },
  { h: 'price-2000-above', title: '₹2,000 & above', menu: '₹2,000 & above', min: '1999.99' },
];

// --- every collection this taxonomy owns -----------------------------------------
// { h, title, rules } -- entries marked `existing` are skipped, since they are older
// collections we only borrow for the menu.
export function collections() {
  const out = [];
  const price = (b) => {
    const r = [];
    if (b.min) r.push({ column: 'VARIANT_PRICE', relation: 'GREATER_THAN', condition: b.min });
    if (b.max) r.push({ column: 'VARIANT_PRICE', relation: 'LESS_THAN', condition: b.max });
    return r;
  };

  for (const t of TYPES) out.push({ h: t.h, title: t.title, rules: byTag(t.tag) });
  for (const c of [...SAREES, ...SALWAR_MATERIAL, ...SALWAR_SUITS, ...KURTIS]) {
    out.push({ h: c.h, title: c.title, rules: byTag(c.h) });
  }
  for (const o of OCCASIONS) {
    if (!o.existing) out.push({ h: o.h, title: o.title, rules: byTag(o.h) });
  }
  out.push({ h: 'offer-sale', title: 'Offer Sale', rules: [onSale] });
  for (const s of SALE) out.push({ h: s.h, title: s.title, rules: [onSale, ...byTag(s.tag)] });
  for (const b of PRICE_BANDS) out.push({ h: b.h, title: b.title, rules: price(b) });
  return out;
}

// --- the main menu ---------------------------------------------------------------
// Order follows the client's sheet, left to right. `col` entries become COLLECTION-type
// menu items; `url` entries stay HTTP. build-menu.mjs resolves handles to resourceIds.
export const MAIN_MENU = [
  { title: 'New Arrivals', url: '/collections/all?sort_by=created-descending' },
  { title: 'Occasions', url: '/collections/all',
    children: OCCASIONS.map((o) => ({ col: o.h, title: o.menu })) },
  { title: 'Saree Collections', col: 'sarees',
    children: SAREES.map((c) => ({ col: c.h, title: c.menu })) },
  { title: 'Salwar Material', col: 'salwar-material',
    children: SALWAR_MATERIAL.map((c) => ({ col: c.h, title: c.menu })) },
  { title: 'Salwar Suit', col: 'salwar-suit',
    children: SALWAR_SUITS.map((c) => ({ col: c.h, title: c.menu })) },
  { title: 'Kurti', col: 'kurti',
    children: KURTIS.map((c) => ({ col: c.h, title: c.menu })) },
  { title: 'Offer Sale', col: 'offer-sale',
    children: SALE.map((c) => ({ col: c.h, title: c.menu })) },
  { title: 'Price Range', url: '/collections/all',
    children: PRICE_BANDS.map((b) => ({ col: b.h, title: b.menu })) },
  // Track123 app proxy, same target the footer Help menu uses.
  { title: 'Track Order', url: '/apps/track123' },
];
