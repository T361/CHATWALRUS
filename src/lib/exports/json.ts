// =============================================================================
// JSON Export Utility
// =============================================================================

/**
 * Create a Response object for JSON download.
 */
export function jsonResponse(data: unknown, filename: string): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
