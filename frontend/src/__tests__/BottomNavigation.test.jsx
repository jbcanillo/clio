import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BottomNavigation from '../components/layout/BottomNavigation';

describe('BottomNavigation', () => {
  it('shows exactly the four scope tabs', () => {
    render(<BottomNavigation activeTab="chat" onTabChange={() => {}} />);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Chat', 'Journal', 'Reminders', 'Notes']);
    for (const old of ['Calendar', 'List', 'Stats']) {
      expect(screen.queryByRole('button', { name: old })).toBeNull();
    }
  });

  it('marks the active tab with aria-current', () => {
    render(<BottomNavigation activeTab="diary" onTabChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Journal' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Chat' })).not.toHaveAttribute('aria-current');
  });

  it('calls onTabChange with the tab id', async () => {
    const onTabChange = vi.fn();
    render(<BottomNavigation activeTab="chat" onTabChange={onTabChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(onTabChange).toHaveBeenCalledWith('notes');
  });
});
