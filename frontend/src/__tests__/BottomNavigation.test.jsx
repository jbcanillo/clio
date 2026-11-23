import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomNavigation from '../components/layout/BottomNavigation';

describe('BottomNavigation', () => {
  it('renders without crashing and shows the navigation tabs', () => {
    render(
      <MemoryRouter>
        <BottomNavigation activeTab="list" onTabChange={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
