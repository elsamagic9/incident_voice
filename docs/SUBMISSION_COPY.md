# IncidentVoice — submission draft

Use this after the HTTPS demo and real microphone video have been checked. These fields follow [lablab's general submission guidance](HACKATHON_RULES_RESEARCH.md); confirm the live event form, character limits, and cutoff before pasting. Replace bracketed items only with verified links. Do not paste an operator token into a public field.

## Title

IncidentVoice

## Short summary

An AssemblyAI voice incident copilot that cites evidence, gates changes on human approval, and checks whether services recovered.

## Long description

During an outage, on-call engineers move between alerts, logs, dashboards, commands, and handoff notes. IncidentVoice brings that loop into one voice workspace. Ask it to investigate a service incident and it captures health and log observations, then shows possible causes linked to numbered evidence. Engineers can open those observations and decide what to check next.

The agent can request an infrastructure change, but the backend stages it with an exact target and a 30-second expiry. A human operator must approve it. Afterward, IncidentVoice compares the target's before-and-after health and checks the rest of the affected services. A successful command is never treated as proof that the incident is over. The evidence, actions, and recovery checks can be exported for handoff or used in a draft incident review.

AssemblyAI powers the managed Voice Agent API conversation, the alternate Streaming STT path, and LLM Gateway analysis when available. Provider failures and local fallbacks are labeled. The public demo runs against a clearly marked simulation; live Docker support is limited to configured container restarts. Our next step is a measured pilot with small platform teams, comparing time to a cited diagnosis and recovery-verification accuracy against their usual workflow.

## Technology and category suggestions

- AssemblyAI Voice Agent API, Streaming STT, LLM Gateway
- Voice assistant; developer tools; incident response; SRE
- FastAPI, WebSocket, React, TypeScript

## Links to fill after verification

- Public repository: [github.com/elsamagic9/incident_voice](https://github.com/elsamagic9/incident_voice) — push and recheck the reviewed commit before submitting.
- HTTPS demo: `[verified URL]`
- Demo video: `[verified video URL or form upload]`
- Pitch deck: [IncidentVoice-Presentation.pdf](IncidentVoice-Presentation.pdf)

## Claims to verify in the final media

- Show an actual microphone-driven AssemblyAI turn and audible reply.
- Show one observation citation, one staged action, explicit approval or cancellation, and a recovery check.
- Keep the simulation label visible. Do not describe the offline 61-turn scripted benchmark as a voice, human-pilot, or production result.
- Check that screenshots in the deck match the deployed build; the current image slides are marked as earlier prototype captures.
