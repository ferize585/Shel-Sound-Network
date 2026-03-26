import { GraphQLClient, gql } from 'graphql-request';
import type { Track } from '../types';

const GQL_ENDPOINT = 'https://api.testnet.aptoslabs.com/nocode/v1/public/cmlfqs5wt00qrs601zt5s4kfj/v1/graphql';
const API_KEY = import.meta.env.VITE_SHELBY_API_KEY_TESTNET;

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
    ) {
      blob_commitment
      blob_name
      owner
      size
      created_at
    }
  }
`;

export const normalizeAddress = (address: string): string => {
  if (!address) return '';
  let clean = address.trim().toLowerCase();
  if (!clean.startsWith('0x')) clean = '0x' + clean;
  // Pad to 64 chars + 0x = 66 chars
  const hex = clean.slice(2);
  return '0x' + hex.padStart(64, '0');
};

export const getAudioBlobs = async (address: string): Promise<Track[]> => {
  if (!address) return [];
  
  try {
    const client = new GraphQLClient(GQL_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    const normalizedAddress = normalizeAddress(address);
    console.log("GraphQL Library Sync Address:", normalizedAddress);
    
    const data: any = await client.request(GET_BLOBS, { owner: normalizedAddress });
    const audioRegex = /\.(mp3|wav|ogg|flac|m4a)$/i;
    
    return ((data.blobs || []) as any[])
      .filter((blob: any) => audioRegex.test(blob.blob_name || ''))
      .map((blob: any) => {
        const metadata = (() => { try { return JSON.parse(localStorage.getItem('track_metadata') || '{}'); } catch { return {}; } })();
        const savedName = metadata[blob.blob_commitment];
        const rawName = blob.blob_name.split('/').pop() || blob.blob_name;
        const hasAudioExt = audioRegex.test(rawName);
        let title: string;
        if (savedName) {
          title = savedName.replace(/\.[^.]+$/, '');
        } else if (hasAudioExt) {
          title = rawName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        } else {
          title = blob.blob_commitment.slice(0, 8);
        }
        let artist = 'Shelby Artist';
        
        const match = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
        if (match) {
          artist = match[1].trim();
          title = match[2].trim();
        }

        const cleanName = blob.blob_name?.trim();
        const url = cleanName ? `https://gateway.shelby.xyz/${cleanName}` : '';
        console.log('PLAY URL:', url);
        return {
          id: blob.blob_commitment,
          title: title,
          artist: artist,
          url,
          source: 'SHELBY',
          owner: blob.owner,
          blobName: blob.blob_name,
          size: blob.size,
          duration: 0
        };
      });
  } catch (err) {
    console.error("Library Sync Error:", err);
    return [];
  }
};

export const getAllAudioBlobs = async (): Promise<Track[]> => {
  try {
    const client = new GraphQLClient(GQL_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    const data: any = await client.request(GET_ALL_BLOBS);
    const audioRegex = /\.(mp3|wav|ogg|flac|m4a)$/i;
    
    const MIN_AUDIO_SIZE = 500 * 1024; // 500 KB min size to filter out 80KB bot dummies

    return ((data.blobs || []) as any[])
      .filter((blob: any) => audioRegex.test(blob.blob_name || ''))
      .filter((blob: any) => blob.size && Number(blob.size) > MIN_AUDIO_SIZE)
      .map((blob: any) => {
        const metadata = (() => { try { return JSON.parse(localStorage.getItem('track_metadata') || '{}'); } catch { return {}; } })();
        const savedName = metadata[blob.blob_commitment];
        const rawName = blob.blob_name.split('/').pop() || blob.blob_name;
        const hasAudioExt = audioRegex.test(rawName);
        let title: string;
        if (savedName) {
          title = savedName.replace(/\.[^.]+$/, '');
        } else if (hasAudioExt) {
          title = rawName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        } else {
          title = blob.blob_commitment.slice(0, 8);
        }
        let artist = 'Shelby Artist';
        
        const match = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
        if (match) {
          artist = match[1].trim();
          title = match[2].trim();
        }

        const cleanName = blob.blob_name?.trim();
        const url = cleanName ? `https://gateway.shelby.xyz/${cleanName}` : '';
        console.log('PLAY URL:', url);
        return {
          id: blob.blob_commitment,
          title: title,
          artist: artist,
          url,
          source: 'SHELBY',
          owner: blob.owner,
          blobName: blob.blob_name,
          size: blob.size,
          duration: 0
        };
      });
  } catch (err) {
    console.error("Global Explorer Sync Error:", err);
    return [];
  }
};
