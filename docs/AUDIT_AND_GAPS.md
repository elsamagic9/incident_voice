# IncidentVoice audit index

The older report in this location contained incorrect protocol descriptions and unsupported completion claims. Use these evidence-based records:

- [Original code review, September 8](CODE_REVIEW_2026-09-08.md): historical defects and reproduction evidence.
- [Repair and validation record](DEMO_READINESS_AUDIT.md): fixes, current checks, and remaining limits.
- [Submission checklist](SUBMISSION_CHECKLIST.md): final provider, deployment, and media checks.

The supported managed audio event is `reply.audio`; audio is PCM16 mono at 24 kHz. Reports now use AssemblyAI LLM Gateway, replacing the retired LeMUR endpoint. No local test suite proves that a public deployment, microphone conversation, or live infrastructure action has succeeded.
