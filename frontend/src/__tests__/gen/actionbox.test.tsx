import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiActionBox } from '../../components/gen/AiActionBox';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('AiActionBox', () => {
  it('calls onRun once on click', async () => {
    const onRun = vi.fn();
    render(<AiActionBox actions={[{ label: 'Convert to 3 tasks', onRun }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Convert to 3 tasks' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('disables while pending then re-enables', async () => {
    const d = deferred();
    render(<AiActionBox actions={[{ label: 'Go', onRun: () => d.promise }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    d.resolve();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled());
  });

  it('shows alert and re-enables on rejection', async () => {
    const d = deferred();
    render(<AiActionBox actions={[{ label: 'Go', onRun: () => d.promise }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    d.reject(new Error('x'));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't do that.");
    expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled();
  });

  it('handles synchronous throws', async () => {
    render(<AiActionBox actions={[{ label: 'Go', onRun: () => { throw new Error('boom'); } }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't do that.");
    expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled();
  });

  it('renders nothing for empty actions', () => {
    const { container } = render(<AiActionBox title="T" actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('runs two actions independently and shows title', async () => {
    const d = deferred();
    const b = vi.fn();
    render(<AiActionBox title="Suggested" actions={[{ label: 'A', onRun: () => d.promise }, { label: 'B', onRun: b }]} />);
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(screen.getByRole('button', { name: 'A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'B' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(b).toHaveBeenCalledTimes(1);
    d.resolve();
  });
});
