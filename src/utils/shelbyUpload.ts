import type { Track } from '../types';

export const normalizeAddress = (address: string): string => {
  if (!address) return '';
  let clean = address.trim().toLowerCase();
  if (!clean.startsWith('0x')) clean = '0x' + clean;
  const hex = clean.slice(2);
  return '0x' + hex.padStart(64, '0');
};

export const mapUploadResultToTrack = (result: any, file: File, owner: string): Track => {
  // Extract blob metadata from Shelby upload response
  console.log('REAL BLOB:', result.blobs?.[0] ?? result);
  const blob = result.blobs?.[0] ?? result;

  const blobName: string = blob.blob_name;
  const blobId: string   = blob.blob_commitment;

  if (!blobName) {
    console.error('Missing blob_name in Shelby upload response:', result);
    throw new Error('Missing blob_name from Shelby upload response');
  }
  console.log('UPLOAD blobName (stored in track):', blobName);
  if (!blobId) {
    console.error('Missing blob_commitment in Shelby upload response:', result);
    throw new Error('Missing blob_commitment from Shelby upload response');
  }

  const blobUrl = `https://gateway.shelby.xyz/${blobName}`;

  let title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  let artist = 'Unknown Artist';
  
  const match = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (match) {
    artist = match[1].trim();
    title = match[2].trim();
  }

  return {
    id: blobId,
    title,
    artist,
    url: blobUrl,
    blobName: blobName,
    source: 'SHELBY',
    size: file.size,
    owner: owner
  };
};
