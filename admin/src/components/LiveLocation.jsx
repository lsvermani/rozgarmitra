import { useLocation } from '../context/useLocation';

export default function LiveLocation({ className = '' }) {
  const { location, status, detect } = useLocation();

  const locationLabel = (() => {
    if (status === 'loading') return 'Detecting location…';
    if (status === 'error') return 'Location unavailable';
    return location?.label || 'Detect my location';
  })();

  return (
    <button
      className={`rm-location ${status === 'ready' ? 'is-ready' : ''} ${status === 'loading' ? 'is-loading' : ''} ${className}`.trim()}
      onClick={detect}
      type="button"
      aria-live="polite"
      title="Click to refresh your live location"
    >
      <span className="rm-location__icon" aria-hidden="true">📍</span>
      <span className="rm-location__text">{locationLabel}</span>
      {status === 'ready' && location?.source === 'gps' && <span className="rm-location__badge">Live</span>}
    </button>
  );
}
