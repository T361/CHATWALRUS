// =============================================================================
// CSV Export Utility
// =============================================================================

/**
 * Convert an array of objects to CSV string.
 */
export function toCSV(data: Record<string, unknown>[], columns?: string[]): string {
  if (data.length === 0) return '';

  const headers = columns || Object.keys(data[0]);
  const headerRow = headers.map(escapeCSVField).join(',');

  const rows = data.map((row) =>
    headers.map((header) => escapeCSVField(String(row[header] ?? ''))).join(',')
  );

  return [headerRow, ...rows].join('\n');
}

function escapeCSVField(value: string): string {
  // Prevent formula injection (=, +, -, @ as first char trigger formula execution in Excel/LibreOffice)
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes("'")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Create a Response object for CSV download.
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
