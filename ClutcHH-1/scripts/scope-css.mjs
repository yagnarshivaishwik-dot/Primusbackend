/* Scopes every rule in a CSS file under a given ancestor selector.
 * Leaves @-rules (@keyframes, @media, @font-face, :root) and keyframe children alone.
 * Usage: node scripts/scope-css.mjs <input.css> <prefix>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [input, prefix] = process.argv.slice(2);
if (!input || !prefix) {
  console.error('Usage: node scope-css.mjs <file.css> <.prefix>');
  process.exit(1);
}

const src = readFileSync(input, 'utf8');

// Walk the file tracking brace depth + whether current `{...}` is an at-rule
// body that should NOT have inner selectors scoped (e.g., @keyframes).
let out = '';
let i = 0;
const len = src.length;

// Stack of contexts per `{`: 'skip' = do not prefix selectors inside,
// 'root' / 'at' = prefix inner selectors.
const stack = [];

function readWhitespaceAndComments() {
  let s = '';
  while (i < len) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) { s += src.slice(i); i = len; break; }
      s += src.slice(i, end + 2);
      i = end + 2;
    } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      s += c; i++;
    } else break;
  }
  return s;
}

function currentContextPrefixes() {
  // Only prefix top-level selectors and selectors directly inside media/supports.
  for (let k = stack.length - 1; k >= 0; k--) {
    if (stack[k] === 'skip') return false;
  }
  return true;
}

function prefixSelectorList(selectors) {
  return selectors
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // Don't prefix keyframe stops (e.g. '0%', 'from', 'to'), :root, html, body.
      if (/^(\d|from\b|to\b)/i.test(s)) return s;
      if (/^(:root|html|body)\b/i.test(s)) return s;
      // Don't re-prefix if already scoped.
      if (s.startsWith(prefix)) return s;
      return `${prefix} ${s}`;
    })
    .join(', ');
}

while (i < len) {
  out += readWhitespaceAndComments();
  if (i >= len) break;

  // Find next `{` or `}` or `;` at this level.
  let j = i;
  let inString = null;
  let selStart = i;
  while (j < len) {
    const c = src[j];
    if (inString) {
      if (c === inString && src[j - 1] !== '\\') inString = null;
      j++; continue;
    }
    if (c === '"' || c === "'") { inString = c; j++; continue; }
    if (c === '/' && src[j + 1] === '*') {
      const end = src.indexOf('*/', j + 2);
      j = end === -1 ? len : end + 2; continue;
    }
    if (c === '{' || c === '}' || c === ';') break;
    j++;
  }

  const chunk = src.slice(selStart, j).trim();
  const delim = src[j];

  if (delim === '{') {
    // Decide context for this block.
    const isAtRule = chunk.startsWith('@');
    let ctx = 'root';
    if (isAtRule) {
      // at-rules that contain declarations or keyframe stops should not scope selectors inside
      if (/^@(keyframes|font-face|page|counter-style|property|font-feature-values)/i.test(chunk)) {
        ctx = 'skip';
      } else {
        ctx = 'at';
      }
    }

    // Output the selector/prelude
    if (chunk) {
      if (isAtRule) {
        out += chunk + ' ';
      } else if (currentContextPrefixes() && chunk !== prefix) {
        // Only prefix if we're at an allowed nesting level (top or inside @media/@supports).
        // But also only if the PARENT context is not 'skip' (handled above).
        // Special case: selectors starting with ':root', 'html', 'body' or already containing prefix.
        out += prefixSelectorList(chunk) + ' ';
      } else {
        out += chunk + ' ';
      }
    }
    out += '{';
    stack.push(ctx);
    i = j + 1;
  } else if (delim === '}') {
    out += chunk;
    out += '}';
    stack.pop();
    i = j + 1;
  } else if (delim === ';') {
    out += chunk + ';';
    i = j + 1;
  } else {
    // EOF
    out += chunk;
    i = len;
  }
}

writeFileSync(input, out);
console.log(`Scoped ${input} under "${prefix}"`);
