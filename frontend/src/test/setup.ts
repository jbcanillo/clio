import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Existing tests were written for Jest; keep `jest.fn()` / `jest.mock()` working.
(globalThis as unknown as { jest: typeof vi }).jest = vi;
