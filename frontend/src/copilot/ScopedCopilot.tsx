import { CopilotKit, useCopilotReadable } from '@copilotkit/react-core';
import type { ReactNode } from 'react';
import { getToken } from '../lib/api';
import type { Scope } from '../lib/types';
import { newUuid } from '../lib/uuid';

const memoryIds: Partial<Record<Scope, string>> = {};

/**
 * Thread id for a scope: `clio-${scope}-${uuid}`. The uuid is created once per
 * scope and kept in sessionStorage (same lifetime as the auth token), so a reload
 * reconnects to the same thread. Falls back to an in-memory id if storage fails.
 */
export function getThreadId(scope: Scope): string {
  const key = `clio.thread.${scope}`;
  let id: string | null = null;
  try { id = sessionStorage.getItem(key); } catch { /* storage unavailable */ }
  if (!id) {
    id = memoryIds[scope] ?? newUuid();
    try { sessionStorage.setItem(key, id); } catch { /* storage unavailable */ }
  }
  memoryIds[scope] = id;
  return `clio-${scope}-${id}`;
}

function ScopeReadable({ scope }: { scope: Scope }) {
  useCopilotReadable({
    description: 'Which Clio screen the owner is on. This grants no extra permissions.',
    value: { scope },
  });
  return null;
}

/** One CopilotKit provider (own thread, tools, context) per Clio screen. */
export function ScopedCopilot({ scope, children }: { scope: Scope; children: ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      useSingleEndpoint
      threadId={getThreadId(scope)}
      headers={{ 'X-Session-Token': getToken() ?? '' }}
      enableInspector={false}
      showDevConsole={false}
    >
      <ScopeReadable scope={scope} />
      {children}
    </CopilotKit>
  );
}
