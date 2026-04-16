/**
 * HTML escaping utility for preventing XSS attacks.
 * React escapes by default, but this provides explicit defense-in-depth.
 */

/**
 * Escape HTML special characters to prevent XSS attacks.
 * @param text - Text to escape
 * @returns Escaped text safe for rendering
 */
export function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

