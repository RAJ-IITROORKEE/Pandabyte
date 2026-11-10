// Opt-in public-search acceptance; the shared driver retains the exact B lifecycle guards.
if(!['--aws-search-injected','--aws-search-real'].includes(process.argv[2]))throw Error('Explicit native search fixture required');
await import('./test-native-research.mjs');
