import { GraphQLClient, gql } from 'graphql-request';
import type { Track } from '../types';
import { getAllMetadata, type TrackMetadata } from './metadataService';

const GQL_ENDPOINT = 'https://api.testnet.aptoslabs.com/nocode/v1/public/cmlfqs5wt00qrs601zt5s4kfj/v1/graphql';
const API_KEY = import.meta.env.VITE_SHELBY_API_KEY_TESTNET;
const AUDIO_REGEX = /\.(mp3|wav|ogg|flac|m4a)$/i;
const MAX_RETRIES = 3;


const gqlClient = new GraphQLClient(GQL_ENDPOINT, {
  headers: { Authorization: `Bearer ${API_KEY}` },
});

const GET_BLOBS = gql`
  query GetMyBlobs($owner: String!) {
    blobs(
      where: { owner: { _eq: $owner }, is_deleted: { _eq: 0 } }
      order_by: { created_at: desc }
    ) {
      blob_commitment
      blob_name
      owner
      size
      created_at
    }
  }
`;

const GET_ALL_BLOBS = gql`
  query GetAllBlobs {
    blobs(
      where: { is_deleted: { _eq: 0 } }
      order_by: { created_at: desc }
      limit: 500
    ) {
      blob_commitment
      blob_name
      owner
      size
      created_at
    }
  }
`;

