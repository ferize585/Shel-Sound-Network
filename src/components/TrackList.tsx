import React from 'react';
import type { Track } from '../types';

interface TrackListProps {
  tracks: Track[];
  playingTrackId?: string | number;
  isPlaying: boolean;
  onTrackSelect: (index: number) => void;
  onDelete?: (id: string | number) => void;
  onToggleVisibility?: (track: Track) => void;
  formatTime: (sec: number | undefined) => string;
  formatSize: (bytes: number | undefined) => string;
  durations: Record<string | number, number>;
  sizes: Record<string | number, number>;
  pageOffset?: number;
  variant?: 'library' | 'cloud';
}

const TrackList: React.FC<TrackListProps> = React.memo(({ 
  tracks, 
  playingTrackId, 
  isPlaying, 
  onTrackSelect, 
  onDelete, 
  onToggleVisibility, 
  formatTime, 
  formatSize, 
  durations, 
  sizes,
  pageOffset = 0,
  variant = 'library'
}) => {
  const [openMenuId, setOpenMenuId] = React.useState<string | number | null>(null);

  const truncate = (text: string, max = 40) =>
    text.length > max ? text.slice(0, max) + "..." : text;

  const parseTrack = (title: string) => {
    let artist = "Unknown Artist";
    let cleanTitle = title;

    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      artist = parts[0];
      cleanTitle = parts[1];
    } else {
      const words = title.split(" ");
      if (words.length >= 2) {
        artist = words.slice(0, 2).join(" ");
        cleanTitle = words.slice(2).join(" ");
      }
    }

    cleanTitle = cleanTitle.replace(/\(.*?\)/g, "").trim();
    return { artist, cleanTitle };
  };

  if (tracks.length === 0) {
    return (
      <div className="empty-state">
        <svg className="empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <div className="empty-title">NO TRACKS YET</div>
        <div className="empty-desc">Upload some audio files to get started</div>
      </div>
    );
  }

  return (
    <div className="track-list">
      {tracks.map((track, i) => {
        const { cleanTitle } = parseTrack(track.title);
        const duration = durations[track.id] || track.duration;
        const size = sizes[track.id] || track.size;
        const isPublic = track.is_public === true || track.is_public === 'true' as any;
        const isCurrent = track.id === playingTrackId;

        return (
          <div key={track.id} className="track-row-container">
            <div
              className={`track-item track-grid ${variant === 'library' ? 'lib-grid' : 'cloud-grid'} ${isCurrent ? 'playing' : ''}`}
              style={{ animationDelay: `${i * 0.03}s`, cursor: 'pointer' }}
              onClick={() => onTrackSelect(i)}
            >
              {/* Index / EQ bars — always visible */}
              <div className="track-num">
                {isCurrent && isPlaying ? (
                  <div className="track-play-icon">
                    <div className="tpi-bar"></div>
                    <div className="tpi-bar"></div>
                    <div className="tpi-bar"></div>
                  </div>
                ) : (
                  <span className="track-num-text">{pageOffset + i + 1}</span>
                )}
              </div>

              {/* Title + mobile-only metadata — always visible */}
              <div className="track-info">
                <div className="track-name" title={track.title}>{truncate(cleanTitle)}</div>
                {/* Mobile ONLY metadata */}
                <div className="track-meta-mobile sm:hidden truncate">
                  {formatSize(size)} • {duration ? formatTime(duration) : '—:——'}
                </div>
              </div>

              {/* Mobile Action Trigger (⋮) — mobile ONLY, unchanged */}
              <div className="sm:hidden ml-2 mr-3 flex-shrink-0">
                <button
                  className="mobile-menu-trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === track.id ? null : track.id);
                  }}
                >
                  ⋮
                </button>
              </div>

              {/* ── Desktop ONLY columns ── */}
              <div className="track-size hidden sm:flex">
                {formatSize(size)}
              </div>
              <div className="track-duration hidden sm:flex">
                {duration ? formatTime(duration) : '—:——'}
              </div>

              {/* Actions — Only for library variant */}
              <div className={`track-actions ${variant === 'library' ? 'hidden sm:flex' : 'hidden'}`}>
                <div className="track-opts-menu" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {onToggleVisibility && (
                    <div className="opt-item" style={{ display: 'flex', alignItems: 'center' }}>
                      <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isPublic}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggleVisibility(track);
                          }}
                        />
                        <span className="slider"></span>
                      </label>
                      <span className="toggle-label" style={{ marginLeft: '10px' }}>
                        {isPublic ? 'Public' : 'Private'}
                      </span>
                    </div>
                  )}
                  {onDelete && (
                    <button
                      className="delete-btn"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onDelete(track.id); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      DELETE
                    </button>
                  )}
                </div>
              </div>

            </div>

            {openMenuId === track.id && (
              <div
                className="mobile-quick-actions sm:hidden"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'nowrap'
                }}
              >
                {onToggleVisibility && (
                  <div
                    className="mq-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 1
                    }}
                  >
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleVisibility(track);
                        }}
                      />
                      <span className="slider"></span>
                    </label>
                    <span className="toggle-label" style={{ marginLeft: '10px', fontSize: '12px' }}>
                      {isPublic ? 'PUBLIC' : 'PRIVATE'}
                    </span>
                  </div>
                )}
                {onDelete && (
                  <button
                    className="delete-btn"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '32px' }}
                    onClick={() => { onDelete(track.id); setOpenMenuId(null); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    DELETE TRACK
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

TrackList.displayName = 'TrackList';

export default TrackList;
