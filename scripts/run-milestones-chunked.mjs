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
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, json: () => JSON.parse(data), text: () => data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  let offset = 0;
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
