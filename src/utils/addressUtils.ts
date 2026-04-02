/**
 * Central utility for Aptos address normalization and ID standardization.
 * This ensures that addresses from different wallets (Petra, Keyless, etc.)
 * and hex IDs are always compared in a consistent format.
 */

/**
 * Normalizes an Aptos address to its full 64-character hex representation (padded with leading zeros).
 * Example: "0x1" becomes "0x0000000000000000000000000000000000000000000000000000000000000001"
 */
export const normalizeAddress = (address: string): string => {
  if (!address) return '';
  let hex = address.startsWith('0x') ? address.slice(2) : address;
  // Account address in Aptos is 32 bytes = 64 hex characters
  return '0x' + hex.toLowerCase().padStart(64, '0');
};

/**
 * Standardizes a hex ID (like a blob commitment) by ensuring it starts with 0x and is lowercase.
 * This does NOT pad, as IDs can vary in length, unlike account addresses.
 */
export const standardizeID = (id: string): string => {
  if (!id) return '';
  const hex = id.startsWith('0x') ? id.slice(2) : id;
  return ('0x' + hex).toLowerCase();
};
