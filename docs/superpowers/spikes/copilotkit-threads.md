# Spike: per-thread CopilotKit providers (@copilotkit/react-core 1.90.0)

**Result: PASS (independent).** Two `<CopilotKit threadId=...>` providers mounted at the same time keep separate message lists, separate tools, separate readable context and separate loading/stop/reset state.

Method: there was no browser, so the spike ran as a throwaway vitest/jsdom test. `fetch` was stubbed to act as the single-route runtime: `info` returned JSON, `agent/connect` returned an empty SSE stream, and `agent/run` returned scripted AG-UI SSE events. Two providers (`thread-a`, `thread-b`) were rendered side by side. The test is deleted; this doc keeps what it showed. I also read the installed source under `frontend/node_modules/@copilotkit/**` to confirm each finding. File references below point into `react-core/dist`.

> **Correction to the plan/brief:** in 1.90.0, `useCopilotChat().visibleMessages` is **`undefined`**. `useCopilotChatInternal` never returns a `visibleMessages` key (`index.mjs` L290-309), and `useCopilotChat` only destructures it (L352). There is no `ActionExecutionMessage` in the headless list. Use `useCopilotChatInternal()` (below) instead. Spike log: `useCopilotChat keys: [visibleMessages, appendMessage, …] visibleMessages= undefined`.

## (a) Are two providers independent? What props do they need?

Yes, and the code shows why:

- `CopilotKit` → `ThreadsProvider threadId={props.threadId}` → v2 `CopilotKitProvider` → `CopilotKitInternal` (`copilotkit-CslZDEfY.mjs` L14232-14256).
- Each `CopilotKitProvider` creates **its own** `CopilotKitCoreReact` in a `useRef` (L3269, L3453-3471). That core fetches `info` and creates its own `ProxiedCopilotRuntimeAgent` for each runtime agent (`@copilotkit/core` `index.mjs` L3198-3240). Agent instances, and so `agent.messages`, are never shared between providers.
- `CopilotKitInternal` wraps its children in `CopilotChatConfigurationProvider agentId threadId hasExplicitThreadId` (L14689-14692). `useAgent` writes that thread id onto the agent: `agent.threadId = resolvedThreadId` (L5064-5070).
- Spike evidence: the log showed `info` twice (once per core), then `agent/connect:thread-a` and `agent/connect:thread-b`. After sending in A, A held `[user:hi a, assistant:reply in thread-a]` and B was empty. After sending in B, B held only its own messages, and the B `agent/run` body's `messages` was just `['plain b']`. Run bodies carried `threadId: 'thread-a'` / `'thread-b'`. `reset()` in B emptied B and left A alone. A hanging run in B set B `isLoading=true` while A stayed `false`.

Props each provider needs (same as the current `CopilotShell`):

```tsx
<CopilotKit
  runtimeUrl="/api/copilotkit"
  useSingleEndpoint            // => runtimeTransport "single" (L3457); backend is mode:'single-route'
  threadId={threadId}          // explicit; persist it per scope to keep history
  headers={{ 'X-Session-Token': getToken() ?? '' }}  // confirmed sent on agent/run
  showDevConsole={false}
  enableInspector={false}
>
```

- `agent` is optional. It defaults to `"default"` (L14690), which matches the backend's single `default` agent. Do not pass it.
- `runtimeUrl` is required unless `publicApiKey` is set (`validateProps`, L14741).
- Cost: each provider makes its own `info` + `agent/connect` request when it mounts. Four tabs means four of each.

**History persistence:** on mount the client calls `agent/connect` with the thread id. The backend runtime uses the default `InMemoryAgentRunner`, whose thread store is module-global (`ɵGLOBAL_STORE`, `@copilotkit/runtime/dist/v2/runtime/runner/in-memory.mjs` L407). So history for a persisted `threadId` is replayed as long as the backend process is alive, even though `runtime.js` builds a new `CopilotRuntime` on every request. It is lost when the backend restarts. **Unverified:** I did not exercise a real backend replay in this spike.

## (b) Headless API in 1.90.0

Use **`useCopilotChatInternal`** from `@copilotkit/react-core`. It is exported in JS and `.d.mts` and typechecks under `strict`.

- `useCopilotChat()` drops `messages`/`sendMessage`, and its `visibleMessages` is undefined.
- `useCopilotChatHeadless_c()` returns a non-functional stub unless `publicApiKey` is set (L563-579). Do not use it; it needs a cloud license.

```tsx
import { useCopilotChatInternal } from '@copilotkit/react-core';
import type { AIMessage, Message } from '@copilotkit/shared';

const { messages, sendMessage, appendMessage, isLoading, isAvailable, stopGeneration, reset, reloadMessages, setMessages } =
  useCopilotChatInternal();
```

