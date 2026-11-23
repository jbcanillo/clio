import { CopilotKit } from '@copilotkit/react-core';
import type { ReactNode } from 'react';
import { getToken } from '../lib/api';

/** Connects the chat to the Clio backend (CopilotKit single-route protocol). */
export function CopilotShell({ children }: { children: ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" useSingleEndpoint enableInspector={false} showDevConsole={false} headers={{ 'X-Session-Token': getToken() ?? '' }}>
      {children}
    </CopilotKit>
  );
}
