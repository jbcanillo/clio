import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LocationPicker from '../components/features/LocationPicker';

// Mock react-leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: () => <div data-testid="marker" />,
  useMap: () => ({ flyTo: jest.fn() }),
  useMapEvents: () => null
}));

vi.mock('leaflet', () => {
  const icon = jest.fn(() => ({}));
  return { default: { icon }, icon };
});

describe('LocationPicker', () => {
  it('renders the current-position button', () => {
    render(<LocationPicker onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my current position' })).toBeInTheDocument();
  });

  it('pins and displays the browser position', async () => {
    const getCurrentPosition = vi.fn((success) => success({
      coords: { latitude: 14.5995, longitude: 120.9842 },
    }));
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<LocationPicker onConfirm={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use my current position' }));

    await waitFor(() => {
      expect(screen.getByText(/Lat: 14\.59950, Lng: 120\.98420/)).toBeInTheDocument();
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: true }),
    );
  });
});