| Need | API | Notes |
|---|---|---|
| Message list | `messages: Message[]` (AG-UI format) | Roles are `user` / `assistant` / `tool` / …. `content` is a string for text. Assistant tool calls have `toolCalls: [{id, type:'function', function:{name, arguments}}]` and an `AIMessage.generativeUI?: () => ReactNode`. Filter out `role === 'tool'` when rendering. |
| Send (preferred) | `sendMessage({ id: crypto.randomUUID(), role: 'user', content: 'hi' })` | Plain object, no extra import. Does `agent.addMessage` + `copilotkit.runAgent` (L141-164). `options.followUp:false` skips the run. |
| Send (legacy) | `appendMessage(new TextMessage({ role: Role.User, content: 'hi' }))` | Converted with `gqlToAGUI` (L165-167). `import { Role, TextMessage } from '@copilotkit/runtime-client-gql'`. That package (1.90.0) is only a **transitive** dependency, not in `frontend/package.json`. ChatPage already relies on it. Prefer `sendMessage`. |
| Loading | `isLoading` (`Boolean(agent.isRunning)`) | Per provider, as shown above. Note: it is `false` while a HITL card waits for `respond` (spike: `hitl status=executing isLoading=false`). |
| Ready | `isAvailable` | `true` once `connectAgent` succeeds. Use it to gate the send button. |
| Stop | `stopGeneration()` → `agent.abortRun()` | In single-route mode this sends `POST {method:'agent/stop', params:{agentId:'default', threadId}, body:{runId}}`. The **server** ends the stream; the client does not abort locally (`@copilotkit/core` `index.mjs` L1683-1716). The spike confirmed the request shape and that `isLoading` went back to `false` once the stream finished. The backend runtime has an `agent/stop` route (`runtime/core/fetch-handler.mjs` L281). **Unverified:** whether stop reaches the run when the backend builds a new `CopilotRuntime`/runner per request. |
| Reset | `reset()` | `agent.setMessages([]); agent.setState(null)` (L94-97). Local only, and only this provider. |

## (c) Rendering an action's `render` / `renderAndWaitForResponse` inline

`useCopilotChatInternal` attaches `generativeUI` to every assistant message (L205-237).

- For a message with `toolCalls`, `generativeUI()` returns the registered renderers' output for those tool calls (`useLazyToolRenderer`, L23-40).
- Otherwise it is a coagent-state bridge that usually renders nothing.
- So **check the rendered output, not whether `generativeUI` exists.** The spike saw an empty `generativeUI` wrapper on a plain text reply.

```tsx
{messages.filter(m => m.role !== 'tool').map(m => (
  <Row key={m.id} msg={m}>
    {typeof m.content === 'string' && m.content && <Text>{m.content}</Text>}
    {m.role === 'assistant' && (m as AIMessage).generativeUI?.()}
  </Row>
))}
```

- **`render` (display-only):** status is `inProgress` while args stream and `complete` once a tool result exists for that `toolCallId`, i.e. the server sent `TOOL_CALL_RESULT`.
  - Spike: with no result the card stayed at `card:inProgress:Hello`; after a `TOOL_CALL_RESULT` it showed `card:complete:Hello`.
  - `result` reaches `render` already JSON-parsed (L673-683).
- **`renderAndWaitForResponse` (HITL):** registered through v2 `useHumanInTheLoop`. `respond` is passed **only while `status === 'executing'`**; otherwise it is `undefined` (`copilotkit-CslZDEfY.mjs` L3389-3395).
  - Calling `respond(value)` resolves the pending tool. The client adds a `{role:'tool', toolCallId, content: value}` message and **automatically starts a follow-up `agent/run`**.
  - Spike: the follow-up body ended with `…assistant(toolCalls ask_confirm), tool{content:'yes-confirmed'}`. The card then rendered `status=complete`.
  - Write the card as `onClick={() => respond?.(…)}` and disable it unless `status === 'executing'`.
- The renderer lookup is per provider. A tool call in thread A renders nothing in B, and B never sees A's tools.

## (d) Registering actions per scope, and `available`

The spike's `agent/run` bodies showed `tools` for A as `['ask_confirm','frontend_tool']` and for B as `[]`, with no actions in B. **Mount a scope's actions only inside that scope's provider**, because tools are per core.

`available` behaviour (`index.mjs` `getActionConfig`, L918-965):

- `available: 'disabled'` or `'frontend'` with `render` → **render-only**. The tool is not sent to the model; its renderer is still registered.
  - Spike: `show_card` was missing from `tools` yet still rendered when the server emitted a `show_card` tool call.
  - Use this for backend-executed tools whose output should appear as a card.
- `available: 'enabled'`/`'remote'`, or a `handler` with no `available` → frontend tool, which is sent to the model.
- `renderAndWaitForResponse` / `renderAndWait` → HITL. **It ignores `available`** because the HITL check runs first, so the tool is always sent. To hide a HITL action from a scope, don't mount it there.
- **Toggling `available` between `'enabled'` and `'disabled'` at runtime throws** `"Action configuration changed between renders"`. The hook type would switch frontend↔render, and the hook compares against its first config (L977-990). Decide per scope at mount time, using separate components or mount/unmount.
- In core, tools with `available === false`/`'disabled'` are filtered out of the run (`@copilotkit/core` `index.mjs` L5470).

## (e) Is `useCopilotReadable` scoped to the nearest provider?

Yes. It calls `copilotkit.addContext` on the core from the nearest provider (`index.mjs` L1220-1244), and each provider has its own core.

- Spike: A's run `context` was `['scope-a']` and B's was `['scope-b']`.
- `available: 'disabled'` on a readable removes it, and it can be toggled at runtime. Unlike actions, this does not throw.

## Decisions for tasks 12-14

1. Each tab mounts its own `<CopilotKit … threadId={persistedThreadId(scope)}>` with the props above, plus that scope's actions and readables inside it.
2. `ClioChat` uses `useCopilotChatInternal()`: `messages`, `sendMessage`, `isLoading`, `isAvailable`, `stopGeneration`, `reset`. Render `AIMessage.generativeUI?.()` inline, and skip `role:'tool'` messages.
3. For component tests, mock `useCopilotChatInternal` (not `useCopilotChat`). It returns `messages` in AG-UI shape.
4. Optional cleanup: add `@copilotkit/runtime-client-gql@1.90.0` and `@copilotkit/shared@1.90.0` as direct dependencies if their imports remain. `@copilotkit/shared` is only needed for the `AIMessage` type.
