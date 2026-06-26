import { describe, it, expect } from 'vitest';
import { toCSV, csvResponse } from './csv';

// =============================================================================
// toCSV
// =============================================================================

describe('toCSV — empty input', () => {
  it('returns empty string for an empty array', () => {
    expect(toCSV([])).toBe('');
  });

  it('returns empty string for empty array even when columns are supplied', () => {
    expect(toCSV([], ['name', 'email'])).toBe('');
  });
});

describe('toCSV — header row', () => {
  it('derives headers from the first object keys when no columns argument is given', () => {
    const result = toCSV([{ name: 'Alice', age: 30 }]);
    const firstLine = result.split('\n')[0];
    expect(firstLine).toBe('name,age');
  });

  it('uses the supplied columns array as headers', () => {
    const result = toCSV([{ name: 'Alice', age: 30 }], ['age', 'name']);
    const firstLine = result.split('\n')[0];
    expect(firstLine).toBe('age,name');
  });

  it('all column names are present in the header row', () => {
    const data = [{ id: 1, name: 'Alice', role: 'admin' }];
    const result = toCSV(data);
    const header = result.split('\n')[0];
    expect(header).toContain('id');
    expect(header).toContain('name');
    expect(header).toContain('role');
  });

  it('header names match data keys exactly', () => {
    const data = [{ firstName: 'Alice', lastName: 'Smith' }];
    const result = toCSV(data);
    expect(result.split('\n')[0]).toBe('firstName,lastName');
  });
});

describe('toCSV — normal rows', () => {
  it('produces comma-separated values for a simple row', () => {
    const result = toCSV([{ name: 'Alice', city: 'London' }]);
    const dataRow = result.split('\n')[1];
    expect(dataRow).toBe('Alice,London');
  });

  it('total line count equals rows + 1 (header)', () => {
    const data = [
      { name: 'Alice' },
      { name: 'Bob' },
      { name: 'Charlie' },
    ];
    expect(toCSV(data).split('\n')).toHaveLength(4);
  });

  it('each row contains all columns in the correct order', () => {
    const result = toCSV([{ a: '1', b: '2', c: '3' }]);
    expect(result.split('\n')[1]).toBe('1,2,3');
  });
});

describe('toCSV — field escaping: comma', () => {
  it('wraps a field containing a comma in double-quotes', () => {
    const result = toCSV([{ address: '123 Main St, Suite 4' }]);
    const dataRow = result.split('\n')[1];
    expect(dataRow).toBe('"123 Main St, Suite 4"');
  });

  it('keeps surrounding quotes so the field is still one CSV cell', () => {
    const result = toCSV([{ a: 'hello, world', b: 'plain' }]);
    const dataRow = result.split('\n')[1];
    expect(dataRow).toBe('"hello, world",plain');
  });
});

describe('toCSV — field escaping: double-quote', () => {
  it('wraps a field containing a double-quote in quotes and escapes the inner quote', () => {
    const result = toCSV([{ note: 'She said "hi"' }]);
    const dataRow = result.split('\n')[1];
    expect(dataRow).toBe('"She said ""hi"""');
  });

  it('escapes multiple double-quotes in a single field', () => {
    const result = toCSV([{ q: '"a" and "b"' }]);
    const dataRow = result.split('\n')[1];
    expect(dataRow).toBe('"""a"" and ""b"""');
  });
});

describe('toCSV — field escaping: newline', () => {
  it('wraps a field containing a newline character in double-quotes', () => {
    const result = toCSV([{ bio: 'line one\nline two' }]);
    // The result is "header\n\"line one\nline two\"" — splitting on \n naively
    // would split inside the quoted field, so we check the raw string instead.
    expect(result).toContain('"line one\nline two"');
  });

  it('a field with both newline and comma is still a single quoted cell', () => {
    const result = toCSV([{ text: 'a,\nb' }]);
    // After header row (index 0) the field is at index 1 but it spans two
    // physical newlines — the raw string still round-trips correctly
    expect(result).toContain('"a,\nb"');
  });
});

describe('toCSV — null and undefined values', () => {
  it('renders null as an empty string', () => {
    const result = toCSV([{ name: null }]);
    expect(result.split('\n')[1]).toBe('');
  });

  it('renders undefined as an empty string', () => {
    const result = toCSV([{ name: undefined }]);
    expect(result.split('\n')[1]).toBe('');
  });

  it('renders missing key (implicitly undefined) as an empty string', () => {
    const data = [{ name: 'Alice', score: undefined as unknown as string }];
    const result = toCSV(data, ['name', 'score']);
    const cells = result.split('\n')[1].split(',');
    expect(cells[1]).toBe('');
  });
});

describe('toCSV — type coercion', () => {
  it('stringifies integer numbers', () => {
    const result = toCSV([{ count: 42 }]);
    expect(result.split('\n')[1]).toBe('42');
  });

  it('stringifies float numbers', () => {
    const result = toCSV([{ ratio: 3.14 }]);
    expect(result.split('\n')[1]).toBe('3.14');
  });

  it('renders boolean true as "true"', () => {
    const result = toCSV([{ active: true }]);
    expect(result.split('\n')[1]).toBe('true');
  });

  it('renders boolean false as "false"', () => {
    const result = toCSV([{ active: false }]);
    expect(result.split('\n')[1]).toBe('false');
  });

  it('renders zero as "0"', () => {
    const result = toCSV([{ score: 0 }]);
    expect(result.split('\n')[1]).toBe('0');
  });
});

