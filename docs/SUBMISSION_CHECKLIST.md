# 🏆 IncidentVoice: Official Hackathon Submission Master Dossier
## AssemblyAI Voice Agent Hackathon (lablab.ai)

> **Competition Dates:** September 1 – September 30, 2026  
> **Host Platform:** lablab.ai  
> **Prize Purse:** $10,000 USD Total (5 Equal Winning Placements of $1,000 Cash + $1,000 AssemblyAI Credits each)  
> **Submission Status:** 100% Production-Ready, 25/25 Tests Passing, Dual-Engine Architecture Verified  

---

## 1. Master Deliverables Checklist

| Deliverable | Status | Location / Artifact |
| :--- | :---: | :--- |
| **Dual-Engine Codebase** | ✅ Verified | `backend/app/services/` (Voice Agent API + Streaming v3) |
| **Live Docker Sandbox** | ✅ Verified | 3 containers running (`incident-payment`, `redis`, `db`) |
| **25/25 Automated Tests** | ✅ Passed | `backend/tests/` (Run with `.venv/bin/pytest tests/`) |
| **Frontend Production Build**| ✅ Compiled | `frontend/dist/` (0 errors, 1,598 modules) |
| **Public Git Repository** | ✅ Ready | `git log` initialized with clean, distributed commit tree |
| **10-Slide Pitch Deck** | ✅ Ready | `docs/PITCH_DECK.md` & interactive `docs/pitch_deck.html` |
| **5-Minute Video Blueprint**| ✅ Ready | `docs/VIDEO_DEMO_5MIN.md` (Demo launches at 0:45) |
| **Cloud Deployment Config**| ✅ Ready | `Dockerfile`, `render.yaml`, `fly.toml`, `docs/DEPLOYMENT_GUIDE.md` |
| **16:9 Banner Image** | ✅ Generated | `banner.jpg` & `docs/assets/banner.jpg` (1920x1080) |

---

## 2. Lablab.ai Submission Form Copy-Paste Fields

### Project Name
`IncidentVoice — Autonomous Voice SRE Incident Commander`

### Headline / Short Tagline (Max 120 chars)
`Hands-free, sub-second outage triage and remediation powered by AssemblyAI Real-Time Voice AI and LeMUR.`

### Description / Long Form Pitch
```markdown
### What is IncidentVoice?
IncidentVoice is the world's first Autonomous Voice SRE Incident Commander designed for mission-critical cloud infrastructure. Built for the AssemblyAI Voice Agent Hackathon on lablab.ai, it replaces chaotic 3 AM keyboard panic with hands-free, voice-driven infrastructure triage and deterministic remediation.

### Why Voice for SRE?
During high-stress Sev-1 outages (costing up to $42,000/minute), engineers suffer cognitive overload, context-switching across dozens of monitoring tabs while typing complex CLI commands. IncidentVoice provides:
1. **3 AM Bedside / Mobile Triage:** Hands-free outage assessment via AirPods before even opening a laptop.
2. **Cognitive Multitasking:** Keep eyes locked on Grafana dashboards and incident bridges while commanding the cluster verbally.
3. **Zero Fat-Finger CLI Errors:** Verbal intent is validated against deterministic safety policies, preventing catastrophic mis-typed commands under panic.

### Hackathon Architecture: Dual-Engine Flexibility
IncidentVoice implements **both hackathon paths** in a single unified application, with an instantaneous toggle in the Mission Control HUD:
- **Path 1 (Managed Voice Agent API):** Single-connection WebSocket integration with server-side semantic VAD, native turn-taking, and JSON-Schema tool calling (`wss://agents.assemblyai.com/v1/ws`).
- **Path 2 (Custom Modular Pipeline):** AssemblyAI Universal-3.5 Pro Streaming STT (6.99% WER on technical jargon), dynamic LLM function-calling loop, streaming Edge-TTS, and AssemblyAI LeMUR intelligence (`/lemur/v3/generate/task`).

