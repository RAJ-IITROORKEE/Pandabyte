// Local operator state and raw research inputs must never become deployed function files.
export const pandaAgentTraceExclusions = [
  './Panda-agent/infra/**/artifacts/**',
  './Panda-agent/artifacts/**',
  './Panda-agent/rag-documents/**',
  './Panda-agent/devtools/**',
  './Panda-agent/evaluation/**',
  './.insforge/**',
  './.env*',
];
