/**
 * HomeKit only allows alphanumeric, space, and apostrophe characters in
 * accessory/service names, starting and ending with an alphanumeric character.
 * Underscores and other punctuation cause HAP warnings and may prevent the
 * accessory from being added to the Home app.
 */
export function sanitizeName(name: string): string {
  return name
    .replace(/_/g, ' ')               // underscores → spaces
    .replace(/[^a-zA-Z0-9 ']/g, ' ')  // other invalid chars → space
    .replace(/\s+/g, ' ')             // collapse runs of spaces
    .trim()
    .replace(/^[^a-zA-Z0-9]+/, '')    // must start with alphanumeric
    .replace(/[^a-zA-Z0-9]+$/, '')    // must end with alphanumeric
    || 'BedJet';
}
