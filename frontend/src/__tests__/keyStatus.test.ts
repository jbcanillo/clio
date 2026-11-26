import { describe, expect, it } from 'vitest';
import { failureReason } from '../lib/keyStatus';

describe('failureReason', () => {
  it('has nothing to add when the key works', () => {
    expect(failureReason({ ok: true })).toBeNull();
  });
  it('explains a rejected key (OpenRouter 401 "User not found")', () => {
    expect(failureReason({ ok: false, error: 'openrouter_401' })).toMatch(/rejected the API key/);
  });
  it('explains a missing key, no credits and no network', () => {
    expect(failureReason({ ok: false, error: 'no_key' })).toMatch(/No OpenRouter API key/);
    expect(failureReason({ ok: false, error: 'openrouter_402' })).toMatch(/out of credits/);
    expect(failureReason({ ok: false, error: 'network' })).toMatch(/couldn't reach OpenRouter/);
  });
  it('explains an unknown model and a model without tool support', () => {
    expect(failureReason({ ok: false, error: 'model_not_found', model: 'no/such' })).toMatch(/no model called "no\/such"/);
    expect(failureReason({ ok: false, error: 'model_no_tools', model: 'perplexity/pplx-decider-v1.3:free' })).toMatch(/can't use tools/);
  });
  it('falls back to the raw code for anything else', () => {
    expect(failureReason({ ok: false, error: 'openrouter_500' })).toMatch(/openrouter_500/);
    expect(failureReason({ ok: false })).toBeNull();
  });
});
