#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
global.WebSocket = class WebSocket {};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const THINKIFIC_GROUPS = [
  'Ten Thousand','Momentous','Alexander Wang','Fishwife','Mint Show Room','Campo Grande','Shea Ventures','Mint Green Group','ILIA Beauty','Systematic NYC','Hanni','OTPP','Rag & Bone','Instant Hydration','Ritual','Shipping Store','OSEA','ButcherBox','PSP','Eureka pet co','Fracture','JDA Group','Warby Parker Retail','Peerless','Ancient Crunch',
  'Tushy','Veronica Beard Beta','Happy Innovations','Good Feet','Murray River Pet','Pact','Caden Lane',"Sweet Loren's",'Desktronic','Carbinox','Athletic Brewing','Three Ships','Dalfilo','Smart Sweets','The Perfect Jean','Mad Rabbit','Feldman Commercial','Warby Parker AI Change Champions 5/01','CGK Linens','Great Scott','Shinesty','R&Y Group','Avid','Laoban Dumplings','Ford Gum',
  'Warby Parker- ALA','Condition 1','Caraway.2','Fuzzee','Highview','Cotopaxi','Afar Foods','Bevanda','Petite Plume','Bathhouse','Modern Citizen','Rise Equity','Road Runner','Thuma','Sarah Flint','Passport','Hill House Home','Lakeshirts.2','Lakeshirts','Makeup by Mario','ChappyWrap','MeUndies','PrettyBoy','Simon Pearce','Negative',
  'Fabletics.10','Fabletics.9','Fabletics.8','Fabletics.7','Fabletics.6','Fabletics.5','Fabletics.4','Fabletics.3','Fabletics.2','Feetures','The Collagen Co.','Veronica Beard','The Woobles','Swim USA','WishGarden','Equip Foods','Nanit','nodpod','feals','PAVOI','Los York','Honey Smoked Fish','Boqueria','Craighill','Caraway',
  'Cumulus Coffee','Bombas.2','HexClad.2','Fabletics','HexClad','Quadrant Capital Partners','Robin Hood',"Craig's Network",'SACHEU',"People's Choice Beef Jerky","Bobo's",'Soapbox','Raycon',"Moe's Home",'Sundays Company','Repurpose','Ridge','Crocs','Bombas','Warby Parker','Omnilux','Topo','ChatWalrus',
];

function toSlug(name) {
  return name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

const { data: companies, error } = await db.from('companies').select('name, slug, is_active').order('name');
if (error) { console.error(error); process.exit(1); }

const slugSet = new Set(companies.map(c => c.slug));

console.log(`ChatWalrus companies: ${companies.length}`);
console.log(`Thinkific groups:     ${THINKIFIC_GROUPS.length}\n`);

console.log('=== THINKIFIC GROUPS → CHATWALRUS STATUS ===');
let matched = 0, fuzzy = 0, notFound = 0;

for (const group of THINKIFIC_GROUPS) {
  const slug = toSlug(group);
  if (slugSet.has(slug)) {
    const co = companies.find(c => c.slug === slug);
    console.log(`  ✓  "${group}"  →  ${slug}  (active: ${co.is_active})`);
    matched++;
  } else {
    // Try without trailing .N suffix (e.g. fabletics.2 → fabletics)
    const baseSlug = slug.replace(/-\d+$/, '').replace(/\.\d+$/, '');
    const fuzzyMatch = companies.find(c => c.slug === baseSlug);
    if (fuzzyMatch) {
      console.log(`  ~  "${group}"  →  slug "${slug}" not found, base slug matches "${fuzzyMatch.name}" (${fuzzyMatch.slug})`);
      fuzzy++;
    } else {
      console.log(`  ✗  "${group}"  →  slug "${slug}"  MISSING FROM CHATWALRUS`);
      notFound++;
    }
  }
}

console.log(`\nSummary: ${matched} exact match, ${fuzzy} fuzzy match (numbered groups), ${notFound} MISSING`);

console.log('\n=== CHATWALRUS COMPANIES NOT IN THINKIFIC GROUPS ===');
const thinkificSlugs = new Set(THINKIFIC_GROUPS.map(toSlug));
for (const co of companies) {
  if (!thinkificSlugs.has(co.slug)) {
    console.log(`  ?  "${co.name}" (${co.slug}) — active: ${co.is_active}`);
  }
}
