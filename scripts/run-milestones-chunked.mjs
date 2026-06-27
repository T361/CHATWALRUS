/**
 * Runs milestone checks in chunks via the GET endpoint.
 * Run: CRON_SECRET=... node scripts/run-milestones-chunked.mjs
 */
import https from 'https';

const CRON_SECRET = process.env.CRON_SECRET;
const BASE = 'https://chatwalrus.vercel.app';
const LIMIT = 20;

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: opts.headers || {},
      timeout: 280000, // 280s — just under Vercel's 300s max
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.setTimeout(280000);
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, json: () => JSON.parse(data), text: () => data }));
    });
    req.on('timeout', () => { req.destroy(new Error('Request timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  let offset = parseInt(process.argv[2] || '0', 10);
  let totalChecked = 0;
  let chunk = 0;

  while (true) {
    chunk++;
    const url = `${BASE}/api/jobs/run-milestones?offset=${offset}&limit=${LIMIT}`;
    console.log(`Chunk ${chunk}: companies ${offset}-${offset + LIMIT - 1}...`);

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
    });

    if (res.status !== 200) {
      console.error(`HTTP ${res.status}: ${res.text()}`);
      break;
    }

    const data = res.json();
    console.log(`  → ${data.companiesChecked}/${data.total} checked, done=${data.done}`);
    totalChecked += data.companiesChecked || 0;
    offset = data.nextOffset || (offset + LIMIT);

    if (data.done || data.status === 'error') {
      console.log(`\nDone. Total companies milestone-checked: ${totalChecked}`);
      break;
    }

    await new Promise(r => setTimeout(r, 3000));
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
