import { GraphQLClient, gql } from 'graphql-request';
import type { Track } from '../types';
import { getAllMetadata, getPublicMetadataPaginated, type TrackMetadata } from './metadataService';
import { normalizeAddress, standardizeID } from './addressUtils';

interface NetworkConfig {
  gqlEndpoint: string;
  gatewayUrl: string;
  apiKey: string | undefined;
}

const TESTNET_CONFIG: NetworkConfig = {
  // Custom Shelby indexer endpoint with 'blobs' schema support
  gqlEndpoint: 'https://api.testnet.aptoslabs.com/nocode/v1/public/cmlfqs5wt00qrs601zt5s4kfj/v1/graphql',
  // Official testnet gateway (portal) - Empty means rely strictly on official SDK
  gatewayUrl: '', 
  apiKey: import.meta.env.VITE_SHELBY_API_KEY_TESTNET,
};

const GET_BLOBS = gql`
  query GetBlobs($owner: String!) {
    blobs(where: { owner: { _eq: $owner } }) {
      blob_name
      blob_commitment
      owner
      created_at
    }
  }
`;

const GET_BLOB_BY_COMMITMENT = gql`
  query GetBlobByCommitment($commitment: String!) {
    blobs(where: { blob_commitment: { _eq: $commitment } }) {
      blob_name
      owner
    }
  }
`;

const AUDIO_REGEX = /\.(mp3|wav|ogg|m4a|flac)$/i;

// External normalization logic moved to addressUtils.ts

function mapBlobToTrack(blob: any, globalMetadata: Record<string, TrackMetadata> = {}): Track {
  const gateway = TESTNET_CONFIG.gatewayUrl;
  
  // Resolve display name from stored metadata (from upload time ID3 parse)
  const metadataMap: Record<string, any> = (() => {
    try { return JSON.parse(localStorage.getItem('track_metadata') || '{}'); } catch { return {}; }
  })();

  const cached = metadataMap[blob.blob_name];
  const standardID = standardizeID(blob.blob_commitment);
  const global = globalMetadata[standardID];

  // PRIORITIZE: Supabase (global) > Cache (local) > Filename
  const title = (global?.title && global.title !== '')
    ? global.title 
    : (cached?.title || blob.blob_name.replace(/\.[^.]+$/, '').trim());

  const artist = (global?.artist && global.artist !== '')
    ? global.artist 
    : (cached?.artist || 'Unknown Artist');

  const urlID = standardID;

  return {
    id: standardID,
    blob_commitment: standardID,
    title,
    artist,
    owner: blob.owner,
    url: `${gateway}${urlID}`,
    source: 'SHELBY',
    blobName: blob.blob_name,
    created_at: blob.created_at,
    is_public: global?.is_public || false,
    size: global?.size,
    duration: global?.duration
  };
}

const createGqlClient = () => {
  return new GraphQLClient(TESTNET_CONFIG.gqlEndpoint, {
    headers: {
      'Authorization': TESTNET_CONFIG.apiKey ? `Bearer ${TESTNET_CONFIG.apiKey}` : '',
    },
  });
};

