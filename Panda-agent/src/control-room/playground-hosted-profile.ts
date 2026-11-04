import { hostedPlaygroundEnabled } from './playground-capabilities.ts';

// This explicit host-readiness gate stays off until matching authority and allocation are reviewed.
export function hostedPlaygroundProfile(flags:NodeJS.ProcessEnv): 'mini-two-case-v1' | 'product-playground-v1' | null {
 if (!hostedPlaygroundEnabled(flags)) return null;
 if (flags.PANDA_AGENT_PLAYGROUND_PROFILE === 'product-playground-v1') return flags.PANDA_AGENT_PRODUCT_PLAYGROUND_HOST_READY === 'true' ? 'product-playground-v1' : null;
 return flags.PANDA_AGENT_PLAYGROUND_PROFILE === 'mini-two-case-v1' ? 'mini-two-case-v1' : null;
}
