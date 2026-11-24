import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiaryReflection } from '../../components/gen/DiaryReflection';
import { WeeklyReflection } from '../../components/gen/WeeklyReflection';
import type { DaySummary } from '../../lib/types';

const day = (o: Partial<DaySummary> = {}): DaySummary => ({
  date: '2026-11-20', mood: null, energy: null, headline: '', hasEntry: false,
  sections: { thoughts: 0, ideas: 0, events: 0 }, ...o,
});

describe('DiaryReflection', () => {
  it('shows mood chip, headline and Expand', async () => {
    const onExpand = vi.fn();
    render(<DiaryReflection day={day({ mood: 4, hasEntry: true, headline: 'Good run' })} onExpand={onExpand} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Good run')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(onExpand).toHaveBeenCalled();
  });
  it('empty day shows placeholder, no chip, no Expand', () => {
    render(<DiaryReflection day={day()} />);
    expect(screen.getByText('Nothing written yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expand/i })).toBeNull();
  });
  it('mood-only day with empty headline shows placeholder and chip', () => {
    render(<DiaryReflection day={day({ mood: 1, hasEntry: true })} />);
    expect(screen.getByText('Nothing written yet.')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });
});

describe('WeeklyReflection', () => {
  const days = [
    day({ date: '1', mood: 4, hasEntry: true, sections: { thoughts: 2, ideas: 0, events: 1 } }),
    day({ date: '2', mood: 5, hasEntry: true, sections: { thoughts: 1, ideas: 0, events: 0 } }),
    day({ date: '3', mood: 3, hasEntry: true, sections: { thoughts: 0, ideas: 1, events: 0 } }),
    day({ date: '4' }), day({ date: '5' }), day({ date: '6' }), day({ date: '7' }),
  ];
  it('computes stats and sentence', () => {
    render(<WeeklyReflection days={days} />);
    expect(screen.getByText('3 Entries')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();
    expect(screen.getByText('Thoughts')).toBeInTheDocument();
    expect(screen.getByText('You wrote 3 entries this week, with an average mood of 4.0.')).toBeInTheDocument();
  });
  it('singular entry', () => {
    render(<WeeklyReflection days={[day({ hasEntry: true })]} />);
    expect(screen.getByText('1 Entry')).toBeInTheDocument();
  });
  it('no data shows dashes and empty sentence', () => {
    render(<WeeklyReflection days={[day()]} />);
    expect(screen.getAllByText('–')).toHaveLength(2);
    expect(screen.getByText('No entries this week yet.')).toBeInTheDocument();
  });
  it('tie at top gives dash', () => {
    render(<WeeklyReflection days={[day({ hasEntry: true, sections: { thoughts: 2, ideas: 2, events: 0 } })]} />);
    expect(screen.queryByText('Thoughts')).toBeNull();
    expect(screen.queryByText('Ideas')).toBeNull();
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2);
  });
});
