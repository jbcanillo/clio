import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders overlays at the end of <body>. The app's <main> is its own stacking context (relative z-10),
 * so a modal left inside it sits under the bottom navigation no matter its z-index.
 */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
}
