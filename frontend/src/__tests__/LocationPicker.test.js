import React from 'react';
import { render, screen } from '@testing-library/react';
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
  it('should render without crashing', () => {
    render(<LocationPicker onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByText('Use current location')).toBeInTheDocument();
  });
});