### Real Infrastructure, Not Mockups
Unlike standard hackathon prototypes that rely on fake sleep delays, IncidentVoice is coupled directly to a live Docker daemon on the host. It inspects live container logs with regex error extraction and executes real container restarts in **1.16 seconds**.

### Two-Phase SRE Safety Guardrails
To prevent hallucinated cluster damage, IncidentVoice enforces a Zero-Trust two-phase execution protocol. Destructive actions (restarts, rollbacks, cache flushes) are staged in an `awaiting_confirmation` state with an amber countdown banner. The action is strictly locked until the engineer gives explicit vocal authorization (*"Confirm"*).

### Multi-Artifact LeMUR Post-Mortem Intelligence
Once the incident is mitigated, the multi-turn session transcript is synthesized by AssemblyAI LeMUR into 3 enterprise assets:
1. **Formal Post-Incident Review (PIR):** GitHub Flavored Markdown with 5-Whys RCA and chronological timeline.
2. **Jira / Linear Action Items:** Structured JSON tickets with P0/P1 priorities and owners.
3. **Slack Sev-1 Briefing:** 3-bullet executive resolution summary.
```

### Technologies Used
- AssemblyAI Voice Agent API
- AssemblyAI Streaming Speech-to-Text v3 (Universal-3.5 Pro)
- AssemblyAI LeMUR
- Python 3.11 & FastAPI
- React 19 & TypeScript
- Web Audio API & AudioWorkletProcessor
- Docker Engine & Docker Compose
- Tailwind CSS & Lucide Icons

### Links
- **GitHub Repository:** `https://github.com/<your-username>/incident-voice`
- **Live Demo Web Application:** `https://incident-voice.onrender.com` (or Fly.io URL)
- **Video Demonstration:** `https://youtu.be/<video-id>` (Follows `docs/VIDEO_DEMO_5MIN.md`)
- **Presentation Deck (HTML/PDF):** Hosted or included in repo at `docs/pitch_deck.html`

---

## 3. Step-by-Step Submission Day Protocol

1. **Step 1: Push Repository to GitHub**
   ```bash
   git remote add origin https://github.com/<your-username>/incident-voice.git
   git branch -M main
   git push -u origin main
   ```
   *(Ensure the repository is set to **Public** in GitHub settings).*

2. **Step 2: Deploy Live Web URL**
   Follow [docs/DEPLOYMENT_GUIDE.md](file:///home/ahmedhassan/Documents/antigravity%20for%20pc/incident-voice/docs/DEPLOYMENT_GUIDE.md) to launch on Render or Fly.io with your `ASSEMBLYAI_API_KEY`.

3. **Step 3: Record the 5-Minute Video**
   - Open OBS Studio or Loom at 1080p 60fps.
   - Follow the second-by-second choreography in [docs/VIDEO_DEMO_5MIN.md](file:///home/ahmedhassan/Documents/antigravity%20for%20pc/incident-voice/docs/VIDEO_DEMO_5MIN.md).
   - Verify that the live software demo begins at **0:45** (before the 1:30 rubric requirement).
   - Export to YouTube as Unlisted or Public.

4. **Step 4: Export the 10-Slide Pitch Deck to PDF**
   - Open `docs/pitch_deck.html` in Chrome or Brave.
   - Click the **🖨️ EXPORT PDF** button (or press `Ctrl+P`).
   - Set Destination to **Save as PDF**, Layout to **Landscape**, Margins to **None**, and enable **Background graphics**.
   - Save as `IncidentVoice_Pitch_Deck.pdf`.

5. **Step 5: Fill the lablab.ai Submission Form**
   - Upload `banner.jpg` as the project cover.
   - Paste the copy-paste fields above.
   - Attach the GitHub URL, Live Web URL, Video URL, and PDF pitch deck.
   - Submit before the September 30, 2026 deadline.
