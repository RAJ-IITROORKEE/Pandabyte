// OpenCode 2.2.2 Plugin.define returns this descriptor unchanged. No dependency is needed.
// Dedicated Panda instances only: deny every proposed session model retry, including uncertain transport failures.
const noRetry = {
    id: 'panda-no-retry',
    async setup(context: { session: { hook: (name: 'retry', callback: (event: { decision: { retry: boolean; delay?: number } }) => void) => Promise<unknown> } }) {
        await context.session.hook('retry', event => { event.decision = { retry: false }; });
    },
};
export default noRetry;
