import React, { useEffect, useState } from 'react';
import TrackList from './TrackList';
import type { Track } from '../types';
import { getAllAudioBlobs } from '../utils/shelbyExplorer';

interface CloudExplorerProps {
  onTrackSelect: (track: Track, allTracks?: Track[]) => void;
  currentIndex: number;
  isPlaying: boolean;
  formatTime: (sec: number | undefined) => string;
  formatSize: (bytes: number | undefined) => string;
  durations: Record<string | number, number>;
  sizes: Record<string | number, number>;
}

const CloudExplorer: React.FC<CloudExplorerProps> = ({ onTrackSelect, currentIndex, isPlaying, formatTime, formatSize, durations, sizes }) => {
  const [cloudTracks, setCloudTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Responsive Pagination
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(window.innerWidth <= 640 ? 5 : 15);

  useEffect(() => {
    const handleResize = () => setItemsPerPage(window.innerWidth <= 640 ? 5 : 15);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchBlobs = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const mappedTracks = await getAllAudioBlobs();
      setCloudTracks(mappedTracks);
      console.log("GLOBAL BLOBS (Explorer):", mappedTracks);
    } catch (err: any) {
      console.error("Fetch Error:", err);
      setError("Failed to fetch global cloud tracks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlobs();
  }, []);

  // Pagination Logic
  const filteredTracks = searchQuery
    ? cloudTracks.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : cloudTracks;
  const totalPages = Math.ceil(filteredTracks.length / itemsPerPage) || 1;
  const startIndex = (page - 1) * itemsPerPage;
  const displayedTracks = filteredTracks.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="view">
      <div className="view-header" style={{ position: 'relative' }}>
        <div className="view-title">
          Cloud Explorer
          <span className="track-count-badge">{filteredTracks.length}{searchQuery ? ` / ${cloudTracks.length}` : ''} tracks</span>
        </div>
        <div className="view-subtitle">GLOBAL NETWORK DISCOVERY</div>
        
        <div style={{ 
          fontSize: '10px', 
          opacity: 0.6, 
          marginTop: '8px', 
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span>SCANNING SHELBY NETWORK</span>
          <button 
            onClick={() => fetchBlobs()} 
            disabled={loading}
            className="refresh-btn"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '9px',
              textTransform: 'uppercase'
            }}
          >
            {loading ? 'SCANNING...' : 'REFRESH'}
          </button>
        </div>
        {/* Cloud Explorer Search Bar */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
          placeholder="Search title or artist..."
          style={{
            width: '100%', marginTop: '10px', padding: '8px 14px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', color: 'white', fontSize: '13px',
            fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box'
          }}
        />
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: 'var(--accent)', margin: '40px 0', fontFamily: '"Space Mono", monospace' }}>
          Initializing indexer discovery...
        </div>
      )}

      {error && (
        <div style={{ textAlign: 'center', color: 'var(--accent-hot)', margin: '40px 0', fontFamily: '"Space Mono", monospace' }}>
          {error}
        </div>
      )}

      {!loading && !error && cloudTracks.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', margin: '40px 0', fontFamily: '"Space Mono", monospace' }}>
          No audio tracks found on Shelby Network.
        </div>
      )}

      {!loading && !error && cloudTracks.length > 0 && (
        <>
          <div className="track-list-header">
            <div>#</div>
            <div>TITLE</div>
            <div>SIZE</div>
            <div style={{ textAlign: 'right' }}>DURATION</div>
          </div>

          <TrackList 
            tracks={displayedTracks}
            currentIndex={currentIndex >= startIndex && currentIndex < startIndex + itemsPerPage ? currentIndex - startIndex : -1}
            isPlaying={isPlaying}
            onTrackSelect={(localIndex) => onTrackSelect(displayedTracks[localIndex], cloudTracks)}
            formatTime={formatTime}
            formatSize={formatSize}
            durations={durations}
            sizes={sizes}
          />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', padding: '0 8px', fontFamily: '"Space Mono", monospace', fontSize: '11px' }}>
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '6px 16px',
                borderRadius: '4px',
                color: 'white',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.3 : 1,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              PREV
            </button>
            <span style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '1px' }}>
              PAGE <span style={{ color: 'white' }}>{page}</span> OF <span style={{ color: 'white' }}>{totalPages}</span>
            </span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '6px 16px',
                borderRadius: '4px',
                color: 'white',
                cursor: page === totalPages ? 'not-allowed' : 'pointer',
                opacity: page === totalPages ? 0.3 : 1,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              NEXT
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CloudExplorer;
