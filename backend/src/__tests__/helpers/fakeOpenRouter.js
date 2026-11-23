import http from 'node:http';

/**
 * Minimal OpenAI-compatible /chat/completions server (streaming).
 * `script` is a list of replies used in order; the last one repeats.
 *  { text } | { toolCall: {name, args} } | { status: 401 }
 * Records every request body in `requests`.
 */
export async function startFakeOpenRouter(script) {
  const requests = [];
  let call = 0;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch { /* ignore */ }
      requests.push({ url: req.url, auth: req.headers.authorization, body });
      const reply = script[Math.min(call++, script.length - 1)];
      if (reply.status) {
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'fake upstream error', code: reply.status } }));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta, finish = null) =>
        res.write(`data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: body.model || 'm', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      if (reply.toolCall) {
        chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: reply.toolCall.name, arguments: JSON.stringify(reply.toolCall.args) } }] });
        chunk({}, 'tool_calls');
      } else {
        chunk({ role: 'assistant', content: reply.text });
        chunk({}, 'stop');
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/v1`, requests, close: () => new Promise((r) => server.close(r)) };
}
