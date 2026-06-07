import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Navigation, MapPin, AlertTriangle } from 'lucide-react';
import L from 'leaflet';
import { handlePanicButton } from '../utils/panicButton';
import API_URL from '../utils/config';
import './SafetyMap.css';

const SafetyMap = () => {
  const navigate = useNavigate();
  const [location, setLocation] = useState('');

  // Map + marker state
  // Use centralized API configuration
const API_BASE_URL = API_URL;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // community markers (grouped by location)
  const [communityMarkers, setCommunityMarkers] = useState([]);
  // service markers (hospitals and emergency services)
  const [serviceMarkers, setServiceMarkers] = useState([]);
  // UI toggles
  const [showCommunity, setShowCommunity] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showPolice, setShowPolice] = useState(true);
  const [showFire, setShowFire] = useState(true);
  const [showAmbulance, setShowAmbulance] = useState(true);
  const [showShelter, setShowShelter] = useState(true);

  const [mapCenter, setMapCenter] = useState([33.7, 73.0]); // default center
  const [mapZoom, setMapZoom] = useState(6);
  const [userLocation, setUserLocation] = useState(null);
  const geocodeCacheRef = useRef({});

  // Map ref and leaflet instances
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerLayerRef = useRef(null);

  useEffect(() => {
    // Initialize Leaflet map once
    if (!mapRef.current) return;

    // Create map
    leafletMapRef.current = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView(mapCenter, mapZoom);

    // Add tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(leafletMapRef.current);

    // Marker layer group
    markerLayerRef.current = L.layerGroup().addTo(leafletMapRef.current);

    // Try to get user's location for centering map
    if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setUserLocation([lat, lon]);
          // Check if map is still mounted before setting view
          if (leafletMapRef.current) {
            leafletMapRef.current.setView([lat, lon], 12);
          }
        },
        () => {
          // ignore permission error
        },
        { timeout: 8000 }
      );
    }

    // Load all community posts and geocode locations
    loadEmergencyMarkers();

    // Fetch nearby hospitals/services for current center
    fetchNearbyServices(mapCenter[0], mapCenter[1]).catch(err => console.warn('Nearby fetch failed', err));

    return () => {
      // Clean up Leaflet map on unmount
      try {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      } catch (err) {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep markers in sync with Leaflet
  useEffect(() => {
    if (!markerLayerRef.current) return;

    markerLayerRef.current.clearLayers();

    // user location marker
    if (userLocation && leafletMapRef.current) {
      const el = L.circleMarker(userLocation, { color: '#10b981', radius: 8 });
      el.bindTooltip('You', { permanent: true, direction: 'top', offset: [0, -10], className: 'map-tooltip user-tooltip' });
      el.addTo(markerLayerRef.current);
    }

    // build combined list depending on toggles
    const combined = [];
    if (showCommunity) combined.push(...communityMarkers.map(m => ({ ...m, category: 'community' })));
    if (showHospitals) combined.push(...serviceMarkers.filter(s => s.subtype === 'hospital' || (s.raw && (s.raw.amenity === 'hospital' || s.raw.healthcare === 'hospital'))));
    if (showPolice) combined.push(...serviceMarkers.filter(s => s.subtype === 'police'));
    if (showFire) combined.push(...serviceMarkers.filter(s => s.subtype === 'fire'));
    if (showAmbulance) combined.push(...serviceMarkers.filter(s => s.subtype === 'ambulance'));
    if (showShelter) combined.push(...serviceMarkers.filter(s => s.subtype === 'shelter'));

    combined.forEach(m => {
      // choose color per type
      let color = '#999999';
      if (m.category === 'community') color = (m.urgent ? '#dc2626' : '#f97316');
      else if (m.subtype === 'hospital' || (m.raw && (m.raw.amenity === 'hospital' || m.raw.healthcare === 'hospital'))) color = '#3b82f6';
      else if (m.subtype === 'police') color = '#eab308';
      else if (m.subtype === 'fire') color = '#ef4444';
      else if (m.subtype === 'ambulance') color = '#06b6d4';
      else if (m.subtype === 'shelter') color = '#22c55e';

      const c = L.circleMarker([m.lat, m.lon], { color, radius: 7, fillOpacity: 1 });

      // derive the latest post for the tooltip and popup
      const sorted = [...m.posts].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      const latest = sorted[0];

      const timeLabel = latest && latest.createdAt ? new Date(latest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      let tooltipText = '';
      if (m.category === 'community') {
        tooltipText = m.posts.length > 1 ? `${m.posts.length} posts • ${timeLabel} • ${latest.type}` : `${timeLabel} • ${latest.type}`;
      } else if (m.subtype === 'hospital') {
        tooltipText = `Hospital • ${latest.title}`;
      } else {
        tooltipText = `${m.subtype ? m.subtype.charAt(0).toUpperCase()+m.subtype.slice(1) : 'Service'} • ${latest.title}`;
      }

      c.bindTooltip(tooltipText, { permanent: true, direction: 'top', offset: [0, -12], className: 'map-tooltip' });

      // Build popup listing posts at this location
      const rows = sorted.map(p => {
        return `<div style="margin-bottom:8px"><strong>${escapeHtml(p.title)}</strong><div style="font-size:12px;color:#374151">${escapeHtml(p.type)}${p.createdAt ? ' • ' + escapeHtml(new Date(p.createdAt).toLocaleString()) : ''}</div><div style="margin-top:4px">${escapeHtml(p.description)}</div></div>`;
      }).join('');

      const popupHtml = `
        <div style="max-width:320px">
          ${rows}
          <div style="margin-top:6px;color:#6b7280"><small>${escapeHtml(latest.location || (m.raw && (m.raw.address || m.raw.name)) || '')}</small></div>
        </div>
      `;

      c.bindPopup(popupHtml);
      // attach marker data for search highlighting
      c._rr_marker = m;
      c.addTo(markerLayerRef.current);
    });

    // If there are markers and map has no user location, center on first marker
    if (combined.length > 0 && !userLocation && leafletMapRef.current) {
      leafletMapRef.current.setView([combined[0].lat, combined[0].lon], 12);
    }
  }, [communityMarkers, serviceMarkers, showCommunity, showHospitals, showPolice, showFire, showAmbulance, showShelter, userLocation]);

  // Calculate haversine distance in kilometers
  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Search handler: geocode query, center map, fetch nearby services and highlight nearest posts
  async function handleSearch() {
    if (!location || !location.trim()) return;
    setLoading(true);
    const g = await geocodeLocation(location.trim());
    if (!g) {
      setError('Location not found');
      setLoading(false);
      return;
    }

    // Center map
    if (leafletMapRef.current) {
      leafletMapRef.current.setView([g.lat, g.lon], 12);
    }

    // Fetch nearby hospitals/services for this location
    await fetchNearbyServices(g.lat, g.lon).catch(() => {});

    // Highlight community markers within 10km
    const layers = markerLayerRef.current ? markerLayerRef.current.getLayers() : [];
    let nearest = null;
    layers.forEach(layer => {
      const m = layer._rr_marker;
      if (!m || m.category !== 'community') return;
      const d = distanceKm(g.lat, g.lon, m.lat, m.lon);
      if (d <= 10) {
        // open popup for first match and keep nearest
        if (!nearest || d < nearest.d) nearest = { layer, d };
      }
    });

    if (nearest && nearest.layer) {
      nearest.layer.openPopup();
    }

    setLoading(false);
  }

  // GPS button handler
  async function handleUseMyLocation() {
    if (!navigator?.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setUserLocation([lat, lon]);
      if (leafletMapRef.current) {
        leafletMapRef.current.setView([lat, lon], 13);
      }
      await fetchNearbyServices(lat, lon).catch(() => {});
    }, (err) => {
      console.error('GPS error', err);
      setError('Unable to get your location');
    }, { timeout: 8000 });
  }
  async function geocodeLocation(locationQuery) {
    if (!locationQuery) return null;
    if (geocodeCacheRef.current[locationQuery]) return geocodeCacheRef.current[locationQuery];

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationQuery)}&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'RapidResQ Frontend' } });
      if (!res.ok) return null;
      const arr = await res.json();
      if (arr && arr[0]) {
        const val = { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
        geocodeCacheRef.current[locationQuery] = val;
        return val;
      }
    } catch (err) {
      console.error('Geocode error:', err.message);
    }

    geocodeCacheRef.current[locationQuery] = null;
    return null;
  }

  // Fetch nearby hospitals and emergency services for a lat/lon
  async function fetchNearbyServices(lat, lon, radius = 25000) {
    try {
      const resp = await fetch(`${API_BASE_URL}/emergency/nearby?lat=${lat}&lon=${lon}&radius=${radius}`);
      const data = await resp.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch nearby services');
      }

      const hospitals = (data.hospitals || []).map((h, idx) => ({
        id: `h_${h.name}_${idx}`,
        lat: h.lat,
        lon: h.lon,
        posts: [{ title: h.name, type: 'Hospital', createdAt: new Date().toISOString(), description: h.address || '', author: '', location: h.address || '' }],
        urgent: false,
        category: 'hospital',
        raw: h
      }));

      const services = (data.emergencyServices || []).map((s, idx) => {
        // derive subtype for finer filtering
        const amen = (s.amenity || '').toLowerCase();
        let subtype = 'service';
        if (amen.includes('police')) subtype = 'police';
        else if (amen.includes('fire')) subtype = 'fire';
        else if (amen.includes('ambulance') || amen.includes('rescue')) subtype = 'ambulance';
        else if (amen.includes('shelter')) subtype = 'shelter';

        return {
          id: `s_${s.name}_${idx}`,
          lat: s.lat,
          lon: s.lon,
          posts: [{ title: s.name, type: subtype.charAt(0).toUpperCase() + subtype.slice(1), createdAt: new Date().toISOString(), description: s.address || '', author: '', location: s.address || '' }],
          urgent: false,
          category: 'service',
          subtype,
          raw: s
        };
      });

      setServiceMarkers([...hospitals, ...services]);

      return { hospitals, services };
    } catch (err) {
      console.error('Nearby services error:', err);
      return { hospitals: [], services: [] };
    }
  }

  // very small helper to escape HTML used in leaflet popups
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function loadEmergencyMarkers() {
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(`${API_BASE_URL}/community/posts`);
      const data = await resp.json();
      console.log('SafetyMap: fetched posts', data);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch posts');
      }

      const posts = data.posts || [];
      if (posts.length === 0) {
        setCommunityMarkers([]);
        setLoading(false);
        return;
      }

      // Build unique list of location strings to geocode
      const uniqueLocations = [...new Set(posts.map(p => (p.location || '').trim()).filter(Boolean))];

      // Geocode each unique location sequentially with a short delay to avoid rate limits
      for (const loc of uniqueLocations) {
        // eslint-disable-next-line no-await-in-loop
        await geocodeLocation(loc);
        // be polite - light delay
        // eslint-disable-next-line no-await-in-loop
        await sleep(300);
      }

      // Map posts to coordinates (group by lat/lon rounded to 5 decimals)
      const grouped = {};
      posts.forEach(p => {
        const loc = (p.location || '').trim();
        const g = geocodeCacheRef.current[loc];
        if (!g) return; // skip posts we couldn't geocode
        const key = `${g.lat.toFixed(5)},${g.lon.toFixed(5)}`;
        if (!grouped[key]) grouped[key] = { lat: g.lat, lon: g.lon, posts: [] };
        grouped[key].posts.push(p);
        // mark urgent flag if any post in the group is urgent
        grouped[key].urgent = (grouped[key].urgent || false) || !!p.urgent || p.type === 'Life in Danger';
      });

      const resolved = Object.keys(grouped).map(k => ({ id: k, lat: grouped[k].lat, lon: grouped[k].lon, posts: grouped[k].posts, urgent: grouped[k].urgent, category: 'community' }));

      setCommunityMarkers(resolved);

      // After loading community markers, try to also fetch nearby services for the current center
      try { await fetchNearbyServices(mapCenter[0], mapCenter[1]); } catch (err) { /* ignore */ }

      if (resolved.length > 0 && !userLocation) {
        setMapCenter([resolved[0].lat, resolved[0].lon]);
        setMapZoom(12);
      }

      setLoading(false);
    } catch (err) {
      console.error('Load markers error:', err);
      setError(err.message || 'Failed to load emergencies');
      setLoading(false);
    }
  }

  return (
    <div className="safety-map-container">
    

      {/* Main Content */}
      <main className="main-content">
        <div className="page-title-section">
          <h1>Safety Map</h1>
          <p className="subtitle">Find nearby hospitals, shelters, and emergency services</p>
        </div>

        {/* Search Bar */}
        <div className="search-bar-container">
          <div className="search-input-wrapper">
            <MapPin size={20} className="location-icon" />
            <input
              type="text"
              placeholder="Enter your location..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              className="location-input"
            />
          </div>
          <button className="search-button" onClick={handleSearch} title="Search location">
            <Search size={20} />
          </button>
          <button className="gps-button" onClick={handleUseMyLocation} title="Use my location">
            <Navigation size={20} />
          </button>

          {/* Map Area */}
          <div className="map-area" id="safety-map-area">
            <div ref={mapRef} id="leaflet-map" style={{ height: '100%', width: '100%' }} />
            {loading && <div className="map-loading">Loading map...</div>}
            {!loading && error && <div className="map-error">{error}</div>}
          </div>
        </div>

        {/* Filters + Legend */}
        <div className="service-filters">
          <div className="filters-list">
            <label className="filter-checkbox"><input type="checkbox" checked={showCommunity} onChange={() => setShowCommunity(s => !s)} /> Community</label>
            <label className="filter-checkbox"><input type="checkbox" checked={showHospitals} onChange={() => setShowHospitals(s => !s)} /> Hospitals</label>
            <label className="filter-checkbox"><input type="checkbox" checked={showPolice} onChange={() => setShowPolice(s => !s)} /> Police</label>
            <label className="filter-checkbox"><input type="checkbox" checked={showFire} onChange={() => setShowFire(s => !s)} /> Fire Stations</label>
            <label className="filter-checkbox"><input type="checkbox" checked={showAmbulance} onChange={() => setShowAmbulance(s => !s)} /> Ambulance/Rescue</label>
            <label className="filter-checkbox"><input type="checkbox" checked={showShelter} onChange={() => setShowShelter(s => !s)} /> Shelters</label>
          </div>

          {/* Legend box */}
          <div className="map-legend" aria-hidden>
            <div className="legend-title">Map legend</div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: '#f97316' }}></div><div>Community (orange)</div></div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: '#dc2626' }}></div><div>Urgent (red)</div></div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: '#3b82f6' }}></div><div>Hospital / Clinic (blue)</div></div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: '#eab308' }}></div><div>Police (yellow)</div></div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: '#ef4444' }}></div><div>Fire Station (red)</div></div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: '#06b6d4' }}></div><div>Ambulance / Rescue (teal)</div></div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: '#22c55e' }}></div><div>Shelter (green)</div></div>
          </div>
        </div>
      </main>

      

      <button className="fab" onClick={() => handlePanicButton(navigate)}>
        <AlertTriangle />
      </button>

     
    </div>
  );
};

export default SafetyMap;