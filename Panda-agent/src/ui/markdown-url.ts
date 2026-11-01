// Model output is untrusted. Do not load images or navigate to arbitrary schemes.
export function markdownUrl(url: string, key: string): string {
  if (key !== 'href') return '';
  try {
    const target = new URL(url);
    return (target.protocol === 'https:' || target.protocol === 'http:') && !target.username && !target.password ? target.href : '';
  } catch { return ''; }
}
