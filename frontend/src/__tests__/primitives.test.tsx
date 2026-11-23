import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip } from '../components/ui/Chip';
import { AiBadge } from '../components/ui/AiBadge';
import { CircleCheck } from '../components/ui/CircleCheck';
import { Sheet } from '../components/ui/Sheet';

describe('Chip', () => {
  it('is a button with aria-pressed when onClick given', async () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick} selected>Work</Chip>);
    const b = screen.getByRole('button', { name: 'Work' });
    expect(b).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalled();
  });
  it('is not a button without onClick', () => {
    render(<Chip>Plain</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('AiBadge', () => {
  it('shows default label', () => {
    render(<AiBadge />);
    expect(screen.getByText('AI Synthesized')).toBeInTheDocument();
  });
});

describe('CircleCheck', () => {
  it('toggles on click and Space and exposes aria-checked', async () => {
    const onChange = vi.fn();
    render(<CircleCheck checked={false} onChange={onChange} label="Buy milk" />);
    const c = screen.getByRole('checkbox', { name: 'Buy milk' });
    expect(c).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(c);
    expect(onChange).toHaveBeenLastCalledWith(true);
    c.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(2);
  });
  it('reports checked', () => {
    render(<CircleCheck checked onChange={() => {}} label="x" />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });
  it('blocks changes when disabled', async () => {
    const onChange = vi.fn();
    render(<CircleCheck checked={false} onChange={onChange} label="x" disabled />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={() => {}} title="T">body</Sheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('is a labelled modal dialog, focuses in, closes on Escape and backdrop, restores focus', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<button>opener</button>);
    const opener = screen.getByText('opener');
    opener.focus();
    rerender(<><button>opener</button><Sheet open onClose={onClose} title="Edit">body</Sheet></>);
    const d = screen.getByRole('dialog', { name: 'Edit' });
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<><button>opener</button><Sheet open={false} onClose={onClose} title="Edit">body</Sheet></>);
    expect(document.activeElement).toBe(screen.getByText('opener'));
  });
});
