import { describe, it, expect } from 'vitest';
import { generateSlug, isValidSlug } from './slug';

describe('generateSlug', () => {
  it('lowercases and trims', () => {
    expect(generateSlug('  Acme Corp  ')).toBe('acme-corp');
  });

  it('replaces spaces with hyphens', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('strips special characters', () => {
    expect(generateSlug('Acme & Co.')).toBe('acme-co');
  });

  it('collapses multiple spaces', () => {
    expect(generateSlug('Big   Company')).toBe('big-company');
  });

  it('removes leading/trailing hyphens', () => {
    expect(generateSlug('---test---')).toBe('test');
  });

  it('handles underscores as hyphens', () => {
    expect(generateSlug('hello_world')).toBe('hello-world');
  });

  it('preserves numbers', () => {
    expect(generateSlug('Company 2024')).toBe('company-2024');
  });

  it('handles empty string', () => {
    expect(generateSlug('')).toBe('');
  });
});

describe('isValidSlug', () => {
  it('accepts simple lowercase slugs', () => {
    expect(isValidSlug('hello')).toBe(true);
    expect(isValidSlug('hello-world')).toBe(true);
    expect(isValidSlug('company-2024')).toBe(true);
  });

  it('rejects uppercase', () => {
    expect(isValidSlug('Hello')).toBe(false);
  });

  it('rejects leading hyphens', () => {
    expect(isValidSlug('-hello')).toBe(false);
  });

  it('rejects trailing hyphens', () => {
    expect(isValidSlug('hello-')).toBe(false);
  });

  it('rejects consecutive hyphens', () => {
    expect(isValidSlug('hello--world')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(isValidSlug('hello world')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidSlug('')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValidSlug('hello_world')).toBe(false);
    expect(isValidSlug('hello.world')).toBe(false);
  });
});
