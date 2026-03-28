import React, { useRef, useEffect, useState } from 'react';
import type { Track } from '../types';

interface PlayerBarProps {
  currentTrack?: Track;
  isPlaying: boolean;
  isBuffering?: boolean;
  isShuffle: boolean;
  isLoop: boolean;
  volume: number;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleShuffle: () => void;
  onToggleLoop: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  formatTime: (sec: number) => string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isArtFlashing: boolean;
  settings: import('../types').Settings;
}

const PlayerBar: React.FC<PlayerBarProps> = ({
  currentTrack,
  isPlaying,
  isBuffering = false,
  isShuffle,
  isLoop,
  volume,
  isMuted,
  currentTime,
  duration,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleShuffle,
  onToggleLoop,
  onSeek,
  onVolumeChange,
  onToggleMute,
  formatTime,
  audioRef,
  isArtFlashing,
  settings,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipText, setTooltipText] = useState('0:00');
  const [tooltipLeft, setTooltipLeft] = useState('0%');
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);

  const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = Date.now();
    
    setRipples(prev => [...prev, { id, x, y, size }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 500);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    const initVisualizer = () => {
      try {
        if (!audioRef.current) return;
        
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        if (!sourceNodeRef.current && audioCtxRef.current) {
          sourceNodeRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
          analyserRef.current = audioCtxRef.current.createAnalyser();
          gainNodeRef.current = audioCtxRef.current.createGain();
          
          // Quality based on settings
          analyserRef.current.fftSize = settings.highQuality ? 1024 : 256;
          
          // Boost based on settings
          gainNodeRef.current.gain.value = settings.volumeBoost ? 1.5 : 1.0;
          
          // Connect graph: Source -> Gain -> Analyser -> Destination
          sourceNodeRef.current.connect(gainNodeRef.current);
          gainNodeRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioCtxRef.current.destination);
        }
      } catch (e) {
        console.error('AudioContext error:', e);
      }
    };

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      const analyser = analyserRef.current;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      
      ctx.clearRect(0, 0, W, H);

      if (!settings.visualizer) return;

      if (!analyser || !isPlaying) {
        ctx.strokeStyle = 'rgba(0,198,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        return;
      }

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      
      const bufferLength = Math.floor(dataArray.length * 0.85);
      const barW = W / bufferLength;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 255;
        const barH = v * H * 0.95;
        const x = i * barW;
        
        const alpha = 0.2 + v * 0.7;
        const blue = Math.floor(200 + v * 55);
        ctx.fillStyle = `rgba(0, ${blue}, 255, ${alpha})`;
        
        ctx.fillRect(x, H - barH, barW, barH);
        
        ctx.fillStyle = `rgba(0, 198, 255, ${alpha * 0.6})`;
        ctx.fillRect(x, H - barH - 2, barW, 2);
      }
    };

    const handleFirstInteraction = () => {
      initVisualizer();
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      document.removeEventListener('click', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended' && isPlaying) {
        audioCtxRef.current.resume();
      }
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = settings.volumeBoost ? 1.5 : 1.0;
    }
    if (analyserRef.current) {
      analyserRef.current.fftSize = settings.highQuality ? 1024 : 256;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('click', handleFirstInteraction);
    };
  }, [isPlaying, audioRef, settings]);

  // ─── AudioContext cleanup on unmount ─────────────────────────────────────────
  // Disconnect all Web Audio nodes and close the AudioContext when the
  // PlayerBar unmounts. This prevents memory leaks and browser warnings
  // about unclosed AudioContexts.
  useEffect(() => {
    return () => {
      try {
        sourceNodeRef.current?.disconnect();
        analyserRef.current?.disconnect();
        gainNodeRef.current?.disconnect();
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close();
        }
        sourceNodeRef.current = null;
        analyserRef.current = null;
        gainNodeRef.current = null;
        audioCtxRef.current = null;
      } catch { /* ignore errors during teardown */ }
    };
  }, []);

  // Crossfade / Volume ramp
  useEffect(() => {
    if (!gainNodeRef.current || !settings.crossfade) return;

    const fadeStart = duration - 3; // Start fade 3 seconds before end
    if (currentTime > fadeStart && isPlaying) {
      const remaining = duration - currentTime;
      const gain = Math.max(0, remaining / 3);
      const baseGain = settings.volumeBoost ? 1.5 : 1.0;
      gainNodeRef.current.gain.setTargetAtTime(gain * baseGain, audioCtxRef.current!.currentTime, 0.1);
    } else {
      const baseGain = settings.volumeBoost ? 1.5 : 1.0;
      gainNodeRef.current.gain.setTargetAtTime(baseGain, audioCtxRef.current!.currentTime, 0.1);
    }
  }, [currentTime, duration, isPlaying, settings.crossfade, settings.volumeBoost]);

  const handleSeekMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = pct * duration;
    setTooltipText(formatTime(t));
    setTooltipLeft((pct * 100) + '%');
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onVolumeChange(pct);
  };

  const seekPct = duration ? (currentTime / duration) * 100 : 0;
  const volPct = isMuted ? 0 : volume * 100;

  return (
    <div className={`player-bar ${(isPlaying || isBuffering) && settings.visualizer ? 'with-viz' : ''} relative`}>
      {(isPlaying || isBuffering) && settings.visualizer && (
        <div className="visualizer-container relative">
          <canvas ref={canvasRef} />
        </div>
      )}

      <div className="player-bar-inner" style={{ height: '80px', flexShrink: 0 }}>
        <div className="pb-track-info">
          <div className={`player-art ${isPlaying ? 'playing' : ''} ${isArtFlashing ? 'flash' : ''}`}>
            <div className="player-art-inner">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
              </svg>
            </div>
          </div>
          <div className="player-track-meta truncate">
            <div className={`player-track-name truncate ${isPlaying ? 'playing-glow' : ''}`}>
              {currentTrack ? currentTrack.title : 'No track selected'}
            </div>
            <div className="player-track-artist truncate">
              {currentTrack ? currentTrack.artist : '—'}
            </div>
          </div>
        </div>

        <div className="pb-center">
          <div className="pb-controls">
            <button className={`ctrl-btn ${isShuffle ? 'active' : ''}`} onClick={onToggleShuffle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              </svg>
            </button>
            <button className="ctrl-btn" onClick={onPrev}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>
            <button className="ctrl-btn ctrl-btn-main" onClick={(e) => { 
              if (isBuffering) return; // Prevent toggling while downloading
              onTogglePlay(); 
              handleRipple(e); 
            }}>
              {isBuffering ? (
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
              ) : isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
              )}
              {ripples.map(ripple => (
                <span key={ripple.id} className="ripple" style={{ width: ripple.size, height: ripple.size, left: ripple.x, top: ripple.y }} />
              ))}
            </button>
            <button className="ctrl-btn" onClick={onNext}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zm2.5-6l6-4.25v8.5z"/><path d="M16 6h2v12h-2z"/>
              </svg>
            </button>
            <button className={`ctrl-btn ${isLoop ? 'active' : ''}`} onClick={onToggleLoop}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
              </svg>
            </button>
          </div>

          <div className="progress-section">
            <span className="time-display">{formatTime(currentTime)}</span>
            <div 
              className="seek-bar" 
              onClick={handleSeekClick}
              onMouseMove={handleSeekMouseMove}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <div className={`seek-fill ${isPlaying ? 'playing' : ''}`} style={{ width: `${seekPct}%` }}></div>
              <div className="seek-tooltip" style={{ opacity: showTooltip ? 1 : 0, left: tooltipLeft }}>{tooltipText}</div>
            </div>
            <span className="time-display right">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="pb-extra-controls">
          <div className="vol-section">
            <svg className="vol-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={onToggleMute}>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              {!isMuted && volume > 0 && (<path d={volume < 0.5 ? "M15.54 8.46a5 5 0 010 7.07" : "M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"} />)}
            </svg>
            <div className="vol-slider" onClick={handleVolumeClick}>
              <div className="vol-fill" style={{ width: `${volPct}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerBar;
