import { render, screen } from '@testing-library/react';
import PrivacyPage from '../pages/PrivacyPage';

describe('PrivacyPage', () => {
  it('covers storage, what leaves the server, the private diary, backups, access and deletion', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { name: 'Privacy notice' })).toBeInTheDocument();
    for (const name of ['What is stored, and where', 'What leaves your server', 'Your private diary', 'Backups', 'Access', 'Deleting your data']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/share private diary with clio this session/i)).toBeInTheDocument();
  });
});
