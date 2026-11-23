# Spike: CopilotKit runtime with OpenRouter (Task 10)

Date: 2026-11-23 · `@copilotkit/runtime` 1.90.0, `@ai-sdk/openai-compatible` 1.0.63, `ai` 6.0.336, Node 22.

## What was tried
1. **v1 API** (`CopilotRuntime` + `OpenAIAdapter` with a custom `openai` client and `baseURL`, mounted with
   `copilotRuntimeNodeExpressEndpoint`). In 1.90 the whole v1 SDK is marked deprecated and the endpoint now speaks the
   new single-route (AG-UI) protocol. The adapter path used the OpenAI **Responses** API, so a Chat Completions server
   failed with *"Received a Chat Completions stream while using the OpenAI Responses API"*.
2. **v2 API** (`@copilotkit/runtime/v2`): `CopilotRuntime({ agents: { default: new BuiltInAgent({ model, prompt, tools, maxSteps }) } })`
   served by `createCopilotExpressHandler({ runtime, basePath, mode: 'single-route' })`, with the model built from
   `createOpenAICompatible({ baseURL: 'https://openrouter.ai/api/v1', apiKey }).chatModel(modelId)` (Chat Completions). **This works.**

## Verified (against a local OpenAI-compatible stub, not the real OpenRouter)
- A streamed tool call from the model runs the server-side tool (`append_to_daily`) and writes to the vault.
- Upstream HTTP 401 becomes a `RUN_ERROR` event inside the 200 SSE stream; the key is not echoed.
- Express must restore `req.url = req.originalUrl` before delegating (the router matches on the full path).
- A body already parsed by `express.json()` is accepted by the handler.
- Wire format for tests: `POST { method: 'agent/run', params: { agentId: 'default' }, body: RunAgentInput }` → SSE of AG-UI events.

## Not verified
- Real OpenRouter (no key in the sandbox): model-specific tool-calling reliability, streaming quirks, `X-Title` handling.
- The browser side (`@copilotkit/react-core` 1.90 with the single-route client) is exercised in Task 11.

## Findings that affect the rest of the plan
- **System prompt lives on the server** (`BuiltInAgent.prompt`), so the prompt-injection rule cannot be edited from the browser.
- **Logging:** on a failed model call `BuiltInAgent` logs the whole request body (including the owner's messages) to the server's stderr.
  Container logs therefore contain diary text after a provider error. Documented in `docs/PRIVACY.md` (Task 20); consider log redaction.
- Pin `@copilotkit/*` to the same exact version; the v1 packages are deprecated and the v2 API is still moving.
