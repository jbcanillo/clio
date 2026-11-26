import React, { useState, useEffect } from 'react';
import { Portal } from '../ui/Portal';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue with webpack
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

const MapController = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 15, { duration: 1 });
    }
  }, [target, map]);
  return null;
};

const LocationPicker = ({ onConfirm, onCancel }) => {
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const posLL = { lat: latitude, lng: longitude };
        setPosition(posLL);
        setLocating(false);
      },
      (err) => {
        setLocationError(err.message || 'Unable to retrieve your current position.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        setPosition(e.latlng);
      },
    });
    return null;
  };

  return (
    <Portal>
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-elevated)] rounded-box overflow-hidden max-w-4xl w-full h-[80vh] flex flex-col shadow-lg">
        <div className="p-4 border-b border-base-200 flex justify-between items-center bg-base-100">
          <h3 className="text-lg font-medium text-base-content">Pick Location</h3>
          <div className="gap-2 flex">
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(position)}
              disabled={!position}
              className="btn btn-primary btn-sm disabled:btn-disabled"
            >
              Confirm
            </button>
          </div>
        </div>
        <div className="flex-1 relative">
          <MapContainer center={position || [20, 0]} zoom={position ? undefined : 2} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController target={position} />
            <MapClickHandler />
            {position && <Marker position={position} icon={icon} />}
          </MapContainer>
          <button
            type="button"
            onClick={handleUseGPS}
            disabled={locating}
            className="absolute top-4 right-4 z-[400] bg-base-100 px-3 py-1 rounded-box shadow text-sm hover:bg-base-200 border border-base-300"
          >
            {locating ? 'Finding your position…' : 'Use my current position'}
          </button>
        </div>
        {locationError ? (
          <p role="alert" className="px-3 py-2 text-sm text-error border-t border-base-300">{locationError}</p>
        ) : null}
        {position && (
          <div className="p-2 bg-base-200 text-sm border-t border-base-300 text-base-content">
            Lat: {position.lat.toFixed(5)}, Lng: {position.lng.toFixed(5)}
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
};

export default LocationPicker;
