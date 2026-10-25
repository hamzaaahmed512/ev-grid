'use client';
import { useEffect, useRef, useState } from 'react';
// @ts-ignore
import 'leaflet/dist/leaflet.css';
import { stationApi, ApiStation } from '../lib/api';
import BookingModal from './BookingModal';

export type Station = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  available: boolean;
};

type Props = {
  stations: Station[];
  selected: number | null;
  onSelect: (id: number) => void;
};

export default function StationMap({ stations, selected, onSelect }: Props) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map | null>(null);
  const markers = useRef<import('leaflet').Marker[]>([]);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [apiStation, setApiStation] = useState<ApiStation | null>(null);
  const [loadingStation, setLoadingStation] = useState(false);

  useEffect(() => {
    let alive = true;
    import('leaflet').then(L => {
      if (!alive || !node.current || map.current) return;
      map.current = L.map(node.current, { scrollWheelZoom: false }).setView([31.5204, 74.3587], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map.current);
      setTimeout(() => map.current?.invalidateSize(), 200);
    });
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!node.current) return;
    const observer = new ResizeObserver(() => map.current?.invalidateSize());
    observer.observe(node.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    import('leaflet').then(L => {
      if (!live || !map.current) return;
      markers.current.forEach(x => x.remove());
      markers.current = stations.map(s => {
        const active = s.id === selected;
        const icon = L.divIcon({
          html: `<div style="background:${active ? '#14532d' : s.available ? '#16a34a' : '#f59e0b'};width:44px;height:44px;border-radius:50%;border:3px solid white;box-shadow:0 4px 15px #0003;color:white;display:grid;place-items:center;font-size:17px;font-weight:800">⚡</div>`,
          className: '',
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });
        let marker = L.marker([s.lat, s.lng], { icon }).addTo(map.current!);
        marker.bindTooltip(s.name);
        marker.on('click', () => onSelect(s.id));
        return marker;
      });

      if (selected) {
        const s = stations.find(s => s.id === selected);
        if (s) {
          map.current!.flyTo([s.lat, s.lng], 12, {
            duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.6,
            animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
          });
        }
      } else if (stations.length) {
        const bounds = L.latLngBounds(stations.map(s => [s.lat, s.lng]));
        map.current!.fitBounds(bounds, { padding: [35, 35], maxZoom: 12 });
      }
    });
    return () => {
      live = false;
    };
  }, [stations, selected, onSelect]);

  const selectedStation = stations.find(s => s.id === selected);

  const handleOpenBooking = async () => {
    if (!selected) return;
    try {
      setLoadingStation(true);
      const data = await stationApi.get(selected);
      setApiStation(data);
      setIsBookingModalOpen(true);
    } catch (err) {
      console.error("Failed to load station details for booking", err);
    } finally {
      setLoadingStation(false);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div className="map-surface w-full h-full" ref={node} aria-label="Charging station map" />
      
      {selectedStation && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-white rounded-xl shadow-xl p-4 z-[1000] border border-gray-100 flex flex-col space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-bold text-gray-800">{selectedStation.name}</h4>
              <p className="text-xs text-gray-500">ID: #{selectedStation.id}</p>
            </div>
            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${selectedStation.available ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {selectedStation.available ? 'Available' : 'Busy'}
            </span>
          </div>
          <button
            onClick={handleOpenBooking}
            disabled={loadingStation}
            className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm"
          >
            <span>⚡</span>
            <span>{loadingStation ? "Loading..." : "Book Slot"}</span>
          </button>
        </div>
      )}

      {apiStation && (
        <BookingModal
          station={apiStation}
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          onSuccess={() => {
            setIsBookingModalOpen(false);
            alert("Booking confirmed successfully!");
          }}
        />
      )}
    </div>
  );
}