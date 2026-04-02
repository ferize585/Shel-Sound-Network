import React, { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import TrackList from './TrackList';
import type { Track } from '../types';
import { getPublicAudioBlobsPaginated } from '../utils/shelbyExplorer';

interface CloudExplorerProps {
  onTrackSelect: (track: Track, allTracks?: Track[]) => void;
  playingTrackId?: string | number;
  isPlaying: boolean;
  formatTime: (sec: number | undefined) => string;
  formatSize: (bytes: number | undefined) => string;
  durations: Record<string | number, number>;
  sizes: Record<string | number, number>;
}

const CloudExplorer: React.FC<CloudExplorerProps> = ({ onTrackSelect, playingTrackId, isPlaying, formatTime, formatSize, durations, sizes }) => {
  const [cloudTracks, setCloudTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalTracks, setTotalTracks] = useState(0);

  const calculateLimit = useCallback(() => {
    if (typeof window === 'undefined') return 15;
    const width = window.innerWidth;
    if (width < 768) return 5;
    if (width < 1024) return 10;
    return 15;
  }, []);

  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(calculateLimit());
  
  const listContainerRef = useRef<HTMLDivElement>(null);
  const paginationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateLimit = () => {
      const newLimit = calculateLimit();
      setItemsPerPage(prev => {
        if (prev !== newLimit) {
          setPage(1);
          return newLimit;
        }
        return prev;
      });
    };
    
    window.addEventListener('resize', updateLimit);
    window.addEventListener('orientationchange', updateLimit);
    return () => {
      window.removeEventListener('resize', updateLimit);
      window.removeEventListener('orientationchange', updateLimit);
    };
  }, [calculateLimit]);

  const fetchBlobs = async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const { tracks, total } = await getPublicAudioBlobsPaginated(targetPage, itemsPerPage);

      const animTargets = [listContainerRef.current, paginationRef.current].filter(Boolean);
      
      if (animTargets.length > 0) {
        await gsap.to(animTargets, {
          opacity: 0,
          y: -15,
          filter: 'blur(12px)',
          duration: 0.2,
          ease: "power2.in",
          stagger: 0.05
        });
      }

      setCloudTracks(tracks);
      setTotalTracks(total);
      setPage(targetPage);

      if (animTargets.length > 0) {
        gsap.fromTo(animTargets,
          { opacity: 0, y: 15, filter: 'blur(12px)' },
          { 
            opacity: 1, 
            y: 0, 
            filter: 'blur(0px)', 
            duration: 0.6, 
            ease: "power3.out",
            stagger: 0.1,
            clearProps: "opacity,transform,filter" 
          }
        );
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to fetch global discovery tracks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlobs(1);
  }, [itemsPerPage]);

  const totalPages = Math.ceil(totalTracks / itemsPerPage);

  const handlePageChange = (newPage: number) => {
    if (newPage !== page && newPage >= 1 && newPage <= totalPages) {
      fetchBlobs(newPage);
    }
  };

  const handleTrackSelect = useCallback((index: number) => {
    const track = cloudTracks[index];
    if (track) {
      onTrackSelect(track, cloudTracks);
    }
  }, [onTrackSelect, cloudTracks]);

  // Dynamic padding-bottom and margins to ensure navigation is close to tracks but clears the visualizer
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="view" style={{ paddingBottom: isMobile ? '250px' : '20px' }}>
      <div className="view-header">
        <div className="view-title">
          Cloud Explorer
          <span className="track-count-badge">{totalTracks} global tracks</span>
        </div>
        <div className="view-subtitle">GLOBAL MUSIC DISCOVERY — TESTNET SMART SYNC</div>
        
        <div style={{ 
          fontSize: '10px', 
          opacity: 0.6, 
          marginTop: '8px', 
          fontFamily: 'monospace', 
          display: 'flex', 
          flexWrap: 'wrap', 
          alignItems: 'center', 
          justifyContent: isMobile ? 'center' : 'flex-start',
          gap: '12px' 
        }}>
          <button 
            onClick={() => fetchBlobs(page)} 
            disabled={loading}
            className="refresh-btn"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '9px', textTransform: 'uppercase' }}
          >
            {loading ? 'SYNCING...' : 'REFRESH DISCOVERY'}
          </button>
        </div>
      </div>

      {loading && cloudTracks.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--accent)', margin: '40px 0', fontFamily: '"Space Mono", monospace' }}>
          SCALABLE SYNC: ACCESSING GLOBAL METADATA...
        </div>
      )}

      {error && <div style={{ textAlign: 'center', color: 'var(--accent-hot)', margin: '40px 0', fontFamily: '"Space Mono", monospace' }}>{error}</div>}

      <div ref={listContainerRef} style={{ paddingTop: '20px' }}>
        {!loading && cloudTracks.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', margin: '40px 0', fontFamily: '"Space Mono", monospace' }}>No global tracks found.</div>
        )}

        {cloudTracks.length > 0 && (
          <>
            <div className="track-list-header track-grid cloud-grid">
              <div className="track-num">#</div>
              <div className="track-info">TITLE</div>
              <div className="track-size hidden sm:flex">SIZE</div>
              <div className="track-duration hidden sm:flex">DURATION</div>
            </div>

            <div className="mobile-track-container" style={{ 
              height: isMobile ? '285px' : 'auto', 
              overflowY: isMobile ? 'scroll' : 'visible'
            }}>
              <TrackList 
                tracks={cloudTracks}
                playingTrackId={playingTrackId}
                isPlaying={isPlaying}
                onTrackSelect={handleTrackSelect}
                formatTime={formatTime}
                formatSize={formatSize}
                durations={durations}
                sizes={sizes}
                pageOffset={(page - 1) * itemsPerPage}
                variant="cloud"
              />
            </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div ref={paginationRef} className="pagination-container" style={{ 
          marginBottom: isMobile ? '120px' : '20px'
        }}>
          <div className="pagination-controls">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="pagination-btn"
              title="Previous Page"
            >
              ←
            </button>

            {[...Array(totalPages)].map((_, i) => {
              const pNum = i + 1;
              const isActive = pNum === page;
              return (
                <button
                  key={pNum}
                  onClick={() => handlePageChange(pNum)}
                  className={`pagination-btn ${isActive ? 'active' : ''}`}
                >
                  {pNum}
                </button>
              );
            })}

            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
              className="pagination-btn"
              title="Next Page"
            >
              →
            </button>
          </div>
          
          <div className="pagination-info">
            CLOUD EXPLORER PAGE {page} OF {totalPages}
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudExplorer;