describe('toCSV — CSV injection', () => {
  it('field starting with "=" is prefixed with apostrophe to neutralise formula injection', () => {
    const result = toCSV([{ formula: '=SUM(A1:A10)' }]);
    const dataRow = result.split('\n')[1];
    // Prefixed with ' then wrapped in quotes because it now contains a quote char
    expect(dataRow).toBe('"\'=SUM(A1:A10)"');
  });

  it('field starting with "+" is prefixed with apostrophe', () => {
    const result = toCSV([{ val: '+1234' }]);
    expect(result.split('\n')[1]).toBe('"\'+1234"');
  });

  it('field starting with "-" is prefixed with apostrophe', () => {
    const result = toCSV([{ val: '-DROP TABLE' }]);
    expect(result.split('\n')[1]).toBe('"\'-DROP TABLE"');
  });

  it('field starting with "@" is prefixed with apostrophe', () => {
    const result = toCSV([{ email: '@handle' }]);
    expect(result.split('\n')[1]).toBe('"\'@handle"');
  });

  it('field starting with "|" is output as-is', () => {
    const result = toCSV([{ cmd: '|ls' }]);
    expect(result.split('\n')[1]).toBe('|ls');
  });
});

describe('toCSV — Unicode', () => {
  it('preserves CJK characters', () => {
    const result = toCSV([{ name: '田中太郎' }]);
    expect(result.split('\n')[1]).toBe('田中太郎');
  });

  it('preserves Arabic script', () => {
    const result = toCSV([{ label: 'مرحبا' }]);
    expect(result.split('\n')[1]).toBe('مرحبا');
  });

  it('preserves emoji characters', () => {
    const result = toCSV([{ tag: '🚀' }]);
    expect(result.split('\n')[1]).toBe('🚀');
  });

  it('preserves accented Latin characters', () => {
    const result = toCSV([{ city: 'São Paulo' }]);
    expect(result.split('\n')[1]).toBe('São Paulo');
  });
});

describe('toCSV — large dataset', () => {
  it('produces exactly 1001 lines for 1000 rows (1 header + 1000 data)', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      score: i * 0.5,
    }));
    const lines = toCSV(data).split('\n');
    expect(lines).toHaveLength(1001);
  });

  it('each data row in a large dataset contains the correct number of commas', () => {
    const columns = ['id', 'name', 'email', 'score', 'active'];
    const data = Array.from({ length: 500 }, (_, i) => ({
      id: i,
      name: `User${i}`,
      email: `user${i}@example.com`,
      score: i % 100,
      active: i % 2 === 0,
    }));
    const lines = toCSV(data, columns).split('\n');
    // Skip header (index 0); every data row should have 4 commas (5 fields)
    for (let i = 1; i < lines.length; i++) {
      const commaCount = (lines[i].match(/,/g) ?? []).length;
      expect(commaCount).toBe(4);
    }
  });
});

describe('toCSV — columns argument controls output shape', () => {
  it('excludes keys not listed in columns', () => {
    const result = toCSV([{ name: 'Alice', secret: 'hidden', age: 30 }], ['name', 'age']);
    expect(result).not.toContain('hidden');
    expect(result).not.toContain('secret');
  });

  it('uses empty string for a column key absent from a row', () => {
    const data = [{ name: 'Alice' }] as Record<string, unknown>[];
    const result = toCSV(data, ['name', 'missing']);
    const cells = result.split('\n')[1].split(',');
    expect(cells[1]).toBe('');
  });

  it('repeats a column if listed twice (documents behaviour, not an error)', () => {
    const result = toCSV([{ name: 'Alice' }], ['name', 'name']);
    expect(result.split('\n')[1]).toBe('Alice,Alice');
  });
});

describe('toCSV — mixed special characters in same row', () => {
  it('handles a row where some fields need quoting and some do not', () => {
    const result = toCSV([{ plain: 'hello', tricky: 'a,b', normal: 'world' }]);
    expect(result.split('\n')[1]).toBe('hello,"a,b",world');
  });

  it('handles a row with quotes, commas, and plain fields together', () => {
    const result = toCSV([{ a: 'say "yes"', b: 'x,y', c: 'plain' }]);
    expect(result.split('\n')[1]).toBe('"say ""yes""","x,y",plain');
  });
});

// =============================================================================
// csvResponse
// =============================================================================

describe('csvResponse', () => {
  it('returns a Response instance', () => {
    const res = csvResponse('col\nval', 'data.csv');
    expect(res).toBeInstanceOf(Response);
  });

  it('sets Content-Type to text/csv with utf-8 charset', () => {
    const res = csvResponse('col\nval', 'data.csv');
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });

  it('sets Content-Disposition to attachment with the supplied filename', () => {
    const res = csvResponse('col\nval', 'export.csv');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="export.csv"');
  });

  it('body contains the exact CSV string passed in', async () => {
    const csv = 'name,age\nAlice,30';
    const res = csvResponse(csv, 'test.csv');
    const body = await res.text();
    expect(body).toBe(csv);
  });

  it('works with an empty CSV string', async () => {
    const res = csvResponse('', 'empty.csv');
    const body = await res.text();
    expect(body).toBe('');
  });

  it('filename with spaces is enclosed correctly in the header', () => {
    const res = csvResponse('a', 'my report.csv');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="my report.csv"');
  });
});
