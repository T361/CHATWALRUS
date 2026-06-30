import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const env = {};
try {
  readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
  });
} catch { /**/ }

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || env['NEXT_PUBLIC_SUPABASE_URL'],
  process.env.SUPABASE_SERVICE_ROLE_KEY || env['SUPABASE_SERVICE_ROLE_KEY'],
  { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } }
);

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Companies that don't exist in DB and need to be created as stubs
const MISSING = [
  { name: 'Bain Capital',    code: 'N2VEXRQ9' },
  { name: 'Brain Capital',   code: '8E3J5R7F' },
  { name: 'Savage X Fenty', code: '4H7CASBJ' },
  { name: 'Oh Clementine',   code: 'GQ2MC9YL' },
  { name: 'Sara Vico',       code: 'ENY8L4J5' },
  { name: 'Trilles AI',      code: 'JLRNY78B' },
  { name: 'Gruns',           code: 'HE22LUBE' },
  { name: 'Kennedy',         code: 'H8X4PEFK' },
];

// Codes that just need linking to an existing company by name match
const LINK_TO_EXISTING = [
  { code: '6FGLZPSR', companyName: 'The Collagen Co.' },
  { code: '5QBH8QJH', companyName: 'SmartSweets' },
];

async function main() {
  // Check which codes already exist
  const { data: existing } = await db.from('passcodes').select('code');
  const existingCodes = new Set((existing || []).map(p => p.code));

  // 1. Create stub companies + passcodes for the unmatched ones
  for (const { name, code } of MISSING) {
    if (existingCodes.has(code)) {
      console.log(`SKIP  ${code} (already exists)`);
      continue;
    }
    const slug = slugify(name);
    // Check if company already exists (maybe inactive)
    const { data: existing_co } = await db.from('companies').select('id,name').ilike('name', name).limit(1).single();
    let companyId;
    if (existing_co) {
      companyId = existing_co.id;
      console.log(`FOUND company: ${existing_co.name} (${companyId})`);
    } else {
      // Create stub company
      const { data: newCo, error: coErr } = await db.from('companies').insert({
        name, slug, is_active: true,
      }).select('id').single();
      if (coErr) { console.error(`ERROR creating ${name}: ${coErr.message}`); continue; }
      companyId = newCo.id;
      console.log(`CREATED company: ${name} → ${companyId}`);
    }
    // Insert passcode
    const { error: pcErr } = await db.from('passcodes').insert({
      code, role: 'company', company_id: companyId,
      description: `Legacy passcode for ${name}`, status: 'active',
    });
    if (pcErr) console.error(`ERROR inserting passcode ${code}: ${pcErr.message}`);
    else console.log(`INSERTED passcode ${code} → ${name}`);
  }

  // 2. Link orphaned codes to existing companies
  for (const { code, companyName } of LINK_TO_EXISTING) {
    if (existingCodes.has(code)) {
      console.log(`SKIP  ${code} (already exists)`);
      continue;
    }
    const { data: co } = await db.from('companies').select('id,name').ilike('name', companyName).limit(1).single();
    if (!co) { console.log(`NO MATCH for ${companyName} (${code})`); continue; }
    const { error } = await db.from('passcodes').insert({
      code, role: 'company', company_id: co.id,
      description: `Legacy passcode for ${co.name}`, status: 'active',
    });
    if (error) console.error(`ERROR inserting ${code}: ${error.message}`);
    else console.log(`INSERTED ${code} → ${co.name}`);
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
