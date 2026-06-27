#!/usr/bin/env node
// Backfill company_id for all learners based on email domain matching

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = 'https://gerqhcikfkoykgadoaah.supabase.co/rest/v1';

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// Domain → company slug mapping
const DOMAIN_MAP = {
  'bombas.com': 'bombas',
  'robinhood.org': 'robinhood',
  'warbyparker.com': 'warby-parker',
  'hexclad.com': 'hexclad',
  'fabletics.com': 'fabletics',
  'techstyle.com': 'techstyle',
  'cumuluscoffee.com': 'cumulus-coffee',
  'topodesigns.com': 'topo-designs',
  'craighill.co': 'craighill',
  'carawayhome.com': 'caraway-home',
  'honeysmokedfish.com': 'honey-smoked-fish',
  'losyork.tv': 'los-york',
  'boqueriarestaurant.com': 'boqueria',
  'boquerianyc.com': 'boqueria',
  'moeshome.com': 'moes-home',
  'sundays-company.com': 'sundays-company',
  'chatwalrus.com': 'chatwalrus',
  'sacheu.com': 'sacheu',
  'omniluxled.com': 'omnilux-led',
  'soapboxsoaps.com': 'soapbox-soaps',
  'ridge.com': 'ridge',
  'nanit.com': 'nanit',
};

async function main() {
  // Fetch all companies
  const companiesRes = await fetch(`${BASE}/companies?select=id,slug`, { headers });
  const companies = await companiesRes.json();
  const slugToId = {};
  for (const c of companies) {
    slugToId[c.slug] = c.id;
  }
  console.log(`Loaded ${companies.length} companies`);

  // Fetch ALL learners with null company_id
  let allLearners = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const res = await fetch(
      `${BASE}/learners?select=id,email&company_id=is.null&limit=${limit}&offset=${offset}`,
      { headers }
    );
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    allLearners = allLearners.concat(batch);
    offset += limit;
    if (batch.length < limit) break;
  }
  console.log(`Found ${allLearners.length} learners with null company_id`);

  let matched = 0;
  let unmatched = 0;

  for (const learner of allLearners) {
    if (!learner.email || !learner.email.includes('@')) {
      unmatched++;
      continue;
    }
    const domain = learner.email.split('@')[1].toLowerCase();
    const slug = DOMAIN_MAP[domain];
    
    if (!slug || !slugToId[slug]) {
      unmatched++;
      continue;
    }

    // Update learner's company_id
    const updateRes = await fetch(
      `${BASE}/learners?id=eq.${learner.id}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ company_id: slugToId[slug] }),
      }
    );

    if (updateRes.ok) {
      matched++;
    } else {
      const err = await updateRes.text();
      console.error(`Failed to update ${learner.email}: ${err}`);
    }
  }

  console.log(`\nDone!`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Unmatched: ${unmatched}`);
}

main().catch(console.error);