export const getAudioBlobs = async (
  owner: string, 
  signal?: AbortSignal, 
  filterByMetadata: boolean = true
): Promise<Track[]> => {
  if (!owner) return [];
  const queryAddress = owner;
  const client = createGqlClient();

    let globalData: Record<string, TrackMetadata> = {};
    if (filterByMetadata) {
      try { globalData = await getAllMetadata(); } catch { }
    }

    try {
      const data = await (signal 
        ? client.request(GET_BLOBS, { owner: queryAddress }, { signal } as any)
        : client.request(GET_BLOBS, { owner: queryAddress })
      );
      
      const indexerBlobs = (data.blobs || []) as any[];
      const standardizedOwnedBlobs = indexerBlobs.map(b => standardizeID(b.blob_commitment));

      // 1. Map indexer blobs to tracks, but ONLY if they have metadata in Supabase (Sync source of truth)
      const tracksFromIndexer = indexerBlobs
        .filter((b: any) => {
          const isAudio = AUDIO_REGEX.test(b.blob_name || '');
          const stdID = standardizeID(b.blob_commitment);
          const meta = globalData[stdID];
          const hasMetadata = !!meta;
          
          // [SURE-IDENTITY]: Cross-verify with Supabase. 
          // Even if the Indexer says "I own it", if Supabase hasn't confirmed this address
          // as the owner, skip it to prevent ghost associations.
          const isVerifiedOwner = meta && normalizeAddress(meta.owner || '') === normalizeAddress(owner);
          
          if (filterByMetadata) return isAudio && hasMetadata && isVerifiedOwner;
          return isAudio;
        })
        .map(b => {
          const track = mapBlobToTrack(b, globalData);
          // Force the owner from Supabase for absolute certainty
          const stdID = standardizeID(b.blob_commitment);
          const meta = globalData[stdID];
          if (meta?.owner) track.owner = meta.owner;
          return track;
        });

      // 2. HYBRID FALLBACK: Any tracks in Supabase for this user but NOT in indexer yet (latency fix)
      const normalizedOwner = normalizeAddress(owner);
      const tracksFromSupabase = Object.entries(globalData)
        .filter(([commitment, meta]) => {
          const stdID = standardizeID(commitment);
          const isUserOwned = normalizeAddress(meta.owner || '') === normalizedOwner;
          const notInIndexer = !standardizedOwnedBlobs.includes(stdID);
          return isUserOwned && notInIndexer && (meta.title || meta.artist); // Must have some metadata
        })
        .map(([commitment, meta]) => {
          const stdID = standardizeID(commitment);
          const urlID = stdID;
          const gateway = TESTNET_CONFIG.gatewayUrl;
          return {
            id: stdID,
            blob_commitment: stdID,
            title: meta.title || 'Unknown Title',
            artist: meta.artist || 'Unknown Artist',
            owner: meta.owner, // [STRICT]: Never fallback to 'owner' variable if meta.owner is missing
            url: `${gateway}${urlID}`,
            source: 'SHELBY' as const,
            blobName: meta.blob_name || '', 
            is_public: meta.is_public === true,
            size: meta.size,
            duration: meta.duration
          };
        })
        .filter(t => !!t.owner); // [SANITY]: Drop any track with missing owner info

      // 3. MERGE & DEDUPLICATE
      const combined = [...tracksFromIndexer, ...tracksFromSupabase];
      
      return combined.filter((track, index, self) => 
        index === self.findIndex((t) => standardizeID(String(t.id)) === standardizeID(String(track.id)))
      );
    } catch (err: any) {
      // Indexer fallback remains as is
      if (err?.message?.includes('validation-failed')) {
        if (import.meta.env.DEV) console.log(`[Explorer] Testnet indexer failed/mismatch, using Supabase fallback...`);
        
        return Object.entries(globalData)
          .filter(([_, meta]) => {
            const isOwner = String(meta.owner).toLowerCase() === String(owner).toLowerCase();
            return isOwner;
          })
          .map(([commitment, meta]) => {
            const standardID = standardizeID(commitment);
            const urlID = standardID;
            const gateway = TESTNET_CONFIG.gatewayUrl;
            return {
              id: standardID,
              blob_commitment: standardID,
              title: meta.title || 'Unknown Title',
              artist: meta.artist || 'Unknown Artist',
              owner: meta.owner || owner,
              url: `${gateway}${urlID}`,
              source: 'SHELBY' as const,
              blobName: meta.blob_name || '',
              is_public: meta.is_public === true,
              size: meta.size,
              duration: meta.duration
            };
          });
      }
      
      if (import.meta.env.DEV) console.error(`Shelby Testnet fetch failed:`, err);
      return [];
    }
};

/**
 * Returns all tracks indexed in Supabase for the Testnet network.
 * [LEGACY]: Fetches everything. Use getPublicAudioBlobsPaginated for scalable UI.
 */
