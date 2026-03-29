import { createClient } from '@supabase/supabase-js';

export interface TrackMetadata {
  title: string;
  artist: string;
  owner?: string;
  is_public?: boolean;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Safe client init — allows the app to load even if env vars are misconfigured 
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * GLOBAL SAAS METADATA SERVICE (SUPABASE)
 * Fetches and saves mapped metadata globally for all devices seamlessly.
 */

export async function getAllMetadata(): Promise<Record<string, TrackMetadata>> {
  if (!supabase) return {};

  try {
    const { data, error } = await supabase
      .from('tracks')
      .select('blob_commitment, title, artist, owner, is_public');

    if (error) throw error;

    const result: Record<string, TrackMetadata> = {};
    if (data) {
      data.forEach((row: any) => {
        if (row.blob_commitment) {
          if (import.meta.env.DEV) {
            console.log('SUPABASE ROW:', row);
          }
          result[row.blob_commitment] = {
            title: row.title || 'Unknown Track',
            artist: row.artist || 'Unknown Artist',
            owner: row.owner || '',
            is_public: row.is_public === true || row.is_public === 'true',
          };
        }
      });
    }
    return result;
  } catch (err) {
    if (import.meta.env.DEV) console.error("Supabase fetch failed (fallback active):", err);
    return {};
  }
}

export async function saveMetadata(blob_commitment: string, data: TrackMetadata): Promise<void> {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('tracks')
      .upsert(
        {
          blob_commitment,
          title: data.title,
          artist: data.artist,
          owner: data.owner
        },
        { onConflict: 'blob_commitment' }
      );

    if (error) throw error;
  } catch (err) {
    if (import.meta.env.DEV) console.error("Supabase save failed:", err);
  }
}

export async function updateTrackVisibility(
  blob_commitment: string,
  isPublic: boolean
): Promise<void> {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('tracks')
      .update({ is_public: isPublic })
      .eq('blob_commitment', blob_commitment);

    if (error) throw error;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('Visibility update failed:', err);
    }
  }
}

