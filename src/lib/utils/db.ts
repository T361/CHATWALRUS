export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const message = 'message' in error ? String(error.message || '') : '';
  const details = 'details' in error ? String(error.details || '') : '';
  const code = 'code' in error ? String(error.code || '') : '';
  const text = `${message} ${details}`.toLowerCase();

  return code === '42P01' || text.includes('does not exist') || text.includes('undefined_table');
}
