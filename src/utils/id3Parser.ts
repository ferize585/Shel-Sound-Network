export function parseID3Metadata(buffer: ArrayBuffer): { artist?: string; title?: string } {
  if (!buffer || buffer.byteLength < 128) return {};
  
  const view = new DataView(buffer);
  let artist = '';
  let title = '';

  try {
    // --- ID3v2 Parsing (Start of file) ---
    if (buffer.byteLength > 10 && view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
      const sizeByte1 = view.getUint8(6);
      const sizeByte2 = view.getUint8(7);
      const sizeByte3 = view.getUint8(8);
      const sizeByte4 = view.getUint8(9);
      // Synchsafe integer mapping
      const tagSize = (sizeByte1 << 21) | (sizeByte2 << 14) | (sizeByte3 << 7) | sizeByte4;
      
      let offset = 10;
      while (offset < tagSize + 10 && offset < buffer.byteLength - 10) {
        const frameId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
        if (frameId === '\u0000\u0000\u0000\u0000') break; // padding
        
        let frameSize = view.getUint32(offset + 4);
        
        // Some ID3v2.4 uses synchsafe frame sizes, some ID3v2.3 uses regular 32-bit. 
        // A simple check: if frameSize is insanely large, it's probably synchsafe.
        if (frameSize > buffer.byteLength) {
           const fb1 = view.getUint8(offset + 4);
           const fb2 = view.getUint8(offset + 5);
           const fb3 = view.getUint8(offset + 6);
           const fb4 = view.getUint8(offset + 7);
           frameSize = (fb1 << 21) | (fb2 << 14) | (fb3 << 7) | fb4;
        }

        offset += 10; // skip header
        
        if ((frameId === 'TIT2' || frameId === 'TPE1') && frameSize > 1) {
          const encoding = view.getUint8(offset);
          let text = '';
          
          if (encoding === 0 || encoding === 3) {
            // ISO-8859-1 or UTF-8
            for (let i = 1; i < frameSize; i++) {
              if (offset + i >= buffer.byteLength) break;
              const char = view.getUint8(offset + i);
              if (char !== 0) text += String.fromCharCode(char);
            }
          } else if (encoding === 1 || encoding === 2) {
            // UTF-16
            for (let i = 1; i < frameSize - 1; i += 2) {
              if (offset + i + 1 >= buffer.byteLength) break;
              // Simplistic utf16 read (assumes LE or BOM handles it loosely)
              const charCode = view.getUint16(offset + i, encoding === 1 ? true : false);
              if (charCode !== 0 && charCode !== 0xFEFF && charCode !== 0xFFFE) {
                text += String.fromCharCode(charCode);
              }
            }
          }
          
          // clean up non-printable
          text = text.replace(/[^\x20-\x7E\u00A0-\u024F]/g, '').trim();
          
          if (frameId === 'TIT2') title = text;
          if (frameId === 'TPE1') artist = text;
        }
        offset += frameSize;
      }
    }
    
    // --- ID3v1 Parsing (End of file Fallback) ---
    if (!artist && !title && buffer.byteLength > 128) {
      const v1Offset = buffer.byteLength - 128;
      if (view.getUint8(v1Offset) === 0x54 && view.getUint8(v1Offset+1) === 0x41 && view.getUint8(v1Offset+2) === 0x47) { // "TAG"
        let v1Title = '';
        for (let i = 3; i < 33; i++) {
          const char = view.getUint8(v1Offset + i);
          if (char === 0) break;
          v1Title += String.fromCharCode(char);
        }
        let v1Artist = '';
        for (let i = 33; i < 63; i++) {
          const char = view.getUint8(v1Offset + i);
          if (char === 0) break;
          v1Artist += String.fromCharCode(char);
        }
        if (v1Title) title = v1Title.trim();
        if (v1Artist) artist = v1Artist.trim();
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn("ID3 Parsing Error:", err);
  }
  
  return { artist, title };
}
