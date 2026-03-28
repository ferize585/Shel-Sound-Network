import { GraphQLClient, gql } from 'graphql-request';
import type { Track } from '../types';

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
    const existing: Record<string, string> =
      JSON.parse(localStorage.getItem('track_metadata') || '{}');
    tracks.forEach(t => { existing[String(t.id)] = t.title; });
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

function mapBlobToTrack(blob: any): Track {
  // Resolve display name from stored metadata (from upload time ID3 parse)
  const metadata: Record<string, string> = (() => {
    try { return JSON.parse(localStorage.getItem('track_metadata') || '{}'); }
    catch { return {}; }
  })();

  const savedName = metadata[blob.blob_commitment];
  const rawName = blob.blob_name.split('/').pop() || blob.blob_name;

  let title: string;
  if (savedName) {
    title = savedName.replace(/\.[^.]+$/, '');
  } else if (AUDIO_REGEX.test(rawName)) {
    title = rawName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  } else {
    title = blob.blob_commitment.slice(0, 8);
  }

  let artist = 'Unknown Artist';
  const match = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (match) {
    artist = match[1].trim();
    title = match[2].trim();
  }

  // blob_commitment is the content-addressed hash the Shelby gateway routes on.
  // blob_name is an internal store path and does NOT resolve to streamable audio.
  const url = blob.blob_commitment
    ? `https://gateway.shelby.xyz/${blob.blob_commitment}`
    : '';

  if (import.meta.env.DEV) {
    console.log('[Track URL]', url);
  }

  return {
    id: blob.blob_commitment,
    title,
    artist,
    url,
    source: 'SHELBY',
    owner: blob.owner,
    blobName: blob.blob_name,
    size: blob.size,
    duration: 0,
  };
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
    return ((data.blobs || []) as any[])
      .filter((b: any) => AUDIO_REGEX.test(b.blob_name || ''))
      .map(mapBlobToTrack);
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
      console.log('[CloudExplorer] RAW BLOBS:', rawBlobs.length);
    }

    // After mapping, drop tracks whose title is still a raw hash prefix.
    // A title like "0xbbf980" means mapBlobToTrack had NO metadata to resolve it —
    // no localStorage cache and no audio-extension blob_name. These are random blobs
    // from other wallets that we can't identify. The user's own tracks always resolve
    // via ownTracks prop in CloudExplorer; other users' named tracks resolve via cache.
    const HASH_TITLE = /^0x[0-9a-f]{4,10}$/i;
    const tracks = rawBlobs
      .filter((b: any) => b.size && Number(b.size) >= 1_000_000)
      .map(mapBlobToTrack)
      .filter(t => !HASH_TITLE.test(t.title));

    if (import.meta.env.DEV) {
      console.log('[CloudExplorer] AUDIO TRACKS (named):', tracks.length);
    }

    return tracks;
  } catch (err: any) {
    if (err?.name === 'AbortError') return []; // cancelled — silently ignore
    if (import.meta.env.DEV) console.error('Global Explorer Sync Error:', err?.message ?? err);
    return [];
  }
};
