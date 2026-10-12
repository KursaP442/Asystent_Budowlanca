"use client";

import { useEffect, useState } from "react";

export function ConstructionLocationMap({
  query,
  locationPin,
}: {
  query: string;
  locationPin: { lat: number; lng: number } | null;
}) {
  const [searchQuery, setSearchQuery] = useState(query);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query), 700);
    return () => window.clearTimeout(timer);
  }, [query]);

  const mapQuery = locationPin
    ? `${locationPin.lat},${locationPin.lng}`
    : searchQuery;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;

  return (
    <>
      <iframe
        className="construction-location-map"
        src={embedUrl}
        title={`Google Maps — ${mapQuery}`}
        aria-label={`Mapa Google Maps: ${mapQuery}`}
        loading="lazy"
        allowFullScreen
      />
      <p className="location-map-status" role="status" aria-live="polite">
        {locationPin
          ? "Google Maps pokazuje zapisany punkt inwestycji."
          : `Wyszukiwanie w Google Maps: ${searchQuery}`}
      </p>
    </>
  );
}
