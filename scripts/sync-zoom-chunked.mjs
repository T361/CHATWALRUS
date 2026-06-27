/**
 * Runs Zoom attendance sync in chunks via the existing GET endpoint.
 * Run: node scripts/sync-zoom-chunked.mjs
 */
import https from 'https';

const CRON_SECRET = process.env.CRON_SECRET;
const BASE = 'https://chatwalrus.vercel.app';
const LIMIT = 1;

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: opts.headers || {},
      timeout: 110000, // 110s socket timeout
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.setTimeout(110000);
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, json: () => JSON.parse(data), text: () => data }));
    });
    req.on('timeout', () => { req.destroy(new Error('Request timeout after 110s')); });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  let offset = parseInt(process.argv[2] || '0', 10);
  let totalRecords = 0;
  let chunk = 0;

  while (true) {
    chunk++;
    const url = `${BASE}/api/admin/sync/zoom?offset=${offset}&limit=${LIMIT}`;
    console.log(`Chunk ${chunk}: offset=${offset}...`);

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
    });

    if (res.status !== 200) {
      console.error(`HTTP ${res.status}: ${res.text()}`);
      break;
    }

    const data = res.json();
    console.log(`  → ${data.recordsProcessed} records, ${data.totalSessions} sessions, done=${data.done}`);
    totalRecords += data.recordsProcessed || 0;
    offset = data.nextOffset || (offset + LIMIT);

    if (data.done || data.status === 'error') {
      console.log(`\nDone. Total records: ${totalRecords}`);
      break;
    }

    // Brief pause between chunks
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
