import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import gsap from 'gsap';

// GSAP matchMedia is core, no extra plugins needed
import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import TrackList from './components/TrackList';
import UploadZone from './components/UploadZone';
import CloudExplorer from './components/CloudExplorer';
import { getAudioBlobs, cacheTrackMetadata, findBlobIdentity } from './utils/shelbyExplorer';
import { saveMetadata, updateTrackVisibility, deleteMetadata } from './utils/metadataService';
import { parseID3Metadata } from './utils/id3Parser';
import { normalizeAddress } from './utils/addressUtils';
import type { Track, View, Settings } from './types';
import './index.css';

import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';
import { useUploadBlobs, useDeleteBlob, useShelbyClient } from '@shelby-protocol/react';

function App() {
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
  const [isReconnecting, setIsReconnecting] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [preparedFiles, setPreparedFiles] = useState<{ name: string, data: Uint8Array, title: string, artist: string, sizeRaw?: number, duration?: number }[]>([]);
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
  const [librarySearch, setLibrarySearch] = useState('');
  const [debouncedLibrarySearch, setDebouncedLibrarySearch] = useState('');

  const mainRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Library Pagination State (Moved to Top-Level for React hook safety)
  const calculateLibLimit = useCallback(() => {
    if (typeof window === 'undefined') return 15;
    const width = window.innerWidth;
    if (width < 768) return 5;
    if (width < 1024) return 10;
    return 15;
  }, []);

  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryLimit, setLibraryLimit] = useState(calculateLibLimit());
  const libraryListRef = useRef<HTMLDivElement>(null);
  const libraryPaginationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      const newLimit = calculateLibLimit();
      setLibraryLimit(prev => {
        if (prev !== newLimit) {
          setLibraryPage(1);
          return newLimit;
        }
        return prev;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateLibLimit]);

  const handleLibraryPageChange = (newPage: number, totalPages: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === libraryPage) return;

    // Immediate state update for responsiveness
    setLibraryPage(newPage);

    // Scroll main content to top
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Secondary animation (non-blocking)
    const animTargets = [libraryListRef.current, libraryPaginationRef.current].filter(Boolean);
    if (animTargets.length > 0) {
      gsap.fromTo(animTargets,
        { opacity: 0, y: 15, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5, ease: "power3.out", stagger: 0.05, clearProps: "opacity,transform,filter" }
      );
    }
  };

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Animate Overlay
      if (sidebarOpen) {
        gsap.fromTo(overlayRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.3, ease: "power2.out", display: "block" }
        );
      } else {
        gsap.to(overlayRef.current,
          {
            opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => {
              if (overlayRef.current) overlayRef.current.style.display = "none";
            }
          }
        );
      }
    }, mainRef);
    return () => ctx.revert();
  }, [sidebarOpen]);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      // Desktop & Tablet View Entry
      mm.add("(min-width: 768px)", () => {
        gsap.fromTo(".view",
          { opacity: 0, x: 20, filter: "blur(10px)" },
          { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.6, ease: "power2.out", clearProps: "all" }
        );
      });

      // Mobile/Smartphone View Entry
      mm.add("(max-width: 767px)", () => {
        gsap.fromTo(".view",
          { opacity: 0, y: 30, filter: "blur(5px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out", clearProps: "all" }
        );
      });
    }, mainRef);

    return () => ctx.revert();
  }, [activeView]);

  // Settings State
  const [settings, setSettings] = useState<Settings>({
    crossfade: false,
    gapless: true,
    volumeBoost: false,
    highQuality: true,
    visualizer: true,
    ambientGlow: true
  });

  // Real-time Tracker for UI
  const [cacheUsageBytes, setCacheUsageBytes] = useState<number>(0);

  // ─── Audio Cache ────────────────────────────────────────────────────────────
  // Stores { url, size, createdAt, lastAccessed } per track ID.
  // Eviction is LRU: the least-recently-accessed entry is evicted first.
  const CACHE_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
  const audioCache = useRef<Map<string | number, { url: string; size: number; createdAt: number; lastAccessed: number }>>(new Map());
  const cacheTotalBytes = useRef(0);

  // Preload audio element — plays silently in background for next track URL prefetch
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Concurrency guard ───────────────────────────────────────────────────────
  // Each loadTrack() call mints a unique Symbol token at entry.
  // Async checkpoints compare against this ref; if the token has changed (meaning
  // a newer loadTrack() was called), the stale operation returns immediately
  // without touching audio state.
  const activeLoadTokenRef = useRef<symbol | null>(null);

  // Tracks the currently registered onStreamError handler so it can be removed
  // before the next loadTrack() attaches a new one — prevents stale-closure races.
  const activeStreamErrorRef = useRef<(() => void) | null>(null);

  /** Add/replace an entry; evict least-recently-used if over 100 MB. */
  const cacheSet = useCallback((id: string | number, url: string, size: number) => {
    const existing = audioCache.current.get(id);
    if (existing) {
      URL.revokeObjectURL(existing.url);
      cacheTotalBytes.current -= existing.size;
    }
    audioCache.current.set(id, { url, size, createdAt: Date.now(), lastAccessed: Date.now() });
    cacheTotalBytes.current += size;
    // Evict LRU (least-recently accessed) entries until under the size limit
    while (cacheTotalBytes.current > CACHE_MAX_BYTES) {
      let lruId: string | number | null = null;
      let lruTime = Infinity;
      for (const [eid, entry] of audioCache.current) {
        if (entry.lastAccessed < lruTime) { lruTime = entry.lastAccessed; lruId = eid; }
      }
      if (lruId === null) break;
      const lruEntry = audioCache.current.get(lruId)!;
      URL.revokeObjectURL(lruEntry.url);
      cacheTotalBytes.current -= lruEntry.size;
      audioCache.current.delete(lruId);
    }
    setCacheUsageBytes(cacheTotalBytes.current);
  }, []);

  /** Remove a single cache entry and revoke its object URL. */
  const cacheDelete = useCallback((id: string | number) => {
    const entry = audioCache.current.get(id);
    if (entry) {
      URL.revokeObjectURL(entry.url);
      cacheTotalBytes.current -= entry.size;
      audioCache.current.delete(id);
    }
    setCacheUsageBytes(cacheTotalBytes.current);
  }, []);

  const toggleSetting = (key: keyof Settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const clearCache = () => {
    audioCache.current.forEach(entry => URL.revokeObjectURL(entry.url));
    audioCache.current.clear();
    cacheTotalBytes.current = 0;
    setCacheUsageBytes(0);
    showToast("Cache cleared successfully");
  };

  const handleCopyAddress = () => {
    if (account?.address) {
      navigator.clipboard.writeText(account.address.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };


  // [REMOVED] localStorage.setItem — GraphQL is the source of truth.
  // Writing here caused stale deleted tracks to reappear after full reload.

  // Wallet isolation: reset Library when wallet changes, then load that wallet's tracks
  useEffect(() => {
    if (!account?.address) {
      setTracks([]);
      return;
    }
    deletedIdsRef.current = []; // clear tombstones on wallet switch
    const currentAddress = normalizeAddress(account.address.toString());

    const load = async () => {
      try {
        const myTracks = await getAudioBlobs(currentAddress, undefined, true);
        cacheTrackMetadata(myTracks);

        // [STRICT ISOLATION] Secondary filter to ensure no cross-account leakage
        const filtered = myTracks.filter(t =>
          normalizeAddress(t.owner || '') === currentAddress &&
          !deletedIdsRef.current.includes(String(t.id))
        );

        setTracks(filtered);
      } catch { /* getAudioBlobs already handles errors internally */ }
    };
    setTracks([]);
    load();
  }, [account?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Visibility-aware polling with AbortController ───────────────────────────
  useEffect(() => {
    if (!account?.address) return;
    const currentAddress = normalizeAddress(account.address.toString());

    let running = false;
    let timerId: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let syncAbort: AbortController | null = null;

    const sync = async () => {
      if (running || document.hidden || cancelled) return;
      running = true;
      syncAbort?.abort(); // cancel any previous in-flight request
      syncAbort = new AbortController();
      try {
        if (!account?.address) return;
        const incoming = await getAudioBlobs(currentAddress, syncAbort.signal, true);
        if (!cancelled) {
          // [STRICT ISOLATION] Ensure polling data strictly belongs to active user
          const merged = incoming.filter(t =>
            normalizeAddress(t.owner || '') === currentAddress &&
            !deletedIdsRef.current.includes(String(t.id))
          );
          setTracks(merged);
        }
      } finally {
        running = false;
        if (!cancelled) timerId = setTimeout(sync, 5000);
      }
    };

    const onVisibility = () => {
      if (!document.hidden && !running && !cancelled) {
        clearTimeout(timerId);
        sync();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    timerId = setTimeout(sync, 5000);

    return () => {
      cancelled = true;
      syncAbort?.abort(); // [FORCE KILL] Stop any active sync from previous account
      clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [account?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const audioRef = useRef<HTMLAudioElement>(null);

  // Manual refresh: force-fetch wallet tracks from GraphQL
  const refreshLibrary = useCallback(async () => {
    if (!account?.address) return;
    try {
      // Use raw address for querying
      const rawAddress = account.address.toString();
      const fresh = await getAudioBlobs(rawAddress, undefined, true);
      cacheTrackMetadata(fresh);
      const newTracks = fresh.filter(t =>
        !deletedIdsRef.current.includes(String(t.id))
      );
      setTracks(newTracks);
      showToast('Library refreshed', 'success');
    } catch {
      showToast('Refresh failed', 'error');
    }
  }, [account?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce library search — 300 ms after last keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLibrarySearch(librarySearch), 300);
    return () => clearTimeout(t);
  }, [librarySearch]);


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
      // No on-chain blob — just remove from UI and release any cached objectURL
      cacheDelete(id);
      setTracks(prev => prev.filter(t => t.id !== id));
      showToast('Track removed from library', 'success');
      return;
    }

    try {
      if (!signAndSubmitTransaction) throw new Error('Wallet not connected');

      const suffixName = track.blobName.substring(track.blobName.indexOf('/') + 1);

      // 1. DELETE FROM SHELBY (Blockchain)
      try {
        // @ts-ignore
        await deleteBlob({
          blobName: suffixName,
          signer: { signAndSubmitTransaction }
        });
      } catch (bcErr: any) {
        // [SMART CLEANUP] If the blob is already gone from blockchain (0x3 / Not Found), 
        // we should STILL proceed to clean up the Supabase metadata.
        const errMsg = bcErr?.message || '';
        if (errMsg.includes('0x3') || errMsg.includes('E_BLOB_NOT_FOUND') || errMsg.includes('not found')) {
          if (import.meta.env.DEV) console.warn('[Cleanup] Blob already missing from chain. Proceeding with database cleanup.');
        } else {
          // If it's a DIFFERENT error (e.g. User rejected, Insufficient gas), we should STOP and show the error.
          throw bcErr;
        }
      }

      // 2. DELETE FROM SUPABASE (Sync)
      if (track.blob_commitment) {
        await deleteMetadata(track.blob_commitment);
        if (import.meta.env.DEV) console.log("SUPABASE SYNC-DELETE:", track.blob_commitment);
      }

      // 3. UPDATE UI
      deletedIdsRef.current.push(String(id));
      setTracks(prev => prev.filter(t => String(t.id) !== String(id)));
      showToast('Track deleted successfully', 'success');
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Delete failed:', err);
      showToast(err?.message || 'Delete failed. Check your wallet status.', 'error');
    }
  }, [tracks, signAndSubmitTransaction, deleteBlob]); // eslint-disable-line react-hooks/exhaustive-deps


  // ─── Official Blob Download (Back to Docs) ─────────────────────
  // Downloads the track via the Shelby SDK (Official documented method).
  const loadBlobFallback = async (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      // [Official Alignment]: Murni menggunakan SDK sesuai dokumentasi
      // Discovery di loadTrack menjamin data ini ada untuk Cloud Explorer.
      const owner = track.owner || (activeView === 'library' ? account?.address?.toString() : null);
      if (owner && track.blobName && track.blobName.length > 5) {
        const suffixName = (track.blobName || '').substring((track.blobName || '').indexOf('/') + 1);
        if (suffixName && suffixName.length > 5) {
          try {
            const blobData = await shelbyClient.download({ account: owner, blobName: suffixName });
            if (blobData && blobData.readable) {
              const reader = blobData.readable.getReader();
              const chunks: Uint8Array[] = [];
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
              }
              const blob = new Blob(chunks as any, { type: 'audio/mpeg' });
              const localUrl = URL.createObjectURL(blob);
              cacheSet(track.id, localUrl, blob.size);
              audio.src = localUrl;
              audio.load();
              setIsReconnecting(false);
              return;
            }
          } catch (sdkErr: any) {
            if (import.meta.env.DEV) console.error("[SDK] Call failed:", sdkErr.message);

            // [Memory Cache Protector]: Jika memutar dari Cache Lokal, blok ini akan bypass.
            // Namun jika tidak, artinya file ini gagal dimuat karena namanya terpotong/mismatch
            // di storage node (umumnya akibat karakter spesial saat upload).
            if (audio.src && audio.src.startsWith('blob:')) {
              if (import.meta.env.DEV) console.warn("[Fallback] Bypassed error 404: Audio securely playing via Memory Cache.");
              return;
            }

            showToast('Lagu gagal dimuat. Kemungkinan file di jaringan terkorupsi (404). Silakan Re-upload lagu ini.', 'error');
            setIsReconnecting(false);
          }
        }
      } else {
        if (import.meta.env.DEV) console.warn("[SDK] Discovery incomplete for:", track.title);
        showToast('Identifikasi lagu tertunda... Coba sebentar lagi.', 'error');
      }
    } catch (err: any) {
      setIsReconnecting(false);
      setIsBuffering(false);
    }
  };

  /**
   * Helper to sync missing size/duration to Supabase.
   * If a track is played and its technical metadata is missing, we capture it
   * locally and push it to the global store so others can see it immediately.
   */
  const syncTrackMetadata = async (track: Track, detectedDuration: number, detectedSize?: number) => {
    // Only sync if we have a valid commitment and the track is missing info
    if (!track.blob_commitment) return;

    const needsDuration = !track.duration && detectedDuration > 0;
    const needsSize = !track.size && detectedSize && detectedSize > 0;

    if (needsDuration || needsSize) {
      if (import.meta.env.DEV) console.log(`[Sync] Auto-detecting metadata for track: "${track.title}"`);

      const updatedMetadata: any = {
        title: track.title,
        artist: track.artist,
        owner: track.owner,
        is_public: !!track.is_public, // Maintain existing visibility
        duration: track.duration || detectedDuration,
        size: track.size || detectedSize,
        blob_name: track.blobName || ''
      };

      try {
        const success = await saveMetadata(track.blob_commitment, updatedMetadata);
        if (success && import.meta.env.DEV) {
          console.log(`[Sync] Metadata synced successfully: ${detectedDuration}s / ${detectedSize} bytes`);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error("[Sync] Failed to auto-sync detected metadata:", err);
      }
    }
  };

  const loadTrack = useCallback(async (track: Track, autoPlay = true, forcedPlaylist?: Track[]) => {
    if (import.meta.env.DEV) console.log(`[LoadTrack] Attempting: "${track.title}" (ID: ${track.id}) from ${track.source}. forcedPlaylist: ${!!forcedPlaylist}`);

    let list = forcedPlaylist || (activeView === 'cloud-explorer' ? currentPlaylist : tracks);
    let index = list.findIndex(t => String(t.id).toLowerCase() === String(track.id).toLowerCase());

    // If it's still -1 but forcedPlaylist exists, definitely use forcedPlaylist
    if (index < 0 && forcedPlaylist) {
      index = forcedPlaylist.findIndex(t => String(t.id).toLowerCase() === String(track.id).toLowerCase());
      list = forcedPlaylist;
    }

    if (index < 0) {
      if (import.meta.env.DEV) console.warn(`[LoadTrack] Track not found in current context playlist.`, { trackId: track.id, listLength: list.length });
      return;
    }

    // [Official Alignment]: Broken failsafe reconstruction removed to stop DNS errors.
    // We now rely on Sanitizer and direct SDK/Portal path.

    // ── Concurrency guard: mint a unique token for THIS invocation ───────────────
    // Any previous async operation that reads activeLoadTokenRef and finds a
    // different token will abort without touching audio state.
    const myToken = Symbol();
    activeLoadTokenRef.current = myToken;
    const isStale = () => activeLoadTokenRef.current !== myToken;

    // ── Clean up any in-flight onStreamError from a previous loadTrack call ──────
    if (activeStreamErrorRef.current && audioRef.current) {
      audioRef.current.removeEventListener('error', activeStreamErrorRef.current);
      activeStreamErrorRef.current = null;
    }

    // IMMEDIATELY pause the current track so audio doesn't overlap while the new one downloads
    if (audioRef.current) {
      audioRef.current.pause();
      // Clear src to immediately abort any pending network requests or play() promises
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    // Note: We do NOT need to call setIsPlaying(false) here manually. 
    // The native 'pause' event executed above will trigger the handlePause 
    // listener and sync the state naturally, eliminating UI mismatches.
    setIsBuffering(true);

    // ─── Cache check ───────────────────────────────────────────────────────────
    // Use cached objectURL if available (avoids re-downloading from Shelby).
    const cached = audioCache.current.get(track.id);
    if (cached) {
      track.url = cached.url;
      // Update lastAccessed so LRU eviction keeps frequently-used tracks longer
      cached.lastAccessed = Date.now();
    } else if ((track.source === 'SHELBY' || track.source === 'shelby') &&
      (track.url.startsWith('blob:') || track.url.includes('gateway'))) {
      // Gateway URL — safe to cache as-is (persistent link, size unknown)
      cacheSet(track.id, track.url, 0);
    }

    setCurrentIndex(index);
    setCurrentPlaylist(list);
    setIsArtFlashing(true);
    setTimeout(() => setIsArtFlashing(false), 400);

    if (audioRef.current) {
      // [Official Sync v5]: Instant URL Sanitization
      // [Official Portal Alignment]: ONLY wipe dead/old domains. 
      // Preservation of gateway.shelby.xyz is vital for playback stability.
      if (track.url && (track.url.includes('api.testnet.shelby.xyz') || track.url.includes('shelby.network'))) {
        if (import.meta.env.DEV) console.log(`[Sanitizer] Cleaning old/broken URL: ${track.url}`);
        track.url = '';
      }

      // [SOUND-RECOVERY]: Early source assignment ensures play() doesn't fail on empty src.
      // This is safe even if loadBlobFallback overwrites it later.
      if (track.url) audioRef.current.src = track.url;

      if (track.source === 'SHELBY' || track.source === 'shelby') {
        // [NORMAL PATH] ALWAYS prioritize Shelby SDK for Testnet playback.

        // [Unified Harmony Speed Fix]: Only run blocking Discovery if we are missing
        // the identity (blobName). For Library tracks, identity is usually present.
        if (!track.blobName && track.blob_commitment) {
          if (import.meta.env.DEV) console.log(`[Discovery] Missing identity for "${track.title}". Discovery active...`);

          try {
            // [Collision Fix]: Pass track.owner explicitly! Jika kita tidak mengarahkan ownernya,
            // dan Indexer menyimpan 2 versi Hex ID yang berwujud sama (milik Keyless_Lama dan Petra_Baru),
            // Indexer akan selalu mengembalikan versi Keyless_Lama yang cacat dan berujung 404!
            const identity = await findBlobIdentity(track.blob_commitment, track.owner);

            if (identity) {
              track.blobName = identity.blobName;
              // Tetap sinkron namun kali ini dijamin tidak akan tersesat dari track.owner aslinya!
              track.owner = identity.owner;

              if (import.meta.env.DEV) console.log(`[Discovery] Identity resolved: ${track.blobName} for owner: ${track.owner}. Syncing...`);
              syncTrackMetadata(track, 0, 0);
            }
          } catch (discErr) {
            if (import.meta.env.DEV) console.error(`[Discovery] Failed to find identity:`, discErr);
          }
        }

        await loadBlobFallback(track);
        if (isStale()) { setIsBuffering(false); return; }
      } else {
        // Non-SHELBY source (local files, etc.) — unchanged
        audioRef.current.src = track.url;
        audioRef.current.load(); // single explicit load() for non-SHELBY path
      }

      if (autoPlay) {
        audioRef.current.play().then(() => {
          if (isStale()) return; // guard: don't update state for an old track
          setIsBuffering(false);

          // ─── Lightweight analytics (local-only) ─────────────────────────────
          try {
            const key = 'ssn_play_events';
            const prev = JSON.parse(sessionStorage.getItem(key) || '[]');
            prev.push({ title: track.title, artist: track.artist, ts: Date.now() });
            if (prev.length > 100) prev.splice(0, prev.length - 100);
            sessionStorage.setItem(key, JSON.stringify(prev));
          } catch { /* sessionStorage quota exceeded — ignore */ }

          // ─── Next-track preload ──────────────────────────────────────────────
          setTimeout(() => {
            if (isStale()) return; // guard: don't preload if user already moved on
            const nextIdx = (index + 1) % list.length;
            const nextTrackItem = list[nextIdx];
            if (
              nextTrackItem &&
              nextTrackItem.id !== track.id &&
              nextTrackItem.url &&
              !audioCache.current.has(nextTrackItem.id)
            ) {
              if (!preloadAudioRef.current) {
                preloadAudioRef.current = new Audio();
                preloadAudioRef.current.preload = 'metadata';
              }
              preloadAudioRef.current.src = nextTrackItem.url;
              preloadAudioRef.current.load();
            }
          }, 2000);

        }).catch((e) => {
          if (isStale()) { setIsBuffering(false); return; } // guard
          // AbortError is thrown natively when a play() promise is interrupted by a new src
          if (e.name !== 'AbortError') setIsBuffering(false);
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

    // Rely exclusively on the native audio element's state, preventing 
    // desyncs between UI (isPlaying) and the actual media engine.
    if (audioRef.current && audioRef.current.src) {
      if (!audioRef.current.paused) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => { });
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

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per file

  const handleFilesSelected = async (files: File[]) => {
    if (!connected) {
      showToast("Please connect your wallet first", "error");
      return;
    }

    // Validate file sizes before processing
    const oversized = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      showToast(`File too large (max 100 MB): ${oversized.map(f => f.name).join(', ')}`, "error");
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
          }

          // PHASE 2: Save structured metadata explicitly to local cache immediately
          try {
            const existing = JSON.parse(localStorage.getItem('track_metadata') || '{}');
            existing[formattedName] = {
              title: title || formattedName.replace(/\.[^.]+$/, '').trim(),
              artist: artist || 'Unknown Artist'
            };
            localStorage.setItem('track_metadata', JSON.stringify(existing));
          } catch { /* storage unavailable */ }

          // PHASE 3: Pre-detect duration for Supabase sync
          let duration = 0;
          try {
            const tempAudio = new Audio();
            const objectUrl = URL.createObjectURL(file);
            tempAudio.src = objectUrl;

            duration = await new Promise<number>((resolve) => {
              tempAudio.onloadedmetadata = () => {
                const d = tempAudio.duration;
                URL.revokeObjectURL(objectUrl);
                resolve(d && !isNaN(d) ? d : 0);
              };
              tempAudio.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(0);
              };
              // Wait up to 5 seconds for technical metadata
              setTimeout(() => {
                URL.revokeObjectURL(objectUrl);
                resolve(0);
              }, 5000);
            });
          } catch { duration = 0; }

          return {
            name: formattedName,
            file,
            data: new Uint8Array(buffer),
            sizeRaw: file.size,
            size: formatSize(file.size),
            title: title || formattedName.replace(/\.[^.]+$/, '').trim(),
            artist: artist || 'Unknown Artist',
            duration
          };
        })
      );

      setPreparedFiles(newFiles);
      setUploadStatus('idle');
      showToast(`${files.length} file(s) prepared for sync`, "success");
    } catch (e: any) {
      setUploadStatus('error');
      showToast(e?.message || "Failed to read files", "error");
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

      if (!addressString) {
        if (import.meta.env.DEV) console.error('[Upload] CRITICAL: Wallet address missing during sync');
        showToast("Sync interrupted: Wallet ID not found", "error");
        return;
      }

      const blobDataList = preparedFiles.map(f => ({
        blobName: f.name,
        blobData: f.data
      }));

      // 1. PERFORM BLOB UPLOAD (Blockchain Transaction)
      try {
        if (import.meta.env.DEV) console.log(`[Upload] Triggering SDK upload on Testnet...`);
        await upload({
          blobs: blobDataList,
          expirationMicros: (Date.now() + 1000 * 60 * 60 * 24 * 30) * 1000,
          // @ts-ignore
          signer: {
            account,
            accountAddress: addressString,
            signAndSubmitTransaction
          }
        } as any);
      } catch (err: any) {
        if (import.meta.env.DEV) console.error("[Upload] SDK FAILURE:", err);
        showToast("Upload SDK error. Cek konsol jika masalah berlanjut.", "error");
        throw err; // rethrow to stop the sync process
      }
      if (import.meta.env.DEV) console.log("UPLOAD SUCCESS — WAITING FOR INDEXER");
      showToast("Transaction confirmed! Syncing metadata...", "success");

      // 2. WAIT FOR INDEXER PROPAGATION (Polling Delay)
      // Capture the batch before clearing state — the setTimeout closure
      // needs its own snapshot since setPreparedFiles([]) runs synchronously below.
      const uploadedBatch = [...preparedFiles];

      setTimeout(async () => {
        try {
          // 3. FETCH UPDATED TRACKS FROM INDEXER (Disable filter to see new uploads)
          const indexerTracks = await getAudioBlobs(addressString, undefined, false);
          if (import.meta.env.DEV) console.log("INDEXER FULL:", indexerTracks);

          // 4. BATCH MATCH & SAVE — iterate ALL uploaded files, not just the first match
          let savedCount = 0;
          let failedCount = 0;

          for (const file of uploadedBatch) {
            // Match this prepared file to its on-chain record via blobName suffix
            const matchedTrack = indexerTracks.find(t => {
              const suffix = t.blobName?.substring(t.blobName.indexOf('/') + 1);
              return suffix === file.name;
            });

            if (!matchedTrack || !matchedTrack.blob_commitment) {
              if (import.meta.env.DEV) console.warn(`[Sync] No indexer match for: ${file.name}`);
              failedCount++;
              continue;
            }

            // 5. SAVE METADATA (SUPABASE) — one call per file
            if (import.meta.env.DEV) console.log(`SYNCING METADATA [${file.name}]:`, matchedTrack.blob_commitment);

            const insertSuccess = await saveMetadata(matchedTrack.blob_commitment, {
              title: file.title || file.name.replace(/\.[^.]+$/, '').trim(),
              artist: file.artist || 'Unknown Artist',
              owner: addressString,
              is_public: true, // Default to Public so it shows in Cloud Explorer
              size: Number(file.sizeRaw) || 0,
              duration: Number(file.duration) || 0
            });

            if (insertSuccess) {
              savedCount++;
              // Instant UI Update: Update local states so the user sees size/duration immediately
              const trackId = String(matchedTrack.blob_commitment);
              setTrackDurations(prev => ({ ...prev, [trackId]: file.duration ?? 0 }));
              setTrackSizes(prev => ({ ...prev, [trackId]: file.sizeRaw ?? 0 }));
              if (import.meta.env.DEV) console.log(`METADATA OK: ${file.title} — ${file.artist}`);
            } else {
              failedCount++;
              if (import.meta.env.DEV) console.error(`METADATA FAILED for: ${file.name}`);
            }
          }

          // 6. REFRESH UI
          if (refreshLibrary) await refreshLibrary();

          if (failedCount === 0) {
            showToast(`Sync Complete! ${savedCount} song(s) added`, "success");
          } else {
            showToast(`Synced ${savedCount}/${uploadedBatch.length} — ${failedCount} failed`, "error");
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error("Indexer polling failed:", err);
          showToast("Metadata sync failed — check console", "error");
        }
      }, 5000);

      // 6. UI FINALIZE
      setPreparedFiles([]);
      setUploadStatus('success');
      showToast("Upload Successful! Syncing library...", "success");

      setTimeout(() => {
        if (refreshLibrary) refreshLibrary();
      }, 3000);

      setTimeout(() => { setUploadStatus('idle'); }, 4000);
    } catch (e: any) {
      setUploadStatus('error');
      showToast(e?.message || "Shelby upload failed", "error");
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  // PHASE 5: Visibility Toggle Handler
  const handleToggleVisibility = async (track: Track) => {
    if (!track.blob_commitment) {
      if (import.meta.env.DEV) console.error("INVALID COMMITMENT — SKIP TOGGLE");
      return;
    }

    if (import.meta.env.DEV) console.log('TOGGLE CLICK:', track.id, track.is_public);

    try {
      const newValue = !track.is_public;
      if (import.meta.env.DEV) console.log('[Sync] Updating visibility to:', newValue);

      // MANDATORY: Update UI only AFTER Supabase confirms success
      const success = await updateTrackVisibility(track.blob_commitment, newValue);

      if (success) {
        setTracks(prev =>
          prev.map(t =>
            t.id === track.id
              ? { ...t, is_public: newValue }
              : t
          )
        );
        if (refreshLibrary) await refreshLibrary();
        if (import.meta.env.DEV) console.log('[Sync] UI correctly updated for:', track.title);
      } else {
        if (import.meta.env.DEV) console.error("UPDATE FAILED — UI NOT UPDATED");
        showToast("Toggle failed: Record not found in sync service", "error");
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Sync] System error during toggle:', err);
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
        audio.play().catch(() => { });
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

  /**
   * GSAP RESPONSIVE (MatchMedia)
   * Synchronizes layout transitions and animations between Mobile and Desktop.
   */
  useLayoutEffect(() => {
    const mm = gsap.matchMedia();

    // [1] MOBILE PROFILE (< 1024px)
    mm.add("(max-width: 1023px)", () => {
      if (sidebarOpen) {
        // Show overlay and slide sidebar in
        gsap.set(".sidebar-overlay", { display: 'block' });
        gsap.to(".sidebar-overlay", { opacity: 1, duration: 0.3 });
      } else {
        // Hide overlay and slide sidebar out
        gsap.to(".sidebar-overlay", {
          opacity: 0,
          duration: 0.3,
          onComplete: () => { gsap.set(".sidebar-overlay", { display: 'none' }); }
        });
      }
      return () => {
        gsap.set(".sidebar-overlay", { clearProps: "all" });
      };
    });

    // [2] DESKTOP PROFILES (>= 1024px)
    mm.add("(min-width: 1024px)", () => {
      // 1. Fixed Sidebar Setup
      gsap.set(".sidebar-overlay", { display: 'none', opacity: 0 });
      gsap.set(".sidebar", { clearProps: "transform,visibility,opacity" });

      // 2. Nested Scaling Profiles
      const mqNarrow = gsap.matchMedia();

      // NARROW DESKTOP (Desktop Site HP / Small Laptops)
      mqNarrow.add("(max-width: 1365px)", () => {
        gsap.to(":root", {
          "--track-grid-lib": "38px minmax(0, 1fr) 75px 60px 145px",
          "--track-grid-cloud": "38px minmax(0, 1fr) 90px 75px",
          "--track-actions-scale": 0.85,
          duration: 0.4,
          ease: "power2.out"
        });
      });

      // WIDE DESKTOP (Full Monitor)
      mqNarrow.add("(min-width: 1366px)", () => {
        gsap.to(":root", {
          "--track-grid-lib": "48px minmax(0, 6fr) 120px 100px 160px",
          "--track-grid-cloud": "48px minmax(0, 6fr) 140px 120px",
          "--track-actions-scale": 1,
          duration: 0.4,
          ease: "power2.out"
        });
      });

      return () => mqNarrow.revert();
    });

    return () => mm.revert();
  }, [sidebarOpen]);

  /**
   * MEMOIZED CLOUD EXPLORER HANDLERS
   * Prevents CloudExplorer from re-rendering every time global App state updates.
   */
  const handleCloudTrackSelect = useCallback((track: Track, allTracks?: Track[]) => {
    // [IMMEDIATE-SYNC]: Force playlist context before loading
    if (allTracks) {
      setCurrentPlaylist(allTracks);
    }
    loadTrack(track, true, allTracks);
  }, [loadTrack]);

  const cloudCurrentIndex = useMemo(() => {
    // Only show "Playing" icon in Cloud Explorer if the current playlist is from Shelby (Cloud)
    const isCloudPlaylist = currentPlaylist.length > 0 &&
      (currentPlaylist[0].source === 'SHELBY' || currentPlaylist[0].source === 'shelby');
    return isCloudPlaylist ? currentIndex : -1;
  }, [currentPlaylist, currentIndex]);

  return (
    <div className="app">
      <header className="mobile-header">
        <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <div style={{ width: '40px' }}></div>
      </header>

      <div
        className="sidebar-overlay"
        ref={overlayRef}
        style={{ display: 'none' }}
        onClick={dismissSidebar}
      ></div>

      <div className="content-area">
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          nowPlayingTrack={currentTrack}
          isPlaying={isPlaying}
          isOpen={sidebarOpen}
          onClose={dismissSidebar}
        />

        <main className="main" ref={mainRef}>
          {activeView === 'library' && (() => {
            const filteredTracks = tracks.filter(t =>
              !debouncedLibrarySearch ||
              t.title.toLowerCase().includes(debouncedLibrarySearch.toLowerCase()) ||
              t.artist.toLowerCase().includes(debouncedLibrarySearch.toLowerCase())
            );

            const totalLibraryPages = Math.ceil(filteredTracks.length / libraryLimit);
            const paginatedTracks = filteredTracks.slice((libraryPage - 1) * libraryLimit, libraryPage * libraryLimit);

            return (
              <div className="view" style={{ paddingBottom: typeof window !== 'undefined' && window.innerWidth < 768 ? '250px' : '20px' }}>
                <div className="view-header">
                  <div className="view-header-container" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    flexWrap: 'wrap'
                  }}>
                    <div className="view-header-main" style={{ flex: 1 }}>
                      <div className="view-title">
                        Library
                        <span className="track-count-badge">
                          {filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="view-subtitle">YOUR MUSIC COLLECTION — TESTNET</div>
                    </div>
                    <button
                      onClick={refreshLibrary}
                      className="refresh-btn-main"
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
                        <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                      </svg>
                      REFRESH
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={librarySearch}
                  onChange={e => {
                    setLibrarySearch(e.target.value);
                    setLibraryPage(1); // Reset to page 1 on search
                  }}
                  placeholder="Search title or artist..."
                  style={{
                    width: '100%', margin: '10px 0 6px', padding: '8px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px', color: 'white', fontSize: '13px',
                    fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box'
                  }}
                />
                <div ref={libraryListRef}>
                  <div className="track-list-header track-grid lib-grid">
                    <div className="track-num">#</div>
                    <div className="track-info">TITLE</div>
                    <div className="track-size hidden sm:flex">SIZE</div>
                    <div className="track-duration hidden sm:flex">DURATION</div>
                    <div className="track-actions hidden sm:flex">ACTIONS</div>
                  </div>
                  <div className="mobile-track-container" style={{
                    height: typeof window !== 'undefined' && window.innerWidth < 768 ? '285px' : 'auto',
                    overflowY: typeof window !== 'undefined' && window.innerWidth < 768 ? 'scroll' : 'visible'
                  }}>
                    <TrackList
                      tracks={paginatedTracks}
                      currentIndex={currentPlaylist === tracks ? currentIndex : -1}
                      isPlaying={isPlaying}
                      onTrackSelect={(i) => loadTrack(paginatedTracks[i], true)}
                      onToggleVisibility={handleToggleVisibility}
                      onDelete={handleDelete}
                      formatTime={formatTime}
                      formatSize={formatSize}
                      durations={trackDurations}
                      sizes={trackSizes}
                      pageOffset={(libraryPage - 1) * libraryLimit}
                      variant="library"
                    />
                  </div>
                </div>

                {totalLibraryPages > 1 && (
                  <div ref={libraryPaginationRef} className="pagination-container" style={{
                    marginBottom: typeof window !== 'undefined' && window.innerWidth < 768 ? '120px' : '10px'
                  }}>
                    <div className="pagination-controls">
                      <button
                        onClick={() => handleLibraryPageChange(libraryPage - 1, totalLibraryPages)}
                        disabled={libraryPage === 1}
                        className="pagination-btn"
                        title="Previous Page"
                      >
                        ←
                      </button>

                      {Array.from({ length: totalLibraryPages }, (_, i) => i + 1).map(p => (
                        <button
                          key={p}
                          onClick={() => handleLibraryPageChange(p, totalLibraryPages)}
                          className={`pagination-btn ${p === libraryPage ? 'active' : ''}`}
                        >
                          {p}
                        </button>
                      ))}

                      <button
                        onClick={() => handleLibraryPageChange(libraryPage + 1, totalLibraryPages)}
                        disabled={libraryPage === totalLibraryPages}
                        className="pagination-btn"
                        title="Next Page"
                      >
                        →
                      </button>
                    </div>

                    <div className="pagination-info">
                      LIBRARY PAGE {libraryPage} OF {totalLibraryPages}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {activeView === 'cloud-explorer' && (
            <CloudExplorer
              onTrackSelect={handleCloudTrackSelect}
              currentIndex={cloudCurrentIndex}
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
                <div className="view-subtitle">ADD TRACKS TO TESTNET LIBRARY</div>
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                        SYNC TO TESTNET
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
                  Uploading to Testnet Network...
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
                  Please switch to Shelby Testnet
                </div>
              )}
              <div className="shelby-notice">
                <div className="shelby-title">⚡ Shelby Integration Active</div>
                <div className="shelby-desc">
                  Decentralized storage gateway is initializing. Connect your Aptos wallet to begin syncing
                  your library to the Testnet. Cloud tracks are now visible in the Cloud Explorer tab.
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
                  <div className="settings-card-title">Network</div>
                  <div className="settings-row">
                    <div className="settings-label">Active Connection</div>
                    <div className="settings-value" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="pulse-dot" style={{ position: 'relative', top: '0', right: '0' }}></div>
                      Shelby Testnet
                    </div>
                  </div>
                  <div className="settings-row" style={{ marginTop: '8px' }}>
                    <div className="settings-label" style={{ fontSize: '11px', opacity: 0.5 }}>Gateway Status</div>
                    <div className="settings-value" style={{ fontSize: '11px', color: 'var(--accent-green)', letterSpacing: '1px' }}>ONLINE</div>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-card-title">Storage & Cache</div>
                  <div className="settings-row">
                    <div className="settings-label">Local Cache Usage</div>
                    <div className="settings-value">
                      {(cacheUsageBytes / (1024 * 1024)).toFixed(1)} MB / {(CACHE_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB
                    </div>
                  </div>
                  <div className="cache-bar-container">
                    <div className="cache-bar-fill" style={{ width: `${Math.min((cacheUsageBytes / CACHE_MAX_BYTES) * 100, 100)}%` }}></div>
                  </div>
                  <button className="settings-action-btn" onClick={clearCache}>Clear All Cache</button>
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
        isReconnecting={isReconnecting}
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
