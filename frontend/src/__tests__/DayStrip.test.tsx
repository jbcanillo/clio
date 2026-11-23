import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayStrip } from '../components/DayStrip';
import type { DaySummary } from '../lib/types';

const day = (date: string, mood: number | null, hasEntry = true): DaySummary => ({
  date, mood, energy: null, headline: '', hasEntry, sections: { thoughts: 0, ideas: 0, events: 0 },
});
const noop = () => {};

describe('DayStrip', () => {
  it('shows Mon-Sun of the week containing selected and calls onSelect', async () => {
    const onSelect = vi.fn();
    render(<DayStrip days={[]} selected="2026-11-25" onSelect={onSelect} onPrevWeek={noop} onNextWeek={noop} />);
    const buttons = screen.getAllByRole('button').filter((b) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+/.test(b.getAttribute('aria-label') ?? ''));
    expect(buttons.map((b) => b.getAttribute('aria-label')?.slice(0, 6))).toEqual(['Mon 23', 'Tue 24', 'Wed 25', 'Thu 26', 'Fri 27', 'Sat 28', 'Sun 29']);
    expect(screen.getByRole('button', { name: /Wed 25/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Fri 27/ }));
    expect(onSelect).toHaveBeenCalledWith('2026-11-27');
  });

  it('starts the week on the previous Monday when a Sunday is selected', () => {
    render(<DayStrip days={[]} selected="2026-11-29" onSelect={noop} onPrevWeek={noop} onNextWeek={noop} />);
    expect(screen.getByRole('button', { name: /Mon 23/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sun 29/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('colors dots by mood and omits them without an entry or mood', () => {
    const days = [day('2026-11-23', 5), day('2026-11-24', 3), day('2026-11-25', 1), day('2026-11-26', null), day('2026-11-27', 4, false)];
    render(<DayStrip days={days} selected="2026-11-23" onSelect={noop} onPrevWeek={noop} onNextWeek={noop} />);
    const dot = (name: RegExp) => screen.getByRole('button', { name }).querySelector('[data-dot]');
    expect(dot(/Mon 23/)).toHaveAttribute('data-dot', 'teal');
    expect(dot(/Tue 24/)).toHaveAttribute('data-dot', 'slate');
    expect(dot(/Wed 25/)).toHaveAttribute('data-dot', 'ember');
    expect(dot(/Thu 26/)).toBeNull();
    expect(dot(/Fri 27/)).toBeNull();
    expect(dot(/Sat 28/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Mon 23, mood Great' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sat 28, no entry' })).toBeInTheDocument();
  });

  it('week buttons call the callbacks', async () => {
    const prev = vi.fn(); const next = vi.fn();
    render(<DayStrip days={[]} selected="2026-11-23" onSelect={noop} onPrevWeek={prev} onNextWeek={next} />);
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(prev).toHaveBeenCalled(); expect(next).toHaveBeenCalled();
  });
});
