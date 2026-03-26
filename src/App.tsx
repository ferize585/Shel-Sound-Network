import { useState, useRef, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import TrackList from './components/TrackList';
import UploadZone from './components/UploadZone';
import CloudExplorer from './components/CloudExplorer';
import { getAudioBlobs, normalizeAddress } from './utils/shelbyExplorer';
import { parseID3Metadata } from './utils/id3Parser';
import type { Track, View, Settings } from './types';
import './index.css';

import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';
import { useUploadBlobs, useDeleteBlob, useShelbyClient } from '@shelby-protocol/react';

function App() {
  // Start empty — GraphQL is the source of truth. localStorage caused stale deleted tracks to reappear.
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isLoop, setIsLoop] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [activeView, setActiveView] = useState<View>('library');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackDurations, setTrackDurations] = useState<Record<string | number, number>>({});
  const [trackSizes, setTrackSizes] = useState<Record<string | number, number>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [isArtFlashing, setIsArtFlashing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [preparedFiles, setPreparedFiles] = useState<{name: string, data: Uint8Array}[]>([]);
  // Ref (not state) so interval callbacks always read the latest deleted IDs without restarting the timer
  const deletedIdsRef = useRef<string[]>([]);

  const { connected, account, network, signAndSubmitTransaction } = useWallet();
  
  const shelbyClient = useShelbyClient();
  
  // @ts-ignore - Library version may differ
  const { mutateAsync: upload } = useUploadBlobs({ account });
  // @ts-ignore
  const { mutateAsync: deleteBlob } = useDeleteBlob({});
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  const [currentPlaylist, setCurrentPlaylist] = useState<Track[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');;

  // Settings State
  const [settings, setSettings] = useState<Settings>({
    crossfade: false,
    gapless: true,
    volumeBoost: false,
    highQuality: true,
    visualizer: true,
    ambientGlow: true
  });

  // Audio Cache (In-memory for session)
  const audioCache = useRef<Map<string | number, string>>(new Map());

  const toggleSetting = (key: keyof Settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const clearCache = () => {
    audioCache.current.forEach(url => URL.revokeObjectURL(url));
    audioCache.current.clear();
    showToast("Cache cleared successfully");
  };

  const handleCopyAddress = () => {
    if (account?.address) {
      navigator.clipboard.writeText(account.address.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };


  // Persist library to localStorage whenever tracks change
  useEffect(() => {
    localStorage.setItem('library', JSON.stringify(tracks));
  }, [tracks]);

  // Wallet isolation: reset Library when wallet changes, then load that wallet's tracks
  useEffect(() => {
    if (!account?.address) return;
    deletedIdsRef.current = []; // clear tombstones on wallet switch
    const load = async () => {
      try {
        const address = normalizeAddress(account.address.toString());
        const myTracks = await getAudioBlobs(address);
        setTracks(myTracks.filter(t => !deletedIdsRef.current.includes(String(t.id))));
      } catch (err) {
        console.error('Load wallet tracks error:', err);
      }
    };
    setTracks([]);
    load();
  }, [account?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time sync: poll every 5 s — ref ensures no stale closure and no interval restart on delete
  useEffect(() => {
    if (!account?.address) return;
    const sync = async () => {
      try {
        const address = normalizeAddress(account.address.toString());
        const incoming = await getAudioBlobs(address);
        setTracks(incoming.filter(t => !deletedIdsRef.current.includes(String(t.id))));
      } catch (err) {
        console.error('Sync wallet tracks error:', err);
      }
    };
    const interval = setInterval(sync, 5000);
    return () => clearInterval(interval);
  }, [account?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const audioRef = useRef<HTMLAudioElement>(null);

  // Manual refresh: force-fetch wallet tracks from GraphQL
  const refreshLibrary = useCallback(async () => {
    if (!account?.address) return;
    try {
      const address = normalizeAddress(account.address.toString());
      const fresh = await getAudioBlobs(address);
      setTracks(fresh.filter(t => !deletedIdsRef.current.includes(String(t.id))));
      showToast('Library refreshed', 'success');
    } catch (err) {
      console.error('Refresh error:', err);
      showToast('Refresh failed', 'error');
    }
  }, [account?.address]); // eslint-disable-line react-hooks/exhaustive-deps


  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const formatTime = (sec: number | undefined) => {
    if (sec === undefined || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatSize = (bytes: number | undefined) => {
    if (bytes === undefined || bytes === 0) return '—';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };
  const handleDelete = useCallback(async (id: string | number) => {
    const track = tracks.find(t => t.id === id);
    if (!track) return;

    // Shelby-level deletion: track.blobName is the plain filename used at upload time
    if (!track.blobName) {
      console.warn('Missing blobName, removing from UI only:', track);
      setTracks(prev => prev.filter(t => t.id !== id));
      showToast('Track removed from library', 'success');
      return;
    }

    try {
      if (!signAndSubmitTransaction) throw new Error('Wallet not connected');
      console.log('DELETE blobId (blob_commitment):', track.id);
      console.log('DELETE blobName (for reference): ', track.blobName);
      console.log('Wallet (signer):', account?.address?.toString());
      console.log('Track owner:    ', track.owner);
      
      // The Shelby SDK createDeleteBlobPayload explicitly expects the blobName SUFFIX 
      // without the account address prefix (e.g. "foo/bar.txt", not "@0x.../foo/bar.txt")
      // Extract everything after the first slash.
      const suffixName = track.blobName.substring(track.blobName.indexOf('/') + 1);
      
      // @ts-ignore
      await deleteBlob({
        blobName: suffixName,
        signer: { signAndSubmitTransaction }
      });
      console.log('Shelby blob deleted successfully:', suffixName);
    } catch (err) {
      console.error('Shelby delete error:', err);
      showToast('Delete failed on Shelby network', 'error');
      return; // preserve UI state if SDK call failed
    }

    // Tombstone the ID immediately so no fetch can re-add it
    deletedIdsRef.current = [...deletedIdsRef.current, String(id)];
    // Remove from UI immediately
    setTracks(prev => prev.filter(t => t.id !== id));
    showToast('Track removed from library', 'success');

    // Refresh from indexer after a short delay to catch any sync lag
    setTimeout(async () => {
      try {
        if (!account?.address) return;
        const address = normalizeAddress(account.address.toString());
        const fresh = await getAudioBlobs(address);
        setTracks(fresh.filter(t => !deletedIdsRef.current.includes(String(t.id))));
      } catch { /* polling will catch it on next cycle */ }
    }, 3000);
  }, [tracks, signAndSubmitTransaction, deleteBlob, account?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTrack = useCallback(async (track: Track, autoPlay = true, forcedPlaylist?: Track[]) => {
    let list = forcedPlaylist || (activeView === 'cloud-explorer' ? currentPlaylist : tracks);
    let index = list.findIndex(t => t.id === track.id);
    
    // If it's still -1 but forcedPlaylist exists, definitely use forcedPlaylist
    if (index < 0 && forcedPlaylist) {
      index = forcedPlaylist.findIndex(t => t.id === track.id);
      list = forcedPlaylist;
    }
    
    if (index < 0) return;

    // IMMEDIATELY pause the current track so audio doesn't overlap while the new one downloads
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setIsBuffering(true);
    
    // Check Cache
    if (audioCache.current.has(track.id)) {
      track.url = audioCache.current.get(track.id)!;
    } else if (track.source === 'SHELBY' || track.source === 'shelby') {
      // If we're loading a Shelby track, we'll cache it automatically 
      // when the URL is resolved. In this version, we'll store the URL 
      // if it's already a blob or a persistent link.
      if (track.url.startsWith('blob:') || track.url.includes('gateway')) {
        audioCache.current.set(track.id, track.url);
      }
    }
    
    setCurrentIndex(index);
    setCurrentPlaylist(list);
    setIsArtFlashing(true);
    setTimeout(() => setIsArtFlashing(false), 400);

    if (audioRef.current) {
      if (track.source === 'SHELBY') {
        try {
          const owner = track.owner || account?.address?.toString();
          if (!owner) throw new Error("Owner address missing for Shelby blob");
          
          const suffixName = (track.blobName || '').substring((track.blobName || '').indexOf('/') + 1);
          console.log("SDK Download Params:", owner, suffixName);
          
          const blobData = await shelbyClient.download({
            account: owner,
            blobName: suffixName
          });
          
          if (blobData && blobData.readable) {
            // Read full stream manually as requested
            const reader = blobData.readable.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) chunks.push(value);
            }

            // Create Blob with explicit audio/mpeg MIME type
            const blob = new Blob(chunks as any, { type: "audio/mpeg" });
            const size = blob.size;
            console.log("Blob size:", size);
            
            const localUrl = URL.createObjectURL(blob);
            audioRef.current.src = localUrl;

            audioRef.current.onloadedmetadata = () => {
              const dur = audioRef.current?.duration;
              if (dur) {
                setTrackDurations(prev => ({ ...prev, [track.id]: dur }));
                setTrackSizes(prev => ({ ...prev, [track.id]: size }));
              }
            };

            audioRef.current.load();
          } else {
            console.error("Failed to retrieve blob data from SDK");
            audioRef.current.src = track.url; // Last resort fallback
          }
        } catch (err) {
          console.error("SDK Playback Error:", err);
          audioRef.current.src = track.url; // Last resort fallback
          showToast('Failed to load track. Check your connection and try again.', 'error');
          setIsBuffering(false);
        }
      } else {
        audioRef.current.src = track.url;
      }

      audioRef.current.load();
      if (autoPlay) {
        audioRef.current.play().then(() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }).catch(() => {
          setIsBuffering(false);
        });
      } else {
        setIsBuffering(false);
      }
    }
  }, [tracks, activeView, currentPlaylist, account?.address, shelbyClient]);

  const togglePlay = () => {
    const list = activeView === 'library' ? tracks : currentPlaylist;
    if (currentIndex < 0 && list.length > 0) {
      loadTrack(list[0], true);
      return;
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const nextTrack = useCallback(() => {
    if (currentPlaylist.length === 0) return;
    let nextIndex;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * currentPlaylist.length);
    } else {
      nextIndex = (currentIndex + 1) % currentPlaylist.length;
    }
    loadTrack(currentPlaylist[nextIndex], true);
  }, [currentPlaylist, isShuffle, currentIndex, loadTrack]);

  const prevTrack = () => {
    if (currentPlaylist.length === 0) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    let prevIndex;
    if (isShuffle) {
      prevIndex = Math.floor(Math.random() * currentPlaylist.length);
    } else {
      prevIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    }
    loadTrack(currentPlaylist[prevIndex], true);
  };

  const handleFilesSelected = async (files: File[]) => {
    if (!connected) {
      showToast("Please connect your wallet first", "error");
      return;
    }

    try {
      setUploadStatus('uploading');
      
      const newFiles = await Promise.all(
        files.map(async (file) => {
          const buffer = await file.arrayBuffer();
          // Extract ID3 tags for dynamic metadata on-chain
          const { artist, title } = parseID3Metadata(buffer);
          
          let formattedName = file.name;
          if (artist && title) {
            formattedName = `${artist} - ${title}.mp3`;
          } else if (title) {
            formattedName = `${title}.mp3`;
          } else {
            // Keep original filename if no reliable ID3 tags exist
            formattedName = file.name;
          }

          return {
            name: formattedName,
            file,
            data: new Uint8Array(buffer),
            size: formatSize(file.size)
          };
        })
      );
      
      setPreparedFiles(newFiles);
      setUploadStatus('idle');
      showToast(`${files.length} file(s) prepared for sync`, "success");
    } catch (e) {
      console.error("File Preparation Error:", e);
      setUploadStatus('error');
      showToast("Failed to read files", "error");
    }
  };

  const performUpload = async () => {
    if (preparedFiles.length === 0) return;

    try {
      setUploadStatus('uploading');
      
      if (!account || !signAndSubmitTransaction) {
        throw new Error("Wallet not fully connected or signer unavailable");
      }

      const addressString = typeof account.address === 'string' 
        ? account.address 
        : (account.address as any).toString();

      console.log("Signer Prep (Direct Click):", {
        address: addressString,
        hasSigner: !!signAndSubmitTransaction,
        network: network?.name
      });

      const blobDataList = preparedFiles.map(f => ({
        blobName: f.name,
        blobData: f.data
      }));

      await upload({
        blobs: blobDataList,
        expirationMicros: (Date.now() + 1000 * 60 * 60 * 24 * 30) * 1000, 
        // @ts-ignore
        signer: { 
          account, 
          accountAddress: addressString,
          signAndSubmitTransaction 
        }
      });
      
      console.log("Shelby Upload Completed");

      setPreparedFiles([]);
      setUploadStatus('success');
      showToast("Upload Successful! Syncing library...", "success");
      
      // The indexer usually takes ~1-3 seconds to see the new blob.
      setTimeout(() => {
         refreshLibrary();
      }, 2500);

      setTimeout(() => {
        setUploadStatus('idle');
      }, 4000);
    } catch (e) {
      console.error("SDK Upload Error:", e);
      setUploadStatus('error');
      showToast("Shelby upload failed", "error");
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  useEffect(() => {
    if (activeView === 'library') {
      setCurrentPlaylist(tracks);
    }
  }, [activeView, tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      if (isLoop) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        nextTrack();
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [currentIndex, isLoop, nextTrack]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) nextTrack();
          else if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 5, audioRef.current.duration);
          break;
        case 'ArrowLeft':
          if (e.shiftKey) prevTrack();
          else if (audioRef.current) audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 5, 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => Math.min(1, v + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => Math.max(0, v - 0.05));
          break;
        case 's':
          setIsShuffle(s => !s);
          break;
        case 'l':
          setIsLoop(l => !l);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isShuffle, isLoop, nextTrack, currentIndex, currentPlaylist]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const currentTrack = currentPlaylist[currentIndex];

  const dismissSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);
  return (
    <div className="app">
      <header className="mobile-header">
        <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>
        <div className="logo-text"><span>Shelby Sound Network</span></div>
        <div style={{ width: '40px' }}></div>
      </header>

      {sidebarOpen && <div className="sidebar-overlay" onClick={dismissSidebar}></div>}

      <div className="content-area">
        <Sidebar 
          activeView={activeView} 
          onViewChange={setActiveView} 
          nowPlayingTrack={currentTrack}
          isPlaying={isPlaying}
          isOpen={sidebarOpen}
          onClose={dismissSidebar}
        />

        <main className="main">
          {activeView === 'library' && (
            <div className="view">
              <div className="view-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div className="view-title">
                      Library
                      <span className="track-count-badge">
                        {tracks.length} track{tracks.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="view-subtitle">YOUR MUSIC COLLECTION</div>
                  </div>
                  <button
                    onClick={refreshLibrary}
                    disabled={!account?.address}
                    style={{
                      padding: '6px 14px',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '4px',
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: '11px',
                      fontFamily: '"Space Mono", monospace',
                      fontWeight: '700',
                      letterSpacing: '1px',
                      cursor: account?.address ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                    </svg>
                    REFRESH
                  </button>
                </div>
              </div>
              {/* Library Search Bar */}
              <input
                type="text"
                value={librarySearch}
                onChange={e => setLibrarySearch(e.target.value)}
                placeholder="Search title or artist..."
                style={{
                  width: '100%', margin: '10px 0 6px', padding: '8px 14px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px', color: 'white', fontSize: '13px',
                  fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box'
                }}
              />
              <div className="track-list-header">
                <div className="header-num">#</div>
                <div className="header-title">TITLE</div>
                <div className="header-size hidden sm:table-cell">SIZE</div>
                <div className="header-duration hidden sm:table-cell">DURATION</div>
                <div className="header-actions hidden sm:table-cell text-right">ACTIONS</div>
              </div>
              <TrackList 
                tracks={tracks.filter(t =>
                  !librarySearch ||
                  t.title.toLowerCase().includes(librarySearch.toLowerCase()) ||
                  t.artist.toLowerCase().includes(librarySearch.toLowerCase())
                )} 
                currentIndex={currentPlaylist === tracks ? currentIndex : -1}
                isPlaying={isPlaying} 
                onTrackSelect={(i) => {
                  const filtered = tracks.filter(t =>
                    !librarySearch ||
                    t.title.toLowerCase().includes(librarySearch.toLowerCase()) ||
                    t.artist.toLowerCase().includes(librarySearch.toLowerCase())
                  );
                  loadTrack(filtered[i], true);
                }}
                onDelete={handleDelete}
                formatTime={formatTime}
                formatSize={formatSize}
                durations={trackDurations}
                sizes={trackSizes}
              />
            </div>
          )}

          {activeView === 'cloud-explorer' && (
            <CloudExplorer 
              onTrackSelect={(track: Track, allTracks?: Track[]) => {
                if (currentPlaylist.length > 0 && currentPlaylist[currentIndex]?.id === track.id) {
                  togglePlay();
                } else {
                  loadTrack(track, true, allTracks);
                }
              }}
              currentIndex={currentPlaylist.length > 0 && currentPlaylist[0].source === 'SHELBY' ? currentIndex : -1}
              isPlaying={isPlaying}
              formatTime={formatTime}
              formatSize={formatSize}
              durations={trackDurations}
              sizes={trackSizes}
            />
          )}

          {activeView === 'upload' && (
            <div className="view">
              <div className="view-header">
                <div className="view-title">Upload</div>
                <div className="view-subtitle">ADD TRACKS TO YOUR LIBRARY</div>
              </div>
              <UploadZone onFilesSelected={handleFilesSelected} />
              
              {preparedFiles.length > 0 && (
                <div className="prepared-files-container" style={{ margin: '16px 0', padding: '16px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '12px', fontFamily: '"Space Mono", monospace', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {preparedFiles.length} File(s) Ready to Sync
                  </div>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '16px' }}>
                    {preparedFiles.map((f, i) => (
                      <div key={i} style={{ fontSize: '12px', color: 'white', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        • {f.name}
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={performUpload}
                    className="sync-button"
                    disabled={uploadStatus === 'uploading'}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: 'var(--accent)',
                      color: 'black',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: '700',
                      fontFamily: '"Space Mono", monospace',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {uploadStatus === 'uploading' ? (
                      'Syncing...'
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        SYNC TO SHELBY NETWORK
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => setPreparedFiles([])}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '4px',
                      backgroundColor: 'transparent',
                      color: 'rgba(255,255,255,0.4)',
                      border: 'none',
                      fontSize: '10px',
                      fontFamily: '"Space Mono", monospace',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              
              {uploadStatus === 'uploading' && !preparedFiles.length && (
                <div style={{ textAlign: 'center', color: 'var(--accent)', margin: '16px var(--gutter)', fontSize: '13px', fontFamily: '"Space Mono", monospace' }}>
                  Uploading to Shelby Network...
                </div>
              )}
              {uploadStatus === 'success' && (
                <div style={{ textAlign: 'center', color: 'var(--accent-green)', margin: '16px var(--gutter)', fontSize: '13px', fontFamily: '"Space Mono", monospace' }}>
                  Upload Successful!
                </div>
              )}
              {uploadStatus === 'error' && (
                <div style={{ textAlign: 'center', color: '#ff4b2b', margin: '16px var(--gutter)', fontSize: '13px', fontFamily: '"Space Mono", monospace' }}>
                  Upload Failed
                </div>
              )}
              {connected && network?.name !== Network.TESTNET && (
                <div style={{ textAlign: 'center', color: '#ff4b2b', margin: '16px var(--gutter)', fontSize: '12px', fontFamily: '"Space Mono", monospace' }}>
                  Please switch to Aptos Testnet
                </div>
              )}
              <div className="shelby-notice">
                <div className="shelby-title">⚡ Shelby Integration — Phase 1 Active</div>
                <div className="shelby-desc">
                  Decentralized storage gateway is initializing. Connect your Aptos wallet to begin syncing
                  your library to the Shelby Network. Cloud tracks are now visible in the Cloud Explorer tab.
                </div>
              </div>
            </div>
          )}

          {activeView === 'settings' && (
            <div className="view">
              <div className="view-header">
                <div className="view-title">Settings</div>
                <div className="view-subtitle">PLAYER CONFIGURATION</div>
              </div>
              <div className="settings-grid">
                <div className="settings-card">
                  <div className="settings-card-title">Playback</div>
                  <div className="settings-row">
                    <div className="settings-label">Crossfade between tracks</div>
                    <div className={`settings-toggle ${settings.crossfade ? 'active' : ''}`} onClick={() => toggleSetting('crossfade')}>
                      <div className="settings-toggle-knob"></div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-label">Gapless playback</div>
                    <div className={`settings-toggle ${settings.gapless ? 'active' : ''}`} onClick={() => toggleSetting('gapless')}>
                      <div className="settings-toggle-knob"></div>
                    </div>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-title">Audio Engine</div>
                  <div className="settings-row">
                    <div className="settings-label">High-Fidelity Rendering</div>
                    <div className={`settings-toggle ${settings.highQuality ? 'active' : ''}`} onClick={() => toggleSetting('highQuality')}>
                      <div className="settings-toggle-knob"></div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-label">Volume Boost (+6dB)</div>
                    <div className={`settings-toggle ${settings.volumeBoost ? 'active' : ''}`} onClick={() => toggleSetting('volumeBoost')}>
                      <div className="settings-toggle-knob"></div>
                    </div>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-title">Visuals</div>
                  <div className="settings-row">
                    <div className="settings-label">Visualizer Overlay</div>
                    <div className={`settings-toggle ${settings.visualizer ? 'active' : ''}`} onClick={() => toggleSetting('visualizer')}>
                      <div className="settings-toggle-knob"></div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-label">Ambient Pulse Glow</div>
                    <div className={`settings-toggle ${settings.ambientGlow ? 'active' : ''}`} onClick={() => toggleSetting('ambientGlow')}>
                      <div className="settings-toggle-knob"></div>
                    </div>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-title">Storage & Cache</div>
                  <div className="settings-row">
                    <div className="settings-label">Local Cache Usage</div>
                    <div className="settings-value">45.2 MB / 256 MB</div>
                  </div>
                  <div className="cache-bar-container">
                    <div className="cache-bar-fill" style={{ width: '18%' }}></div>
                  </div>
                  <button className="settings-action-btn" onClick={clearCache}>Clear All Cache</button>
                </div>

                <div className="settings-card">
                  <div className="settings-card-title">Network</div>
                  <div className="settings-row">
                    <div className="settings-label">Environment Status</div>
                    <div className="settings-value" style={{ color: 'var(--accent-green)' }}>
                      Shelby Testnet (Active)
                    </div>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                    <div className="settings-label">Wallet Address</div>
                    <div className="address-container">
                      <div className="settings-value full-address">
                        {account?.address?.toString() || 'Not Connected'}
                      </div>
                      <button 
                        className={`copy-btn ${copied ? 'copied' : ''}`}
                        onClick={handleCopyAddress}
                        disabled={!account?.address}
                      >
                        {copied ? 'COPIED!' : 'COPY'}
                      </button>
                    </div>
                  </div>
                  <button className="settings-action-btn disconnect-btn" onClick={() => showToast("Wallet management active in Sidebar")}>Manage Identity</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <PlayerBar 
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isBuffering={isBuffering}
        isShuffle={isShuffle}
        isLoop={isLoop}
        volume={volume}
        isMuted={isMuted}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={togglePlay}
        onNext={nextTrack}
        onPrev={prevTrack}
        onToggleShuffle={() => setIsShuffle(s => !s)}
        onToggleLoop={() => setIsLoop(l => !l)}
        onSeek={(t) => { if (audioRef.current) audioRef.current.currentTime = t; }}
        onVolumeChange={setVolume}
        onToggleMute={() => setIsMuted(m => !m)}
        formatTime={formatTime}
        audioRef={audioRef}
        isArtFlashing={isArtFlashing}
        settings={settings}
      />

      {toast && (
        <div className={`toast show`} style={{ borderLeftColor: toast.type === 'error' ? 'var(--accent-hot)' : 'var(--accent-green)' }}>
          {toast.msg}
        </div>
      )}

      <audio ref={audioRef} id="audioPlayer" />
    </div>
  );
}

export default App;
