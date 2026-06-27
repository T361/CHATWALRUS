/**
 * Syncs lesson-level progress for all active enrollments.
 * Run locally: node scripts/sync-lesson-progress.mjs
 *
 * This processes ~66k enrollments against Thinkific's course_progress API.
 * With CONCURRENCY=3 and rate-limit waits, expect 6-12 hours total.
 *
 * Progress is saved to disk (sync-lesson-progress-state.json) so you can
 * resume if interrupted: node scripts/sync-lesson-progress.mjs --resume
 */

import https from 'https';
import fs from 'fs';

const THINKIFIC_API_KEY = process.env.THINKIFIC_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gerqhcikfkoykgadoaah.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const THINKIFIC_BASE = 'https://api.thinkific.com/api/public/v1';
const CONCURRENCY = 3;
const STATE_FILE = 'scripts/sync-lesson-progress-state.json';

const RESUME = process.argv.includes('--resume');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: () => JSON.parse(data), text: () => data }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function thinkificGet(endpoint, params = {}, retries = 3) {
  const url = new URL(`${THINKIFIC_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${THINKIFIC_API_KEY}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 429) {
      const wait = parseInt(res.headers['retry-after'] || '10', 10) * 1000;
      console.log(`  Rate limited, waiting ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (res.status !== 200) {
      if (attempt === retries) throw new Error(`Thinkific ${res.status}: ${res.text().slice(0, 200)}`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    return res.json();
  }
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Range': '0-9999999',
    },
  });
  return res.json();
}

async function supabaseUpsert(table, records) {
  if (!records.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=learner_id,course_id,lesson_id`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(records),
  });
  if (res.status >= 300) throw new Error(`Supabase upsert ${table} ${res.status}: ${res.text()}`);
}

async function supabaseSql(sql) {
  const PAT = process.env.SUPABASE_PAT;
  const res = await fetch(`https://api.supabase.com/v1/projects/gerqhcikfkoykgadoaah/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res.json();
}

async function pLimit(concurrency, tasks) {
  const results = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try { results[idx] = await tasks[idx](); }
      catch (e) { results[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadState() {
  if (RESUME && fs.existsSync(STATE_FILE)) {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    console.log(`Resuming from offset ${s.lastCompletedIdx + 1} (${s.totalRecords} records written so far)`);
    return s;
  }
  return { lastCompletedIdx: -1, totalRecords: 0, startedAt: new Date().toISOString() };
}

async function main() {
  console.log(`\n=== Lesson Progress Sync ===`);
  console.log(`Mode: ${RESUME ? 'RESUME' : 'FRESH START'}`);

  // 1. Build lesson map from DB
  console.log('\n1. Loading lessons from DB...');
  const lessonsData = await supabaseSql('SELECT id, thinkific_lesson_id, lesson_type, is_video FROM lessons');
  const lessonMap = new Map();
  for (const l of lessonsData) lessonMap.set(String(l.thinkific_lesson_id), l);
  console.log(`   ${lessonMap.size} lessons loaded`);

  if (lessonMap.size === 0) {
    console.error('ERROR: No lessons in DB. Run sync-lessons.mjs first.');
    process.exit(1);
  }

  // 2. Load all active enrollments with learner and course Thinkific IDs
  console.log('\n2. Loading enrollments from DB...');
  const enrollmentsData = await supabaseSql(`
    SELECT e.thinkific_enrollment_id, e.learner_id, e.company_id, e.course_id,
           l.thinkific_user_id, c.thinkific_course_id, e.progress_percent, e.updated_at
    FROM enrollments e
    JOIN learners l ON l.id = e.learner_id
    JOIN courses c ON c.id = e.course_id
    WHERE e.is_active = true
      AND l.thinkific_user_id IS NOT NULL
      AND c.thinkific_course_id IS NOT NULL
    ORDER BY e.thinkific_enrollment_id
  `);
  console.log(`   ${enrollmentsData.length} enrollments to process`);

  // 3. Load or restore state
  const state = loadState();
  let totalRecords = state.totalRecords;
  const startIdx = state.lastCompletedIdx + 1;
  const startTime = Date.now();

  console.log(`\n3. Processing ${enrollmentsData.length - startIdx} remaining enrollments at CONCURRENCY=${CONCURRENCY}...\n`);

  // Process in serial batches (each batch = CONCURRENCY parallel calls)
  for (let batchStart = startIdx; batchStart < enrollmentsData.length; batchStart += CONCURRENCY) {
    const batch = enrollmentsData.slice(batchStart, batchStart + CONCURRENCY);

    await pLimit(CONCURRENCY, batch.map((enrollment) => async () => {
      try {
        // Fetch all progress items for this enrollment
        let allItems = [];
        let page = 1;
        while (true) {
          const resp = await thinkificGet('/course_progress', {
            course_id: enrollment.thinkific_course_id,
            user_id: enrollment.thinkific_user_id,
            page: String(page),
            limit: '100',
          });
          const items = resp?.items || [];
          allItems.push(...items);
          const pagination = resp?.meta?.pagination;
          if (!pagination || page >= pagination.total_pages) break;
          page++;
        }

        const lessonRows = [];
        for (const item of allItems) {
          const lesson = lessonMap.get(String(item.content_id));
          if (!lesson) continue;
          lessonRows.push({
            learner_id: enrollment.learner_id,
            company_id: enrollment.company_id,
            course_id: enrollment.course_id,
            lesson_id: lesson.id,
            completed: item.completed || false,
            completed_at: item.completed && item.updated_at ? item.updated_at : null,
            viewed_at: item.updated_at || null,
            progress_percent: Math.min(100, Math.max(0, Number(item.percent_completed ?? 0))),
          });
        }

        // Upsert in chunks of 100
        for (let i = 0; i < lessonRows.length; i += 100) {
          await supabaseUpsert('lesson_progress', lessonRows.slice(i, i + 100));
        }

        totalRecords += lessonRows.length;
      } catch (err) {
        console.warn(`  WARN: Enrollment ${enrollment.thinkific_enrollment_id} failed: ${err.message}`);
      }
    }));

    const lastIdx = Math.min(batchStart + CONCURRENCY - 1, enrollmentsData.length - 1);
    state.lastCompletedIdx = lastIdx;
    state.totalRecords = totalRecords;
    saveState(state);

    const done = lastIdx + 1;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (done - startIdx) / elapsed;
    const remaining = enrollmentsData.length - done;
    const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : '?';

    if (done % 30 === 0 || done === enrollmentsData.length) {
      console.log(`[${done}/${enrollmentsData.length}] ${totalRecords} records | ${rate.toFixed(1)} enrollments/s | ETA ~${etaMin} min`);
    }

    // Brief pause between batches to be nice to Thinkific
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone! Total lesson_progress records written: ${totalRecords}`);

  // Mark sync complete in sync_logs
  await supabaseSql(`
    INSERT INTO sync_logs (sync_type, status, records_processed, completed_at)
    VALUES ('lesson_progress', 'success', ${totalRecords}, now())
  `);
  console.log('Sync log recorded.');
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
