/**
 * Syncs all lessons from Thinkific to Supabase.
 * Run locally: node scripts/sync-lessons.mjs
 *
 * Root cause: Thinkific /courses/{id}/chapters returns content_ids (integer array),
 * not full content objects. Each content must be fetched via /contents/{id}.
 */

import https from 'https';

const THINKIFIC_API_KEY = process.env.THINKIFIC_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gerqhcikfkoykgadoaah.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const THINKIFIC_BASE = 'https://api.thinkific.com/api/public/v1';
const CONCURRENCY = 8;

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
      res.on('end', () => resolve({ status: res.statusCode, json: () => JSON.parse(data), text: () => data }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function thinkificGet(endpoint, params = {}) {
  const url = new URL(`${THINKIFIC_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${THINKIFIC_API_KEY}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 429) {
    console.log('Rate limited, waiting 10s...');
    await new Promise(r => setTimeout(r, 10000));
    return thinkificGet(endpoint, params);
  }
  if (res.status !== 200) throw new Error(`Thinkific ${res.status} on ${endpoint}: ${res.text()}`);
  return res.json();
}

async function supabasePost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
  const text = res.text();
  if (res.status >= 300) throw new Error(`Supabase POST ${path} ${res.status}: ${text}`);
  return text;
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

async function pLimit(concurrency, tasks) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function main() {
  console.log('Fetching all courses from Supabase...');
  const courses = await supabaseGet('courses?select=id,thinkific_course_id,name&order=name');
  console.log(`Found ${courses.length} courses`);

  let totalLessons = 0;
  let processed = 0;

  for (const course of courses) {
    processed++;
    process.stdout.write(`[${processed}/${courses.length}] ${course.name.slice(0, 50)}... `);

    try {
      // 1. Get all chapters for this course
      const chaptersResp = await thinkificGet(`/courses/${course.thinkific_course_id}/chapters`, { page: 1, limit: 100 });
      const chapters = chaptersResp.items || [];

      if (chapters.length === 0) {
        console.log('(no chapters)');
        continue;
      }

      // 2. Collect all content IDs across all chapters
      const contentEntries = [];
      for (const chapter of chapters) {
        for (const contentId of (chapter.content_ids || [])) {
          contentEntries.push({ contentId, chapterId: chapter.id, chapterName: chapter.name, position: chapter.position });
        }
      }

      if (contentEntries.length === 0) {
        console.log('(no content)');
        continue;
      }

      // 3. Fetch each content in parallel (CONCURRENCY at a time)
      const lessonRecords = [];
      const tasks = contentEntries.map((entry, idx) => async () => {
        try {
          const content = await thinkificGet(`/contents/${entry.contentId}`);
          lessonRecords[idx] = {
            thinkific_lesson_id: String(content.id),
            course_id: course.id,
            name: content.name || null,
            chapter_name: entry.chapterName || null,
            position: content.position ?? null,
            lesson_type: content.contentable_type || null,
            is_video: (content.contentable_type || '').toLowerCase() === 'video',
          };
        } catch (err) {
          console.warn(`\n  Failed content ${entry.contentId}: ${err.message}`);
        }
      });

      await pLimit(CONCURRENCY, tasks);
      const validRecords = lessonRecords.filter(Boolean);

      // 4. Upsert in batches of 100
      for (let i = 0; i < validRecords.length; i += 100) {
        await supabasePost('lessons?on_conflict=thinkific_lesson_id', validRecords.slice(i, i + 100));
      }

      totalLessons += validRecords.length;
      console.log(`${validRecords.length} lessons`);

      // Small delay to be nice to Thinkific API
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
  }

  console.log(`\nDone. Total lessons synced: ${totalLessons}`);

  // Record sync log
  await supabasePost('sync_logs', {
    sync_type: 'courses',
    status: 'success',
    records_processed: totalLessons,
    completed_at: new Date().toISOString(),
  });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
