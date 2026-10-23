/**
 * Clipboard write with a boolean result. `navigator.clipboard` can be missing
 * (or reject without a document focus); callers show a notice or, for secret
 * export, fall back to a selectable read-only textarea.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
