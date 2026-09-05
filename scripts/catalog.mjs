// Mock saree catalogue shared by the image generator and the store seeder.
// Prices are in INR. Colours are [bodyLight, bodyDark, borderGold] used to
// render the placeholder swatches.

export const PRODUCTS = [
  { h:'peacock-blue-kanchipuram',  t:'Peacock Blue Pure Zari Kanchipuram Silk Saree', weave:'kanchipuram', occasion:'wedding',  price:28500, c:['1B5E7A','0C3040','C9A227'] },
  { h:'deep-maroon-kanchipuram',   t:'Deep Maroon Bridal Kanchipuram Silk Saree',     weave:'kanchipuram', occasion:'wedding',  price:46800, c:['7B1E3A','3D0F1D','D4AF37'] },
  { h:'midnight-kanchipuram',      t:'Midnight Blue Kanchipuram Bridal Silk Saree',   weave:'kanchipuram', occasion:'wedding',  price:52000, c:['22276B','101335','D4AF37'] },
  { h:'emerald-banarasi',          t:'Emerald Green Banarasi Katan Silk Saree',       weave:'banarasi',    occasion:'wedding',  price:18900, c:['14532D','082718','C9A227'] },
  { h:'ivory-banarasi-tissue',     t:'Ivory Gold Banarasi Tissue Saree',              weave:'banarasi',    occasion:'wedding',  price:22400, c:['E8DCC0','C4B48C','B8860B'] },
  { h:'mustard-mysore-crepe',      t:'Mustard Mysore Crepe Silk Saree',               weave:'mysore-crepe',occasion:'festive',  price:7450,  c:['B8860B','7A5A07','E8CE7A'] },
  { h:'rose-mysore-crepe',         t:'Rose Pink Mysore Crepe Silk Saree',             weave:'mysore-crepe',occasion:'festive',  price:6980,  c:['C4718C','7A3A50','D4AF37'] },
  { h:'indigo-soft-silk',          t:'Indigo Soft Silk Saree',                        weave:'soft-silk',   occasion:'festive',  price:9250,  c:['2A2A6B','131333','C9A227'] },
  { h:'teal-soft-silk',            t:'Teal Soft Silk Saree with Zari Border',         weave:'soft-silk',   occasion:'festive',  price:10400, c:['1F6F6B','0D3331','D4AF37'] },
  { h:'rust-tussar',               t:'Rust Tussar Silk Saree',                        weave:'tussar',      occasion:'everyday', price:8600,  c:['A0522D','5A2A16','C9A227'] },
  { h:'beige-tussar',              t:'Beige Tussar Silk Hand-Painted Saree',          weave:'tussar',      occasion:'everyday', price:12750, c:['C8B08A','8A7355','B8860B'] },
  { h:'blush-organza',             t:'Blush Organza Saree with Sequin Work',          weave:'organza',     occasion:'festive',  price:5480,  c:['E0B8BE','A8767F','D4AF37'] },
  { h:'powder-blue-organza',       t:'Powder Blue Organza Saree',                     weave:'organza',     occasion:'festive',  price:4980,  c:['A8C4DC','6A8AA6','C9A227'] },
  { h:'offwhite-chanderi',         t:'Off-White Chanderi Silk Cotton Saree',          weave:'chanderi',    occasion:'everyday', price:4250,  c:['EDE6D6','BFB39A','B8860B'] },
  { h:'sage-chanderi',             t:'Sage Chanderi Saree with Gold Buttas',          weave:'chanderi',    occasion:'everyday', price:4890,  c:['9CA88A','5F6B52','C9A227'] },
  { h:'magenta-silk-cotton',       t:'Magenta Silk Cotton Saree',                     weave:'silk-cotton', occasion:'everyday', price:3450,  c:['8E2A5F','4A1230','D4AF37'] },
  { h:'mustard-silk-cotton',       t:'Mustard Silk Cotton Handloom Saree',            weave:'silk-cotton', occasion:'everyday', price:3890,  c:['C08A1E','6E4A08','E8CE7A'] },
  { h:'wine-georgette',            t:'Wine Georgette Saree with Embroidery',          weave:'georgette',   occasion:'festive',  price:6250,  c:['6B1F3A','350F1D','C9A227'] },
  { h:'charcoal-pochampally',      t:'Charcoal Pochampally Ikat Silk Saree',          weave:'ikat',        occasion:'everyday', price:11800, c:['3A3A3A','1A1A1A','C9A227'] },
  { h:'ochre-gadwal',              t:'Ochre Gadwal Silk Saree',                       weave:'gadwal',      occasion:'festive',  price:9600,  c:['C1873B','6E4A18','D4AF37'] },
];

export const WEAVES = {
  'kanchipuram':  'Kanchipuram Silk',
  'banarasi':     'Banarasi Silk',
  'mysore-crepe': 'Mysore Crepe',
  'soft-silk':    'Soft Silk',
  'tussar':       'Tussar Silk',
  'organza':      'Organza',
  'chanderi':     'Chanderi',
  'silk-cotton':  'Silk Cotton',
  'georgette':    'Georgette',
  'ikat':         'Pochampally Ikat',
  'gadwal':       'Gadwal Silk',
};

export const OCCASIONS = { wedding:'Wedding', festive:'Festive', everyday:'Everyday' };

// Smart-collection price bands, in INR.
export const PRICE_BANDS = [
  { h:'under-5000',      title:'Under ₹5,000',        max:5000 },
  { h:'5000-10000',      title:'₹5,000 – ₹10,000',    min:5000,  max:10000 },
  { h:'10000-25000',     title:'₹10,000 – ₹25,000',   min:10000, max:25000 },
  { h:'above-25000',     title:'Above ₹25,000',       min:25000 },
];
