'use client';

import { useState } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';

interface MapWithPinProps {
  onLocationSelect: (lat: number, lng: number) => void;
  initialLat: number | null;
  initialLng: number | null;
}

export default function MapWithPin({
  onLocationSelect,
  initialLat,
  initialLng,
}: MapWithPinProps) {
  const [position, setPosition] = useState<[number, number] | null>(
    initialLat && initialLng ? [initialLat, initialLng] : null
  );

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      setPosition([lat, lng]);
      onLocationSelect(lat, lng);
    },
  });

  return position ? <Marker position={position} /> : null;
}