export const getAllAudioBlobs = async (): Promise<Track[]> => {
  const gateway = TESTNET_CONFIG.gatewayUrl;
  
  try {
    let globalData: Record<string, TrackMetadata> = {};
    try { 
      globalData = await getAllMetadata(); 
    } catch (err) {
      if (import.meta.env.DEV) console.error(`[CloudExplorer] Supabase Testnet fetch failed:`, err);
    }

    const metadataEntries = Object.entries(globalData) as [string, TrackMetadata][];
    
    return metadataEntries
      .filter(([_, meta]) => meta.is_public === true) // STRICT PRIVACY: Only show public tracks
      .map(([commitment, meta]) => {
        const standardID = standardizeID(commitment);
        const urlID = standardID;
        return {
          id: standardID,
          blob_commitment: standardID,
          title: meta.title || 'Unknown Title',
          artist: meta.artist || 'Unknown Artist',
          owner: meta.owner || '',
          url: `${gateway}${urlID}`,
          source: 'SHELBY' as const,
          blobName: meta.blob_name || '', // CRITICAL: Provide blobName for Cloud play
          is_public: true,
          size: meta.size,
          duration: meta.duration
        };
      })
      .filter((track, index, self) => 
        // DEDUPLICATION: Ensure no double entries in Cloud Explorer
        index === self.findIndex((t) => standardizeID(String(t.id)) === standardizeID(String(track.id)))
      );

  } catch (err) {
    if (import.meta.env.DEV) console.error(`[CloudExplorer] Public Testnet fetch failed:`, err);
    return [];
  }
};

/**
 * Fetches public audio blobs for global discovery with Server-Side Pagination.
 */
export async function getPublicAudioBlobsPaginated(page: number, limit: number): Promise<{tracks: Track[], total: number}> {
  try {
    const { data: globalData, total } = await getPublicMetadataPaginated(page, limit);
    const publicTracks: Track[] = [];
    const gateway = TESTNET_CONFIG.gatewayUrl;

    (Object.entries(globalData) as [string, TrackMetadata][]).forEach(([commitment, meta]) => {
      const stdID = standardizeID(commitment);
      const urlID = stdID;
      publicTracks.push({
        id: stdID,
        blob_commitment: stdID,
        title: meta.title || 'Unknown Title',
        artist: meta.artist || 'Unknown Artist',
        owner: meta.owner || '',
        url: `${gateway}${urlID}`,
        source: 'SHELBY' as const,
        blobName: meta.blob_name || '',
        is_public: true,
        size: meta.size,
        duration: meta.duration
      });
    });

    return { tracks: publicTracks, total };
  } catch (err) {
    if (import.meta.env.DEV) console.error("Failed to fetch paginated audio blobs:", err);
    return { tracks: [], total: 0 };
  }
}

export const cacheTrackMetadata = (tracks: Track[]) => {
  try {
    const existing = JSON.parse(localStorage.getItem('track_metadata') || '{}');
    tracks.forEach(t => {
      if (t.blobName && t.id) {
        existing[t.blobName] = { title: t.title, artist: t.artist };
      }
    });
    localStorage.setItem('track_metadata', JSON.stringify(existing));
  } catch (err) {
    if (import.meta.env.DEV) console.error('Metadata caching failed:', err);
  }
};

/**
 * Discovery: Search blockchain (Indexer) for a blob identity if missing from local DB.
 */
export const findBlobIdentity = async (commitment: string, expectedOwner?: string): Promise<{ blobName: string, owner: string } | null> => {
  if (!commitment) return null;
  const client = createGqlClient();
  try {
    const data = await client.request(GET_BLOB_BY_COMMITMENT, { commitment: standardizeID(commitment) });
    const blobs = (data.blobs || []) as any[];
    if (blobs.length > 0) {
      // [Identity Collision Resolver] Jika file yang sama pernah diupload banyak orang, 
      // ambil versi file yang benar-benar milik row owner Cloud Explorer saat ini, bukan indeks ke-0 buta.
      if (expectedOwner) {
        const exactMatch = blobs.find(b => String(b.owner).toLowerCase() === String(expectedOwner).toLowerCase());
        if (exactMatch) {
          return { blobName: exactMatch.blob_name, owner: exactMatch.owner };
        }
      }
      return { 
        blobName: blobs[0].blob_name, 
        owner: blobs[0].owner 
      }; // fallback if specific owner not found
    }
  } catch (err) {
    if (import.meta.env.DEV) console.error(`[Discovery] Failed to find identity for ${commitment}:`, err);
  }
  return null;
};
