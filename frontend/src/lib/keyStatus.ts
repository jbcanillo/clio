/** Result of POST /api/settings/test-key. */
export interface KeyTest {
  ok: boolean;
  error?: string;
  model?: string;
}

/** Turns the backend's OpenRouter key test into a reason the owner can act on (null: no better reason known). */
export function failureReason(test: KeyTest): string | null {
  if (test.ok) return null;
  switch (test.error) {
    case 'no_key':
      return 'No OpenRouter API key is set. Add one in Settings.';
    case 'openrouter_401':
    case 'openrouter_403':
      return 'OpenRouter rejected the API key (it may be revoked or mistyped). Add a new key in Settings.';
    case 'openrouter_402':
      return 'Your OpenRouter account is out of credits. Top up, or pick a free model in Settings.';
    case 'model_not_found':
      return `OpenRouter has no model called "${test.model ?? '?'}". Pick another model in Settings.`;
    case 'model_no_tools':
      return `The model "${test.model ?? '?'}" can't use tools, which Clio needs to manage notes and reminders. Pick another model in Settings (for example nvidia/nemotron-3-ultra-550b-a55b:free).`;
    case 'network':
      return "Clio's server couldn't reach OpenRouter. Check its internet connection.";
    default:
      return test.error ? `OpenRouter key check failed (${test.error}). Check Settings.` : null;
  }
}
