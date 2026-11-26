import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip } from '../components/ui/Chip';
import { AiBadge } from '../components/ui/AiBadge';
import { CircleCheck } from '../components/ui/CircleCheck';
import { Sheet } from '../components/ui/Sheet';
import config from '../../tailwind.config.cjs?raw';

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
    expect(screen.getByText('Clio')).toBeInTheDocument();
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

// vitest runs with css:false, so ?raw yields '' for .css; read it from disk instead.
// @ts-ignore node builtins are not in this project's type roots
const { readFileSync } = await import('node:fs');
const css: string = readFileSync('src/index.css', 'utf8').replace(/\r\n/g, '\n');

describe('dark-mode neutral tokens', () => {
  const keys = ['canvas', 'card', 'inset', 'hairline', 'DEFAULT', 'soft', 'muted'];
  const refs = keys.map((k) => {
    const m = config.match(new RegExp(String.raw`\b${k}: 'rgb\(var\((--[a-z-]+-rgb)\) / <alpha-value>\)'`));
    return { key: k, name: m?.[1] };
  });

  it('resolves neutrals to CSS variables', () => {
    for (const r of refs) expect(r.name, r.key).toBeTruthy();
  });
  it('defines each referenced variable in :root and .dark', () => {
    const root = css.match(/:root\s*\{[\s\S]*?\n\}/)![0];
    const dark = css.match(/\.dark\s*\{[\s\S]*?\n\}/)![0];
    for (const r of refs) {
      expect(root).toContain(`${r.name}:`);
      expect(dark).toContain(`${r.name}:`);
    }
  });
});

describe('dark-mode teal token', () => {
  const vars = ['--teal-rgb', '--on-teal-rgb'];
  const root = css.match(/:root\s*\{[\s\S]*?\n\}/)![0];
  const dark = css.match(/\.dark\s*\{[\s\S]*?\n\}/)![0];
  const channel = (block: string, name: string) => block.match(new RegExp(`${name}:\\s*([0-9 ]+);`))?.[1].trim();

  it('teal.DEFAULT and on-teal resolve to CSS variables; teal.light/dark stay static', () => {
    expect(config).toMatch(/teal: \{ DEFAULT: 'rgb\(var\(--teal-rgb\) \/ <alpha-value>\)', light: '#146B78', dark: '#072B30' \}/);
    expect(config).toContain("'on-teal': 'rgb(var(--on-teal-rgb) / <alpha-value>)'");
  });
  it('defines them in :root (light value unchanged) and .dark (matches --primary)', () => {
    for (const v of vars) {
      expect(root).toContain(`${v}:`);
      expect(dark).toContain(`${v}:`);
    }
    expect(channel(root, '--teal-rgb')).toBe('13 76 85'); // #0D4C55
    expect(channel(dark, '--teal-rgb')).toBe('63 166 180'); // #3FA6B4
    expect(dark).toContain('--primary: #3FA6B4;');
    expect(channel(root, '--on-teal-rgb')).toBe('255 255 255');
    expect(channel(dark, '--on-teal-rgb')).toBe('7 43 48'); // white on #3FA6B4 is ~2.9:1, #072B30 is ~5.2:1
  });
});
