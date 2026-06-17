import 'server-only';

import { invalidateCachePrefix } from './serverCache';

export function invalidateDashboardCaches() {
  invalidateCachePrefix('companies:');
  invalidateCachePrefix('learners:');
  invalidateCachePrefix('courses:');
  invalidateCachePrefix('settings-status:');
  invalidateCachePrefix('zoom:');
}
