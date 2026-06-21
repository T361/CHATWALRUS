import { describe, it, expect, vi } from 'vitest';

// Mock heavy server-side deps before importing the module under test
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/perf', () => ({ withServerTiming: vi.fn() }));
vi.mock('@/lib/utils/db', () => ({ isMissingRelationError: vi.fn() }));
vi.mock('@/lib/cache/serverCache', () => ({ readThroughTtlCache: vi.fn() }));

import { normalizeRole } from './directory';

describe('normalizeRole', () => {
  it('maps null to Other', () => {
    expect(normalizeRole(null)).toBe('Other');
  });

  it('maps empty string to Other', () => {
    expect(normalizeRole('')).toBe('Other');
  });

  it('falls back to department when title is null', () => {
    expect(normalizeRole(null, 'Sales')).toBe('Sales');
    expect(normalizeRole(null, 'Operations')).toBe('Operations');
    expect(normalizeRole(null, 'Finance')).toBe('Finance');
  });

  it('prefers title over department', () => {
    expect(normalizeRole('Marketing Manager', 'Sales')).toBe('Marketing');
  });

  describe('Sales', () => {
    it.each([
      'Sales Manager',
      'Account Executive',
      'Account Manager',
      'Business Development Rep',
      'SDR',
      'BDR',
    ])('maps "%s" → Sales', (title) => {
      expect(normalizeRole(title)).toBe('Sales');
    });
  });

  describe('Finance', () => {
    it.each([
      'Finance Manager',
      'Accounting Manager',
      'Corporate Controller',
      'Treasurer',
      'Internal Auditor',
      'FP&A Analyst',
    ])('maps "%s" → Finance', (title) => {
      expect(normalizeRole(title)).toBe('Finance');
    });
  });

  describe('Marketing', () => {
    it.each([
      'Marketing Director',
      'Brand Manager',
      'Growth Hacker',
      'SEO Specialist',
      'Social Media Manager',
      'Digital Marketing Lead',
    ])('maps "%s" → Marketing', (title) => {
      expect(normalizeRole(title)).toBe('Marketing');
    });
  });

  describe('Operations', () => {
    it.each([
      'Operations Manager',
      'Supply Chain Analyst',
      'Logistics Coordinator',
      'Procurement Lead',
      'Warehouse Supervisor',
    ])('maps "%s" → Operations', (title) => {
      expect(normalizeRole(title)).toBe('Operations');
    });
  });

  describe('HR', () => {
    it.each([
      'HR Business Partner',
      'Human Resources Manager',
      'People Operations Manager',
      'Talent Acquisition',
      'Recruiting Manager',
    ])('maps "%s" → HR', (title) => {
      expect(normalizeRole(title)).toBe('HR');
    });
  });

  describe('IT', () => {
    it.each([
      'Software Engineer',
      'IT Manager',
      'Data Analyst',
      'Technology Lead',
      'Systems Administrator',
      'Developer',
    ])('maps "%s" → IT', (title) => {
      expect(normalizeRole(title)).toBe('IT');
    });
  });

  describe('Creative', () => {
    it.each([
      'Graphic Designer',
      'Content Writer',
      'UX Designer',
      'Creative Director',
      'Copywriter',
      'Video Producer',
    ])('maps "%s" → Creative', (title) => {
      expect(normalizeRole(title)).toBe('Creative');
    });
  });

  describe('Product', () => {
    it.each([
      'Product Manager',
      'PM',
      'Product Owner',
    ])('maps "%s" → Product', (title) => {
      expect(normalizeRole(title)).toBe('Product');
    });
  });

  describe('Other', () => {
    it.each([
      'CEO',
      'Executive Assistant',
      'Office Manager',
      'Receptionist',
    ])('maps "%s" → Other', (title) => {
      expect(normalizeRole(title)).toBe('Other');
    });
  });
});
