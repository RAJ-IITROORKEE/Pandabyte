// Only the agent document can request microphone permission after user activation.
export const pandaAgentVoiceHeaders = [{
  source: "/panda-agent",
  headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" }],
}];
