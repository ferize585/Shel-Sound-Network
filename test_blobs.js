const AUDIO_REGEX = /\.(mp3|wav|ogg|flac|m4a)$/i;

const query = `query GetAllBlobs {
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
}`;

fetch('https://indexer.shelby.xyz/v1/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
})
  .then(res => res.json())
  .then(data => {
    const rawBlobs = data.data.blobs || [];
    console.log("RAW BLOBS TOTAL:", rawBlobs.length);
    
    rawBlobs.slice(0, 10).forEach((b, i) => {
      console.log(`RAW ${i}:`, {
        blob_name: b.blob_name,
        blob_commitment: b.blob_commitment,
        size: b.size
      });
    });

    rawBlobs.slice(0, 10).forEach((b) => {
      console.log("FILTER TEST:", {
        name: b.blob_name,
        isAudio: AUDIO_REGEX.test(b.blob_name || "")
      });
    });

    const filtered = rawBlobs.filter((b) => b.blob_name && AUDIO_REGEX.test(b.blob_name));
    console.log("AFTER FILTER COUNT:", filtered.length);

    filtered.slice(0, 10).forEach((blob) => {
      const rawName = blob.blob_name.split('/').pop() || blob.blob_name;
      const title = rawName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      console.log("MAPPING DEBUG:", {
        blob_name: blob.blob_name,
        rawName: rawName,
        finalTitle: title,
        fallbackUsed: !AUDIO_REGEX.test(rawName)
      });
    });

    console.log("FINAL TRACKS:", filtered.slice(0, 10).map(t => t.blob_name));
  })
  .catch(console.error);
