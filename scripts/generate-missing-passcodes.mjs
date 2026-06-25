#!/usr/bin/env node

/**
 * Auto-generate passcodes for all companies that don't have one
 *
 * Usage: node scripts/generate-missing-passcodes.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Disable realtime for Node 20 compatibility
global.WebSocket = class WebSocket {};
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function generatePasscode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars (0, O, 1, I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function main() {
  console.log('🔍 Fetching all companies from database...');

  const { data: companies, error: companiesError } = await db
    .from('companies')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name');

  if (companiesError) {
    console.error('❌ Failed to fetch companies:', companiesError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${companies.length} active companies`);

  console.log('\n🔍 Fetching existing passcodes...');

  const { data: existingPasscodes, error: passcodesError } = await db
    .from('passcodes')
    .select('company_id, code')
    .eq('role', 'company');

  if (passcodesError) {
    console.error('❌ Failed to fetch passcodes:', passcodesError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${existingPasscodes.length} existing company passcodes`);

  // Build set of company IDs that already have passcodes
  const companiesWithPasscodes = new Set(existingPasscodes.map(p => p.company_id));

  // Find companies without passcodes
  const companiesNeedingPasscodes = companies.filter(c => !companiesWithPasscodes.has(c.id));

  console.log(`\n📊 Summary:`);
  console.log(`  - Total companies: ${companies.length}`);
  console.log(`  - Companies with passcodes: ${companiesWithPasscodes.size}`);
  console.log(`  - Companies needing passcodes: ${companiesNeedingPasscodes.length}`);

  if (companiesNeedingPasscodes.length === 0) {
    console.log('\n✅ All companies already have passcodes!');
    return;
  }

  console.log('\n📝 Generating passcodes for missing companies...');

  const newPasscodes = [];
  const usedCodes = new Set(existingPasscodes.map(p => p.code));

  for (const company of companiesNeedingPasscodes) {
    let code;
    let attempts = 0;

    // Generate unique code (max 100 attempts to avoid infinite loop)
    do {
      code = generatePasscode();
      attempts++;
    } while (usedCodes.has(code) && attempts < 100);

    if (attempts >= 100) {
      console.error(`❌ Failed to generate unique passcode for ${company.name} after 100 attempts`);
      continue;
    }

    usedCodes.add(code);

    newPasscodes.push({
      code,
      role: 'company',
      company_id: company.id,
      description: `Auto-generated for ${company.name}`,
      status: 'active'
    });

    console.log(`  ✅ ${code} → ${company.name}`);
  }

  console.log(`\n📥 Inserting ${newPasscodes.length} new passcodes...`);

  // Insert in batches of 100
  let inserted = 0;
  for (let i = 0; i < newPasscodes.length; i += 100) {
    const batch = newPasscodes.slice(i, i + 100);
    const { error: insertError } = await db.from('passcodes').insert(batch);

    if (insertError) {
      console.error(`❌ Failed to insert batch ${Math.floor(i / 100) + 1}:`, insertError.message);
      process.exit(1);
    }

    inserted += batch.length;
  }

  console.log(`\n✅ Success! Generated and inserted ${inserted} new passcodes.`);
  console.log(`\n📊 Final status:`);
  console.log(`  - Total companies: ${companies.length}`);
  console.log(`  - Total passcodes: ${existingPasscodes.length + inserted}`);
  console.log(`  - All companies now have passcodes: ✅`);
}

main().catch((error) => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
