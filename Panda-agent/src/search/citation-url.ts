export const webSearchSection = 'Web search excerpt (Tavily)';
export function publicSearchCitationUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return value.length <= 500 && u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash
      && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(u.hostname)
      && !/(?:^|\.)(?:localhost|localdomain|local|internal|test|example|invalid)$/.test(u.hostname);
  } catch { return false; }
}
