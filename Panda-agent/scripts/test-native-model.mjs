// Opt-in paid-model acceptance; the shared driver owns every native and egress fence.
if(!['--aws-model-injected','--aws-model-real'].includes(process.argv[2]))throw Error('Explicit native model fixture required');
await import('./test-native-research.mjs');
