// Imports old prototype passcodes into the current DB.
// For each code: if it already exists, skip. If not, find the company by name
// (case-insensitive) and insert it with role='company', status='active'.
// Run: node scripts/import-old-passcodes.mjs

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// ── Load .env.local ──────────────────────────────────────────────────────────
const env = {};
try {
  readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
  });
} catch { /* missing */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

// ── Old prototype passcodes: [code, companyName] ─────────────────────────────
const OLD_CODES = [
  ['R78WC9KS',         'Sundays company'],
  ['38DSDACK',         'Ten Thousand'],
  ['PKUMV2VL',         'Momentous'],
  ['GW4VNSVP',         'Saras Analytics'],
  ['UAVV3C2F',         'From Our Place'],
  ['HX7QUCNA',         'Million Dollar Baby Co.'],
  ['T5TUZPVW',         'Fishwife'],
  ['Y6N438RX',         'Compo Grande'],
  ['2USBRWLT',         'Petite Keep'],
  ['RTM8626U',         'Mint Showroom'],
  ['9D8G3WTQ',         'Correlation Ventures'],
  ['TWLTZ7FJ',         'Dreamday'],
  ['JAELYS4A',         'Murray River'],
  ['J5976Y5V',         'Shea Ventures'],
  ['TUG2TXNK',         'Prospect'],
  ['ZVJ3PJVJ',         'ILIA Beauty'],
  ['49PVPDCF',         'Systematic NYC'],
  ['QTP8XKA5',         'Hanni'],
  ['SWXV3JMZ',         'Ontario Teachers Pension Plan'],
  ['LUW72K8F',         'CRPT Growth'],
  ['XR4GY76Q',         'Educator'],
  ['VFTJ8QPJ',         'Spot and Tango'],
  ['RRCP586Q',         'Instant Hydration'],
  ['VEMVK52U',         'Higgsfield'],
  ['D3WKLSYP',         'Rag & Bone'],
  ['A3U47VJ7',         'ButcherBox'],
  ['P32ZAGGH',         'ButcherBox'],
  ['KHXXZKLH',         'Ritual'],
  ['FCYPNENE',         'Fracture'],
  ['XGJDXJ4P',         'JDA Group'],
  ['LSJFEHB8',         'RYZE'],
  ['HTYX2SM3',         'OSEA'],
  ['NXHTTM4Q',         'Paine Schwartz Partners'],
  ['27927FXD',         'Paine Schwartz'],
  ['HJVLNBUD',         'Paine Schwartz'],
  ['JX8SDKDV',         'Ancient Crunch'],
  ['ZK4WBMYR',         'Peerless Clothing'],
  ['YGBQHS8Y',         'Tushy'],
  ['YFNJH2B3',         "Bobo's"],
  ['YPC5X8KS',         'Ironhorse Exploration Partners'],
  ['VVNSTRU8',         'Veronica Beard Beta Cohort'],
  ['VT86PAX7',         'Happy innovations'],
  ['DBQYWGY4',         'The Good Feet Store'],
  ['DRX87S2A',         'Murray River Pet Food'],
  ['RCDJDNWW',         'Pact'],
  ['ZREPJULZ',         "Sweet Loren's"],
  ['P6RQVEEL',         'The Shipping Store'],
  ['AZCH4NV8',         'Desktronic'],
  ['EUXMQ4WN',         'Carbinox'],
  ['N2VEXRQ9',         'Bain Capital'],
  ['8E3J5R7F',         'Brain Capital'],
  ['CP92W6QB',         'Caden Lane'],
  ['YHCAPSVB',         'Test'],
  ['6D4RHQHK',         'Three Ships'],
  ['PM9ZT3XY',         'Dalfilo'],
  ['GVEHR2QV',         'Smart Sweets'],
  ['XLLQ84BD',         'Guild Cap'],
  ['MNQLE28S',         'The Perfect Jean'],
  ['GE58MKN2',         'Mad Rabbit'],
  ['GKJ898AD',         'Feldman Commercial'],
  ['GBXSAAES',         'Great Scott'],
  ['78XJ48GL',         'CGK Linens'],
  ['9SDJNYE2',         'Shinesty'],
  ['EQFPY4XH',         'Eureka Pet Co.'],
  ['95R5KQH5',         'R&Y Group'],
  ['BQC63FXT',         'Avid'],
  ['WSY66FGV',         'Laoban Dumplings'],
  ['PH8HRQZ5',         'Negative'],
  ['NH7JYK83',         'FORD GUM & MACHINE'],
  ['ZHY7NU37',         'Athletic Brewing'],
  ['C4EWVM8T',         'Ford Gum'],
  ['4H7CASBJ',         'Savage X Fenty'],
  ['X5R4W98Q',         'Condition 1'],
  ['2VH9XVCE',         'Condition 1'],
  ['8KUP7HZK',         'Concept to Co.'],
  ['Y7VXW8NQ',         'Fuzzee'],
  ['ZCR2YM7D',         'Highview'],
  ['JZM3G556',         'Cotopaxi'],
  ['3LGXYX84',         'Afar Foods'],
  ['RTV3B6NQ',         'Alexander Wang'],
  ['E7HRVHT9',         'Bevanda'],
  ['ZVAS5M29',         'Day 2 Co'],
  ['KXP75HPF',         'Petite Plume'],
  ['FAQM2NYY',         'Bathhouse'],
  ['T2EPCXBL',         'Rise Equity'],
  ['22MR6H98',         'Modern Citizen'],
  ['C58WUJDC',         'Caraway Home'],
  ['MUXLEP9V',         'FableticsOS'],
  ['W8PD5L37',         'Road Runner'],
  ['GQ2MC9YL',         'Oh Clementine'],
  ['LZ8DT9SJ',         'Thuma'],
  ['WTM55DK7',         'Sarah Flint'],
  ['9G56UP4V',         'Passport'],
  ['5DXLCB24',         'Petite Studio'],
  ['KW3XZTQT',         'Poppi'],
  ['BHZ7SSKP',         'Hill House Home'],
  ['GMPDV9NR',         'Lakeshirts'],
  ['GFZHC5PN',         'ChappyWrap'],
  ['R7S57ZWT',         'Blackwell Bridge'],
  ['Q2R3LEUA',         'Makeup by Mario'],
  ['NXMLXABU',         'PrettyBoy'],
  ['6T88VLLQ',         'Simon Pearce'],
  ['TP2F4P5B',         'MeUndies'],
  ['4QMWXJGW',         'Negative Underwear'],
  ['QUUQBY8P',         'Wishgarden Herbs'],
  ['3FDHS8QE',         'Mockingbird'],
  ['6WUPQBB5',         'Feetures'],
  ['XWUHHJZ6',         'The Collagen Co.'],
  ['GP74CDSN',         'Noemie'],
  ['C3B6TW9M',         'Mint Green Group'],
  ['6MN3X6X6',         "Moe's Home"],
  ['CASLSKQ9',         'The Woobles'],
  ['ENY8L4J5',         'Sara Vico'],
  ['L5LNSR24',         'Attn: Grace'],
  ['6ZEWLC6B',         'Veronica Beard'],
  ['3HQC6P42',         'Swim USA'],
  ['5QBH8QJH',         'SmartSweets'],
  ['WXTMDCWQ',         'WishGarden'],
  ['MYLTW4CT',         'Equip Foods'],
  ['5543SXXJ',         'Techstyle'],
  ['EU54JA9Z',         'Coach'],
  ['XEXGEFR7',         'PAVOI'],
  ['YXGNUCUL',         'Boqueria Restaurant'],
  ['V7BWKVNF',         'Nodpod'],
  ['D9LZW54L',         'Nodpod'],
  ['CB4K896F',         'Grüns'],
  ['XGMP5SKT',         'feals'],
  ['N6JFYG5K',         'Sistain'],
  ['FZTBDT6K',         'Emerge technologies'],
  ['KM6RW38V',         'nanit'],
  ['5HEQCVL5',         'Los York'],
  ['JZ5KY5NV',         'Honey Smoked Fish'],
  ['W9G2DXHF',         'Honey Smoked Fish'],
  ['JLRNY78B',         'Trilles AI'],
  ['GUAURCXA',         'Boqueria'],
  ['BJN6RMP9',         'Parabola'],
  ['C2LXQGRL',         'Ombraz'],
  ['CSMZEN9A',         'Daring'],
  ['HE22LUBE',         'Gruns'],
  ['PA9X6ZVQ',         'Soapbox Soaps'],
  ['WGNBBL2V',         'Topo Designs'],
  ['H8X4PEFK',         'Kennedy'],
  ['D6SCDRY3',         'Craighill'],
  ['D9KQU2VM',         'Larabar'],
  ['9R89AEZ9',         'Caraway'],
  ['URT7M54G',         'Thinkific'],
  ['3AWZS49K',         'Cumulus Coffee'],
  ['LKLVRPGA',         'Fabletics'],
  ['U35ECW9B',         "Craig's Network"],
  ['FVSWT5LB',         'OTR'],
  ['CXQZXTWV',         'HexClad'],
  ['P56CP6E6',         'Quadrant Capital Partners'],
  ['MAEW349T',         'Robin Hood'],
  ['2QGCNSJZ',         'Sundays'],
  ['BX676ZYT',         "Moe's"],
  ['GNZM349S',         "Bobo's Oat Bars"],
  ['FUF8XYKN',         'Propulsion AI'],
  ['XBHMSY6H',         'Off The Record'],
  ['DT8DRKFQ',         'RYCO Capital'],
  ['2KY6UWD6',         'Sacheu'],
  ['P3ACGYJ5',         "People's Choice Beef Jerky"],
  ['29QUUE7A',         "Bobo's"],
  ['fctHNB7aJYZa',     'Repurpose'],
  ['A7gscCeGmdeT',     'Ridge'],
  ['a8znmwNxrRWq',     'A+E Global Media'],
  ['eJk8gBMCFcPX',     'Soapbox'],
  ['kse8PF6p9M3c',     "Craig's Friend"],
  ['kZX84UaZPNue',     'TLo Ventures'],
  ['t8XxE8wJmNNc',     'Raycon'],
  ['HJW6KdS8y6Yp',     'ChatWalrus'],
  ['aFhgcGCkkrsa',     'Solid Ratio'],
  ['3Pn6x6VdBCSV',     'The Retail Navigator'],
  ['yFbVKsXVEQNf',     "Sundays/Moe's"],
  ['gEbJkEXWvHya',     'Good Turn Law'],
  ['SzFbuAgP7VtP',     'Bombas'],
  ['6XhzADk4Tgtz',     'Crocs'],
  ['4gMcvc3jsHbj',     'Warby Parker'],
  ['YBwdBqJ6dREB',     'Omnilux'],
  ['yWSpEXJfrXKq',     'Topo'],
];

async function main() {
  // 1. Fetch all existing passcode codes (to skip dupes)
  const existingCodes = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.from('passcodes').select('code').range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach(p => existingCodes.add(p.code));
    if (data.length < 1000) break;
  }
  console.log(`Found ${existingCodes.size} existing passcodes in DB\n`);

  // 2. Build company name → id map (case-insensitive)
  const companyNameMap = new Map(); // lowercase name → {id, name}
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.from('companies').select('id, name').eq('is_active', true).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const c of data) companyNameMap.set(c.name.toLowerCase(), c);
    if (data.length < 1000) break;
  }
  console.log(`Found ${companyNameMap.size} active companies\n`);

  // 3. Process each old code
  const toInsert = [];
  const skipped  = [];
  const noMatch  = [];

  for (const [code, companyName] of OLD_CODES) {
    if (existingCodes.has(code)) {
      skipped.push({ code, companyName, reason: 'already exists' });
      continue;
    }
    // Try exact match first, then partial
    const key = companyName.toLowerCase();
    let company = companyNameMap.get(key);
    if (!company) {
      // Try contains match
      for (const [k, c] of companyNameMap) {
        if (k.includes(key) || key.includes(k)) { company = c; break; }
      }
    }
    if (!company) {
      noMatch.push({ code, companyName });
      continue;
    }
    toInsert.push({
      code,
      role: 'company',
      company_id: company.id,
      description: `Legacy passcode for ${company.name}`,
      status: 'active',
    });
  }

  // 4. Batch insert in chunks of 100
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const { error } = await db.from('passcodes').insert(toInsert.slice(i, i + 100));
    if (error) console.error(`Insert error at chunk ${i}:`, error.message);
    else inserted += Math.min(100, toInsert.length - i);
  }

  // 5. Report
  console.log(`✓ Inserted: ${inserted}`);
  console.log(`  Skipped (already in DB): ${skipped.length}`);
  console.log(`  No company match: ${noMatch.length}\n`);

  if (noMatch.length > 0) {
    console.log('UNMATCHED CODES (need manual review):');
    noMatch.forEach(({ code, companyName }) => console.log(`  ${code.padEnd(20)} ${companyName}`));
  }

  if (inserted > 0) {
    console.log('\nINSERTED:');
    console.log('CODE                   COMPANY');
    console.log('─'.repeat(55));
    toInsert.slice(0, inserted).forEach(r => {
      console.log(`${r.code.padEnd(22)} ${r.description.replace('Legacy passcode for ', '')}`);
    });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
