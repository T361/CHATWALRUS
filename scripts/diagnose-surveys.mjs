#!/usr/bin/env node
/**
 * Survey Analytics Diagnostic Script
 *
 * This script diagnoses the survey analytics data flow end-to-end.
 * Usage: node scripts/diagnose-surveys.mjs
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const results = [];

function log(status, message, details) {
  results.push({ status, message, details });
  const icon = status === 'ok' ? '✓' : status === 'warning' ? '⚠' : '✗';
  console.log(`${icon} ${message}`);
  if (details) {
    console.log('  ', JSON.stringify(details, null, 2));
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Survey Analytics End-to-End Diagnostic');
  console.log('='.repeat(60));
  console.log();

  // Create Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    log('error', 'Missing Supabase credentials', {
      has_url: !!supabaseUrl,
      has_key: !!supabaseKey,
      action: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    });
    return;
  }

  const db = createClient(supabaseUrl, supabaseKey);

  // 1. Check surveys table
  console.log('1. Checking surveys table...');
  const { count: surveyCount, error: surveyCountError } = await db
    .from('surveys')
    .select('id', { count: 'exact', head: true });

  if (surveyCountError) {
    log('error', 'Failed to query surveys table', { error: surveyCountError.message });
    return;
  }

  const storedReviews = Number(surveyCount ?? 0);
  if (storedReviews === 0) {
    log('warning', 'No surveys found in database', { stored_reviews: 0 });
  } else {
    log('ok', `Found ${storedReviews} stored survey reviews`);
  }

  // 2. Check latest sync log
  console.log('\n2. Checking sync logs...');
  const { data: latestSync, error: syncError } = await db
    .from('sync_logs')
    .select('status, records_processed, error_message, completed_at, metadata, started_at')
    .eq('sync_type', 'surveys')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (syncError) {
    log('error', 'Failed to query sync logs', { error: syncError.message });
  } else if (!latestSync) {
    log('warning', 'No survey sync has been run yet', {
      action: 'Go to /admin/settings and click "Import Survey Reviews"'
    });
  } else {
    const metadata = latestSync.metadata;
    log(
      latestSync.status === 'success' ? 'ok' : 'error',
      `Latest sync: ${latestSync.status}`,
      {
        started_at: latestSync.started_at,
        completed_at: latestSync.completed_at,
        records_processed: latestSync.records_processed,
        courses_checked: metadata?.courses_checked,
        upstream_reviews_found: metadata?.upstream_reviews_found,
        records_upserted: metadata?.records_upserted,
        endpoint_errors_count: Array.isArray(metadata?.endpoint_errors) ? metadata.endpoint_errors.length : 0,
        error_message: latestSync.error_message,
      }
    );
  }

  // 3. Check survey data quality
  if (storedReviews > 0) {
    console.log('\n3. Checking survey data quality...');

    const { data: surveys, error: surveyError } = await db
      .from('surveys')
      .select('id, rating, company_id, learner_id, course_id, companies(name), learners(full_name), courses(name)')
      .limit(100);

    if (surveyError) {
      log('error', 'Failed to query survey details', { error: surveyError.message });
    } else if (surveys) {
      const totalSampled = surveys.length;
      const withRating = surveys.filter(s => s.rating !== null).length;
      const withCompany = surveys.filter(s => s.companies !== null).length;
      const withLearner = surveys.filter(s => s.learners !== null).length;
      const withCourse = surveys.filter(s => s.courses !== null).length;

      log('ok', `Sampled ${totalSampled} survey records`, {
        with_rating: `${withRating}/${totalSampled}`,
        with_company_mapping: `${withCompany}/${totalSampled}`,
        with_learner_mapping: `${withLearner}/${totalSampled}`,
        with_course_mapping: `${withCourse}/${totalSampled}`,
      });

      if (withLearner < totalSampled * 0.5) {
        log('warning', 'Less than 50% of surveys have learner mappings', {
          issue: 'thinkific_user_id may not match learner records',
          action: 'Check learner sync and verify thinkific_user_id values'
        });
      }

      if (withCourse < totalSampled * 0.5) {
        log('warning', 'Less than 50% of surveys have course mappings', {
          issue: 'thinkific_course_id may not match course records',
          action: 'Check course sync and verify thinkific_course_id values'
        });
      }
    }
  }

  // 4. Check Thinkific configuration
  console.log('\n4. Checking Thinkific configuration...');
  const thinkificConfigured = !!(
    process.env.THINKIFIC_API_KEY &&
    process.env.THINKIFIC_SUBDOMAIN
  );

  if (!thinkificConfigured) {
    log('error', 'Thinkific not configured', {
      missing: ['THINKIFIC_API_KEY', 'THINKIFIC_SUBDOMAIN'].filter(key => !process.env[key]),
      action: 'Set required environment variables'
    });
  } else {
    log('ok', 'Thinkific credentials configured');
  }

  // 5. Check courses table
  console.log('\n5. Checking courses with Thinkific IDs...');
  const { count: courseCount, error: courseError } = await db
    .from('courses')
    .select('id', { count: 'exact', head: true })
    .not('thinkific_course_id', 'is', null);

  if (courseError) {
    log('error', 'Failed to query courses', { error: courseError.message });
  } else {
    const coursesWithThinkificId = Number(courseCount ?? 0);
    if (coursesWithThinkificId === 0) {
      log('warning', 'No courses have thinkific_course_id', {
        action: 'Run "Import Core Data" sync to import courses from Thinkific'
      });
    } else {
      log('ok', `Found ${coursesWithThinkificId} courses with Thinkific IDs`);
    }
  }

  // 6. Check learners table
  console.log('\n6. Checking learners with Thinkific IDs...');
  const { count: learnerCount, error: learnerError } = await db
    .from('learners')
    .select('id', { count: 'exact', head: true })
    .not('thinkific_user_id', 'is', null);

  if (learnerError) {
    log('error', 'Failed to query learners', { error: learnerError.message });
  } else {
    const learnersWithThinkificId = Number(learnerCount ?? 0);
    if (learnersWithThinkificId === 0) {
      log('warning', 'No learners have thinkific_user_id', {
        action: 'Run "Import Core Data" sync to import users from Thinkific'
      });
    } else {
      log('ok', `Found ${learnersWithThinkificId} learners with Thinkific IDs`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const errors = results.filter(r => r.status === 'error').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const oks = results.filter(r => r.status === 'ok').length;

  console.log(`✓ OK: ${oks}`);
  console.log(`⚠ Warnings: ${warnings}`);
  console.log(`✗ Errors: ${errors}`);

  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(60));

  if (storedReviews === 0 && !latestSync) {
    console.log('1. Run the survey sync:');
    console.log('   - Navigate to /admin/settings');
    console.log('   - Click "Import Survey Reviews"');
    console.log('   - Wait for sync to complete');
    console.log('   - Check the status message');
  } else if (storedReviews === 0 && latestSync?.status === 'success') {
    console.log('1. Thinkific has no course reviews to import');
    console.log('   - This is normal if learners haven\'t submitted reviews');
    console.log('   - The sync completed successfully but found 0 upstream reviews');
    if (latestSync.metadata) {
      console.log('   - Courses checked:', latestSync.metadata.courses_checked);
      console.log('   - Upstream reviews found:', latestSync.metadata.upstream_reviews_found);
    }
  } else if (storedReviews === 0 && latestSync?.status === 'error') {
    console.log('1. Latest sync failed:');
    console.log('   - Error:', latestSync.error_message);
    console.log('   - Check Thinkific credentials');
    console.log('   - Check network connectivity');
    console.log('   - Review sync logs for details');
  } else if (storedReviews > 0) {
    console.log('1. ✓ Survey data exists - API should be working');
    console.log('   - Visit /admin/surveys to view analytics');
    console.log('   - Check browser console for any client-side errors');
    console.log('   - Verify user has admin role (not company-scoped)');
    console.log();
    console.log('2. If analytics are not showing:');
    console.log('   - Open browser DevTools (F12)');
    console.log('   - Check Console tab for JavaScript errors');
    console.log('   - Check Network tab for failed API requests to /api/surveys');
    console.log('   - Verify authentication (should be logged in as admin)');
  }

  console.log();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
