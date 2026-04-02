import { createClient } from '@supabase/supabase-js';
import { normalizeAddress, standardizeID } from './addressUtils';

export interface TrackMetadata {
  title: string;
  artist: string;
  owner?: string;
  is_public?: boolean;
  network?: string;
  size?: number;
  duration?: number;
  blob_name?: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Re-initialize the Supabase client
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * PRIVATE HELPER: Ensures a commitment is in the standard format (0x + lowercase).
 */
// Standardization logic moved to addressUtils.ts

/** 
 * Fetches all global metadata mappings for the Testnet environment.
 * [LEGACY]: Fetches entire table. Use getPublicMetadataPaginated for Cloud Explorer.
 */
export async function getAllMetadata(): Promise<Record<string, TrackMetadata>> {
  if (!supabase) return {};

  try {
    // For Testnet, allow both 'testnet' and NULL/Empty (legacy tracks)
    const { data, error } = await supabase
      .from('tracks')
      .select('blob_commitment, title, artist, owner, is_public, network, size, duration, blob_name')
      .or(`network.eq.testnet,network.is.null`);

    if (error) throw error;

    const result: Record<string, TrackMetadata> = {};
    if (data) {
      data.forEach((row: any) => {
        if (row.blob_commitment) {
          const standardID = standardizeID(row.blob_commitment);
          const meta: TrackMetadata = {
            title: row.title || '',
            artist: row.artist || '',
            owner: row.owner || '',
            is_public: row.is_public === true,
            network: row.network,
            size: row.size,
            duration: row.duration,
            blob_name: row.blob_name
          };
          result[standardID] = meta;
        }
      });
    }
    return result;
  } catch (err) {
    if (import.meta.env.DEV) console.error("Supabase fetch failed:", err);
    return {};
  }
}

/**
 * Fetches a slice of public metadata for Cloud Explorer (Server-Side Pagination).
 */
export async function getPublicMetadataPaginated(page: number, limit: number): Promise<{data: Record<string, TrackMetadata>, total: number}> {
  if (!supabase) return { data: {}, total: 0 };

  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Fetch only public tracks for the current page
    const { data, error, count } = await supabase
      .from('tracks')
      .select('blob_commitment, title, artist, owner, is_public, network, size, duration, blob_name', { count: 'exact' })
      .eq('is_public', true)
      .or(`network.eq.testnet,network.is.null`)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const result: Record<string, TrackMetadata> = {};
    if (data) {
      data.forEach((row: any) => {
        if (row.blob_commitment) {
          const standardID = standardizeID(row.blob_commitment);
          result[standardID] = {
            title: row.title || '',
            artist: row.artist || '',
            owner: row.owner || '',
            is_public: true,
            network: row.network,
            size: row.size,
            duration: row.duration,
            blob_name: row.blob_name
          };
        }
      });
    }
    return { data: result, total: count || 0 };
  } catch (err) {
    if (import.meta.env.DEV) console.error("Supabase paginated fetch failed:", err);
    return { data: {}, total: 0 };
  }
}

/**
 * Saves track metadata globally to Supabase for Testnet.
 */
export async function saveMetadata(blob_commitment: string, data: TrackMetadata): Promise<boolean> {
  if (!supabase) {
    if (import.meta.env.DEV) console.error('Supabase client not initialized.');
    return false;
  }

  const standardID = standardizeID(blob_commitment);
  
  const payload = {
    blob_commitment: standardID,
    title: data.title,
    artist: data.artist,
    owner: normalizeAddress(data.owner || ''),
    is_public: !!data.is_public,
    network: 'testnet',
    size: data.size,
    duration: data.duration,
    blob_name: data.blob_name
  };

  try {
    const { error } = await supabase
      .from('tracks')
      .upsert(payload, { onConflict: 'blob_commitment' });

    if (error) {
      if (import.meta.env.DEV) console.error("[Supabase] SYNC ERROR:", error.message);
      return false;
    }

    return true;
  } catch (err: any) {
    if (import.meta.env.DEV) console.error('[Supabase] CRITICAL FAILURE:', err?.message || err);
    return false;
  }
}

/**
 * Updates the visibility of a track.
 */
export async function updateTrackVisibility(
  blob_commitment: string,
  isPublic: boolean
): Promise<boolean> {
  if (!supabase) return false;

  const standardID = standardizeID(blob_commitment);

  try {
    const response = await supabase
      .from('tracks')
      .update({ is_public: isPublic })
      .eq('blob_commitment', standardID)
      .select();

    if (response.error) {
      if (import.meta.env.DEV) console.error('[Supabase] UPDATE ERROR:', response.error.message);
      return false;
    }

    return response.data && response.data.length > 0;
  } catch (err: any) {
    if (import.meta.env.DEV) console.error('[Supabase] Update Failure:', err?.message || err);
    return false;
  }
}

/**
 * Removes track metadata from the global store.
 */
export async function deleteMetadata(blob_commitment: string): Promise<void> {
  if (!supabase) return;

  const standardID = standardizeID(blob_commitment);

  try {
    const { error } = await supabase
      .from('tracks')
      .delete()
      .eq('blob_commitment', standardID);

    if (error) throw error;
  } catch (err) {
    if (import.meta.env.DEV) console.error("Supabase delete failed:", err);
  }
}
