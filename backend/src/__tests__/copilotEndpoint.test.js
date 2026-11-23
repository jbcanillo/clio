import { makeApi } from './helpers/api.js';
import { startFakeOpenRouter } from './helpers/fakeOpenRouter.js';
import { createShareSession } from '../services/shareSession.js';

// CopilotKit 1.90 speaks the AG-UI single-route protocol: POST { method, params, body }.
const run = (text) => ({
  method: 'agent/run',
  params: { agentId: 'default' },
  body: {
    threadId: 't1', runId: 'r1', state: {}, tools: [], context: [], forwardedProps: {},
    messages: [{ id: 'm1', role: 'user', content: text }],
  },
});

async function setup(script, withKey = true) {
  const fake = await startFakeOpenRouter(script);
  const shareSession = createShareSession();
  const api = await makeApi({ shareSession, openrouterBaseUrl: fake.url });
  if (withKey) api.deps.settings.update({ openrouterKey: 'sk-or-test' });
  return { ...api, fake };
}

describe('copilot endpoint', () => {
  it('answers 503 openrouter_not_configured when no key is set', async () => {
    const { as, fake } = await setup([{ text: 'hi' }], false);
    const res = await as('post', '/api/copilotkit').send(run('hello'));
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('openrouter_not_configured');
    await fake.close();
  });
  it('rejects bodies over 100 KB with 413', async () => {
    const { as, fake } = await setup([{ text: 'hi' }]);
    const res = await as('post', '/api/copilotkit').set('Content-Type', 'application/json').send(JSON.stringify({ pad: 'x'.repeat(120 * 1024) }));
    expect(res.status).toBe(413);
    await fake.close();
  });
  it('runs a tool call end to end: model -> append_to_daily -> vault', async () => {
    const { as, fake, deps } = await setup([
      { toolCall: { name: 'append_to_daily', args: { section: 'thoughts', text: 'Felt calm today', date: '2026-11-23' } } },
      { text: 'Saved.' },
    ]);
    const res = await as('post', '/api/copilotkit').send(run('note: felt calm today'));
    expect(res.status).toBe(200);
    expect((await deps.daily.get('2026-11-23')).body).toContain('Felt calm today');
    expect(fake.requests[0].auth).toBe('Bearer sk-or-test');
    await fake.close();
  });
  it('reports an upstream 401 as a RUN_ERROR event in the stream, never leaks the key, and keeps serving', async () => {
    const { as, fake } = await setup([{ status: 401 }]);
    const res = await as('post', '/api/copilotkit').send(run('hello'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('RUN_ERROR');
    expect(res.text).not.toContain('sk-or-test');
    expect((await as('get', '/health')).status).toBe(200);
    await fake.close();
  });
});
