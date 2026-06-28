const UTF8_BOM = '﻿';

// snake_case / camelCase → "Title Case"
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function escapeCSVField(value: string): string {
  // Prevent formula injection (=, +, -, @ as first char trigger formula execution in Excel/LibreOffice)
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes("'")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    return new Date(v).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  return String(v);
}

export function toCSV(
  data: Record<string, unknown>[],
  columns?: string[],
  humanHeaders = true,
): string {
  if (data.length === 0) return '';

  const keys = columns || Object.keys(data[0]);
  const headerRow = keys.map((k) => escapeCSVField(humanHeaders ? humanizeKey(k) : k)).join(',');
  const rows = data.map((row) => keys.map((key) => escapeCSVField(formatValue(row[key]))).join(','));

  return UTF8_BOM + [headerRow, ...rows].join('\r\n');
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