/** Retry wrapper — retries only on network-level errors, up to MAX_RETRIES times. */
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isNetwork = err?.message?.includes('fetch') || err?.message?.includes('network') || err?.message?.includes('Failed to fetch');
      if (!isNetwork || attempt === retries) throw err;
      // Exponential back-off: 500ms, 1000ms
      await new Promise(res => setTimeout(res, 500 * attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

/** Save commitment→title mapping to localStorage so Cloud Explorer can resolve
 *  proper track names. Call this after every successful Library fetch. */
export function cacheTrackMetadata(tracks: Track[]): void {
  try {
    const existing: Record<string, any> =
      JSON.parse(localStorage.getItem('track_metadata') || '{}');
    tracks.forEach(t => { 
      // TASK 1: Structured Metadata Cache
      existing[String(t.id)] = { title: t.title, artist: t.artist }; 
    });
    localStorage.setItem('track_metadata', JSON.stringify(existing));
  } catch { /* storage unavailable — silently skip */ }
}

export const normalizeAddress = (address: string): string => {
  if (!address) return '';
  let clean = address.trim().toLowerCase();
  if (!clean.startsWith('0x')) clean = '0x' + clean;
  const hex = clean.slice(2);
  return '0x' + hex.padStart(64, '0');
};

function mapBlobToTrack(blob: any, globalMetadata: Record<string, TrackMetadata> = {}): Track {
  // Resolve display name from stored metadata (from upload time ID3 parse)
  const metadataMap: Record<string, any> = (() => {
    try { return JSON.parse(localStorage.getItem('track_metadata') || '{}'); }
    catch { return {}; }
  })();

  // TASK 2: PRIORITY ORDER
  // 1. Global metadata ✅ (from SaaS API)
  // 2. LocalStorage metadata (fallback for older cache / offline)
  // 3. blob_name parsing
  // 4. "Unknown Track"
  
  const savedData = globalMetadata[blob.blob_commitment] 
                 || globalMetadata[blob.blob_name]
                 || metadataMap[blob.blob_commitment] 
                 || metadataMap[blob.blob_name];

  const rawName = blob.blob_name.split('/').pop() || blob.blob_name;

  let title = 'Unknown Track';
  let artist = 'Unknown Artist';

  if (savedData && typeof savedData === 'object' && savedData.title) {
    // PRIORITY 1: Structured metadata from local-cache mapping
    title = savedData.title;
    artist = savedData.artist || 'Unknown Artist';
  } else if (typeof savedData === 'string') {
    // BACKWARD COMPATIBILITY: Parse old string-based local-cache
    const cleanStr = (savedData as string).replace(/\.[^.]+$/, '');
    const m = cleanStr.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (m) {
      artist = m[1].trim();
      title = m[2].trim();
    } else {
      title = cleanStr;
    }
  } else if (AUDIO_REGEX.test(rawName)) {
    // PRIORITY 2: Parsing fallback directly from string blob_name
    let cleanName = rawName.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s*-+\s*/g, ' - ').trim();
    const m = cleanName.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (m) {
      artist = m[1].trim();
      title = m[2].trim();
    } else {
      title = cleanName;
    }
  }
  // PRIORITY 3: "Unknown Track", which was set as the baseline let variable.


  // blob_commitment is the content-addressed hash the Shelby gateway routes on.
  // blob_name is an internal store path and does NOT resolve to streamable audio.
  const url = blob.blob_commitment
    ? `https://gateway.shelby.xyz/${blob.blob_commitment}`
    : '';

  if (import.meta.env.DEV) {
    console.log('[Track URL]', url);
  }

  const track: Track = {
    id: blob.blob_commitment,
    title,
    artist,
    url,
    source: 'SHELBY',
    owner: blob.owner,
    blobName: blob.blob_name,
    size: blob.size,
    duration: 0,
    is_public: savedData?.is_public === true || savedData?.is_public === 'true' as any,
  };

  if (import.meta.env.DEV) {
    console.log('TRACK VISIBILITY:', track.id, track.is_public);
    console.log('FINAL TRACK:', track.id, track.is_public);
  }

  return track;
}

/** Fetch audio blobs for a specific wallet address.
 *  Pass an AbortSignal to cancel the in-flight request if a newer one starts. */
export const getAudioBlobs = async (address: string, signal?: AbortSignal): Promise<Track[]> => {
  if (!address) return [];
  try {
    const normalizedAddress = normalizeAddress(address);
    const data: any = await withRetry(() =>
      gqlClient.request(GET_BLOBS, { owner: normalizedAddress }, { signal } as any)
    );
    
    // FETCH CACHE - gracefully fail
    let globalData: Record<string, TrackMetadata> = {};
    try { globalData = await getAllMetadata(); } catch { }

    return ((data.blobs || []) as any[])
      .filter((b: any) => AUDIO_REGEX.test(b.blob_name || ''))
      .map(b => mapBlobToTrack(b, globalData));
  } catch (err: any) {
    if (err?.name === 'AbortError') return []; // cancelled — silently ignore
    if (import.meta.env.DEV) console.error('Library Sync Error:', err?.message ?? err);
    return [];
  }
};

/** Fetch all public audio blobs from the global Shelby network.
 *  Pass an AbortSignal to cancel the in-flight request if a newer one starts.
 *
 *  Uses the same AUDIO_REGEX filter as getAudioBlobs (Library):
 *  When uploaded via this dApp, blob_name = original filename (e.g. artist-title.mp3).
 *  This filters out non-audio blobs (images, metadata, random uploads). */
export const getAllAudioBlobs = async (signal?: AbortSignal): Promise<Track[]> => {
  try {
    const data: any = await withRetry(() => gqlClient.request(GET_ALL_BLOBS, undefined, { signal } as any));
    const rawBlobs: any[] = data.blobs || [];

    if (import.meta.env.DEV) {
      console.log('[CloudExplorer] RAW BLOBS TOTAL:', rawBlobs.length);
    }

    // CLEAN FILTER (LEVEL 1): Strictly validate blob_name is a non-empty audio string
    const validBlobs = rawBlobs
      .filter((b: any) => {
        if (!b.blob_name || typeof b.blob_name !== 'string') return false;
        const safeName = b.blob_name.trim();
        // Must have length and explicitly match AUDIO_REGEX (.mp3, .wav, etc)
        // This implicitly drops raw hashes and metadata/image blobs
        return safeName.length > 3 && AUDIO_REGEX.test(safeName);
      });

    // FETCH GLOBAL METADATA - gracefully fail
    let globalData: Record<string, TrackMetadata> = {};
    try { globalData = await getAllMetadata(); } catch { }

    const tracks = validBlobs.map(b => mapBlobToTrack(b, globalData));

    // PHASE 4: PUBLIC / PRIVATE FILTER & METADATA MATCHING
    const publicTracks = tracks.filter((track) => {
      // Normalize blobName to remove directory paths (e.g. "folder/file.mp3" -> "file.mp3")
      const normalizedName = (track.blobName || '').split('/').pop() || '';
      const meta = globalData[track.id] || globalData[normalizedName];
      
      // Validation 1: Must exist in global tracking
      // Validation 2: Must explicitly be marked as public (if undefined -> evaluates to false)
      return meta && meta.is_public === true;
    });

    if (import.meta.env.DEV) {
      console.log('[CloudExplorer] STRICT AUDIO TRACKS (global public):', publicTracks.length);
    }

    return publicTracks;
  } catch (err: any) {
    if (err?.name === 'AbortError') return []; // cancelled — silently ignore
    if (import.meta.env.DEV) console.error('Global Explorer Sync Error:', err?.message ?? err);
    return [];
  }
};
