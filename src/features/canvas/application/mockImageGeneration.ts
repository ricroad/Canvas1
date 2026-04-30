const MOCK_IMAGE_COLORS = [
  ['#0ea5e9', '#0f172a'],
  ['#22c55e', '#052e16'],
  ['#f97316', '#431407'],
  ['#a855f7', '#2e1065'],
];

function escapeSvgText(value: string): string {
  return value.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] ?? char);
}

export function createMockImageDataUrl(label: string, index = 0): string {
  const [accent, background] = MOCK_IMAGE_COLORS[index % MOCK_IMAGE_COLORS.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${accent}" />
          <stop offset="100%" stop-color="${background}" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#bg)" />
      <circle cx="786" cy="210" r="154" fill="rgba(255,255,255,0.12)" />
      <circle cx="204" cy="812" r="220" fill="rgba(255,255,255,0.08)" />
      <text x="72" y="124" fill="white" font-family="Inter, Arial, sans-serif" font-size="54" font-weight="800">Mock Image</text>
      <text x="72" y="196" fill="rgba(255,255,255,0.82)" font-family="Inter, Arial, sans-serif" font-size="32">Variant #${index + 1}</text>
      <foreignObject x="72" y="300" width="760" height="240">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font: 34px Inter, Arial, sans-serif; color: rgba(255,255,255,0.9); line-height: 1.35;">
          ${escapeSvgText(label || 'Local test output')}
        </div>
      </foreignObject>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
