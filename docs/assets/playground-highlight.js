const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function highlightJsonText(value) {
  return escapeHtml(value).replace(/(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g,
    (match, number, boolean, nil) => `<span class="json-${number ? 'number' : boolean ? 'boolean' : nil ? 'null' : 'text'}">${match}</span>`);
}

function highlightExpression(tokens) {
  return tokens.map(token => {
    const escaped = escapeHtml(JSON.stringify(token.text).slice(1, -1));
    return `<span class="token-${token.kind}">${escaped}</span>`;
  }).join('');
}

/** Highlight JSON while delegating payload-expression classification to payload-vars tokens. */
export function highlightJson(source, expressionTokens = new Map()) {
  const strings = /"(?:\\.|[^"\\])*"/g;
  let html = '';
  let cursor = 0;
  for (const match of source.matchAll(strings)) {
    html += highlightJsonText(source.slice(cursor, match.index));
    let decoded;
    try { decoded = JSON.parse(match[0]); } catch { decoded = undefined; }
    const tokens = expressionTokens.get(decoded);
    if (tokens) {
      html += `<span class="json-quote">"</span>${highlightExpression(tokens)}<span class="json-quote">"</span>`;
    } else {
      const rest = source.slice(match.index + match[0].length);
      const kind = /^\s*:/.test(rest) ? 'key' : 'string';
      html += `<span class="json-${kind}">${escapeHtml(match[0])}</span>`;
    }
    cursor = match.index + match[0].length;
  }
  return html + highlightJsonText(source.slice(cursor));
}
