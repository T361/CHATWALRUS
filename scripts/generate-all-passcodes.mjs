// Generate passcodes for all active companies that don't have one yet.
// Run: node scripts/generate-all-passcodes.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// ── Load .env.local ───────────────────────────────────────────────────────────
const env = {};
try {
  readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
  });
} catch { /* file missing */ }

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

// ── Code generator: "companyslug-XXXX" ───────────────────────────────────────
function generateCode(companyName) {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug}-${suffix}`;
}

async function main() {
  // 1. All active companies
  const companies = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .range(offset, offset + 999);
    if (error) { console.error('Failed to fetch companies:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    companies.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`Found ${companies.length} active companies`);

  // 2. Companies that already have an active passcode
  const coveredIds = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db
      .from('passcodes')
      .select('company_id')
      .eq('status', 'active')
      .eq('role', 'company')
      .not('company_id', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach(p => coveredIds.add(p.company_id));
    if (data.length < 1000) break;
  }
  console.log(`${coveredIds.size} companies already have an active passcode`);

  // 3. Generate codes for the rest
  const missing = companies.filter(c => !coveredIds.has(c.id));
  console.log(`Generating passcodes for ${missing.length} companies...\n`);

  if (missing.length === 0) {
    console.log('All companies already have passcodes. Done!');
    return;
  }

  const rows = missing.map(c => ({
    code: generateCode(c.name),
    role: 'company',
    company_id: c.id,
    description: `Auto-generated for ${c.name}`,
    status: 'active',
  }));

  // 4. Batch insert in chunks of 100
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from('passcodes').insert(rows.slice(i, i + 100));
    if (error) {
      console.error(`Insert error at chunk ${i}:`, error.message);
    } else {
      inserted += Math.min(100, rows.length - i);
    }
  }

  console.log(`✓ Created ${inserted} passcodes\n`);
  console.log('CODE                   COMPANY');
  console.log('─'.repeat(55));
  rows.forEach(r => {
    const company = missing.find(c => c.id === r.company_id);
    console.log(`${r.code.padEnd(22)} ${company?.name ?? r.company_id}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
