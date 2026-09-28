# Market, Community & Judging Review Dataset

**Research window:** 2026-09-26 · **Four parallel research streams:** market landscape, practitioner
community, voice-AI engineering reality, hackathon judging criteria.

**Evidence tiers used throughout:**
- **(A) VERIFIED** — primary source (official docs, official pricing, the page's own source strings)
- **(B) INFERENCE** — derived from A/B evidence, reasoned but not directly stated
- **(C) UNKNOWN** — could not be verified; listed so it is not mistaken for a finding

This file is a decision input, not marketing copy. Section 6 is the part that changes what we do
this week.

---

## 0. URGENT: the deadline and the one gate that gates everything

| Finding | Evidence |
|---|---|
| Hackathon runs **Sep 1–30, 2026**; machine-readable payload gives `endAt: 2026-09-30T15:00:00.000Z` | **(A)** [lablab.ai event page](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) RSC payload |
| **~4 days remain** from this research date | derived from the above |
| **A working public URL is the scoring gate, not a bonus.** Criterion 1 ("Application of Technology", 1–5) scores **1** when "Demo link is not available. Github is not available." | **(A)** [lablab.ai/hackathon-rules](https://lablab.ai/hackathon-rules) |
| lablab's own guidance: *"Building without deploying — a working local demo that can't be accessed by judges scores as if it doesn't work."* | **(A)** [how-to-win-an-ai-hackathon](https://lablab.ai/guide/how-to-win-an-ai-hackathon) |
| *"$10,000 Prize Pool ($5k cash + $5k in AAI credits)"*; five winners × $1,000 cash + $1,000 credits; no per-place differentiation published | **(A)** event page · **(C)** `eventPrizes` empty — track structure unknown |
| 3,842 participants / 1,146 teams / **158 submissions** as of 2026-09-26 | **(A)** event `/live` page |
| Named judge: **Bhargavi Vepuri, Director, AssemblyAI** | **(A)** rules page |

**Submission checklist still open in `docs/SUBMISSION_CHECKLIST.md`:** reachable HTTPS URL, submission
form URLs, recorded demo video. These are the exact artifacts the rubric gates on.

---

## 1. What the world actually wants

Ranked by strength of evidence, not by our interest in the answer.

### 1.1 Wants: read-only context assembly, not autonomous action

- **(A)** "Engineers stop wasting the first 10 minutes of an incident assembling basic context because
  the agent already did that well" — *tianpan.co, 2026-04-16* (vendor; treated as directional).
- **(A)** Wants are consistently **read-only and evidence-backed**, never "let it fix it."
- **(A)** "Work to RESOLVE issues — Not just enough to make the alerts go away and be fixed, but dig
  into why something alerts." — *r/sre, 2026-04-18*.

### 1.2 Wants: show the evidence

- **(A)** "Confidence gets earned from agreement, not announced." — *dev.to, 2026-09-25*.
- **(A)** *A recommendation without a re-runnable check is a hypothesis, not a finding.* This is the
  single most consistent expectation across the community stream.
- **(B)** Our OBS-observation-ID grounding is a **direct answer to a stated, unmet need** — and
  competitors do not do it. PagerDuty gates change→incident correlation behind an AIOps add-on
  (**A**, [pricing](https://www.pagerduty.com/pricing/)); BigPanda meters it in credits
  (**A**, [pricing](https://www.bigpanda.io/pricing/)).

### 1.3 Does NOT want: autonomous production writes — and confirmation dialogs are distrusted

This is the finding that most directly challenges our design.

- **(A)** "This must be prevented by access control, **not by training or prompting the agent**." —
  *r/sre, 2025-12-06*, thread "We're about to let AI agents touch production."
- **(A)** The canonical scar event: HN item 47911524, *"An AI agent deleted our production
  database,"* **860 points / 1,032 comments**, 2026-04-26. Top rejection of UI-level fixes:
  > "If the API replied 'Are you sure (Y/N)?' the AI, in the mode it was in, guardrails completely
  > pushed off the side of the road, it would have just said 'Yes' anyway." — *ad_hockey*
- **(A)** "there's basically no control layer between what the agent decides to do and what actually
  runs on your system… once you hit enter, it's already too late." — *r/devops, 2026-09*
- **(B)** **Consequence for us:** a voice-confirmed two-phase gate is necessary but **not
  sufficient**, because a voice confirmation prompt can be answered by the very agent that proposed
  the action. The gate must terminate in something the agent cannot satisfy alone.
- **(C) UNKNOWN:** no practitioner-thread evidence on voice-based ops specifically. Absence of
  evidence, not evidence of absence — see §4.1.

### 1.4 Wants: an override rate they can measure

- **(A)** "If humans are overriding or escalating AI recommendations fewer than 5% of the time, that's
  not a sign the AI is excellent — it's a sign responders are rubber-stamping." — *tianpan.co*
- **(B)** Near-zero override is a **negative** signal. Do not market "100% safety gate adherence"
  without also showing a non-trivial override/cancel rate.

### 1.5 The market is re-packaging, not shrinking

| Signal | Evidence |
|---|---|
| Shoreline (auto-remediation) **acquired by NVIDIA** ~$100M, 2024-06-18; shoreline.io dead | **(A)** [Bloomberg](https://www.bloomberg.com/news/articles/2024-06-18/nvidia-agrees-deal-to-buy-software-startup-shoreline) |
| **Opsgenie retired** — end of sale 2025-06-04, shutdown **2027-04-05, unmigrated data deleted** | **(A)** [Atlassian](https://support.atlassian.com/opsgenie/docs/what-happens-when-opsgenie-is-turned-off/) |
| PagerDuty Reliability Platform launched 2026, Starter **$2,800/yr** → Ultimate (500 seats) custom | **(A)** [pricing](https://www.pagerduty.com/pricing/) |
| Entry band **$15–25/user/mo** + on-call add-on **+$10–20**; enterprise deals **$100k–700k/yr** | **(A)** incident.io $19/$25, Rootly $20+$20, Datadog IR $40–58, FireHydrant $25 |

- **(A)** **No incumbent ships a first-class shift-handoff artifact.** incident.io publishes a *blog
  template* and concedes an unacknowledged alert "lands on whoever the escalation path reaches next,
  **usually the person with the least context**." — [incident.io](https://incident.io/blog/async-on-call-handoff-template)
- **(A)** Alert-noise reduction is **priced, not solved**: PagerDuty gates **11 of 11** noise
  features behind the paid AIOps add-on (**A**, pricing feature matrix).
- **(A)** Postmortems are the churned feature — PagerDuty **EOL'd Postmortems 2026-10-31**; AI-drafted
  PIRs paywalled behind the Advance add-on (**A**, [changelog](https://support.pagerduty.com/main/changelog/postmortems-end-of-life-transition-to-post-incident-reviews-in-web-ui-ea-by-october-31-2026)).

---

## 2. What they expect (thresholds, not vibes)

### 2.1 Latency — the number to actually plan against

| Metric | Value | Tier |
|---|---|---|
| Streaming v3 **Time To Complete Turn** P50 (U3.5 Pro) | **568 ms** | **(A)** [benchmarks](https://www.assemblyai.com/docs/streaming/benchmarks) |
| Same, P90 | **829 ms** | **(A)** |
| Marketing "sub-300 ms" | STT-internal claim, **not** the loop | **(A)** [models](https://www.assemblyai.com/docs/getting-assembly/models) |
| Full loop speech-end → first audio (P50) | **~800 ms – 1.2 s** | **(C)** no official end-to-end figure exists |

- **(D) UNKNOWN:** AssemblyAI publishes **no** speech-end→first-audio figure for the Voice Agent API.
- **(A)** Do not claim sub-300 ms end-to-end. The repo's `last_llm_ms` instrumentation is the right
  instinct; extend it to per-stage timing before the demo.

### 2.2 Accuracy — entity error rate matters, not WER

- **(A)** On U3.5 Pro Streaming, at **6.3% mean WER**: email **MER 59.6%**, phone **MER 34.8%**
  (**A**, benchmarks page).
- **(B)** **Never trust ASR for identifiers.** Numbers spoken aloud must be re-confirmed before any
  action depends on them.

### 2.3 Tool-call safety (the seven-layer model, third-party, labelled **(B)**)

identity scope → validation → idempotency → confirm → typed errors → latency budget → audit.
- **(B)** The failure this prevents: *"the agent states a policy that doesn't exist, the call is
  recorded, the company is held to it"* — *Velocity, 2026-05-31*.
- **(B)** Confidence must gate escalation — **not sentiment** (*DILR.ai, 2026-06-18*).

### 2.4 Barge-in — cancellation is not enough

- **(B)** The four commonly-skipped steps: **detect → cancel → flush playback → reconcile history.**
  Without truncating history to what was actually played, the model conditions on words the user
  never heard — *Zylos, 2026-07-17*.
- **(B)** Target false-barge-in <2%; **>5% "feels broken."** Triggers: TV/background noise, side
  conversations, low-bitrate Opus.
- **(B)** Mobile Chromium can capture at 48 kHz while *reporting* 24 kHz — a large share of apparent
  "hallucination" is a capture bug. Validate actual sample rate at the browser boundary.

### 2.5 Cost — deterministic, per minute

Published rates **(A)** [pricing](https://www.assemblyai.com/pricing), 2026-05-29:

| Path | Arithmetic | Per min |
|---|---|---|
| **A. Managed Voice Agent API** (all-in $4.50/hr) | 4.50 / 60 | **$0.0750** |
| **B. BYO** U3.5 Pro STT $0.45/hr + Gemini 2.5 Flash + Cartesia Agents $0.06/min | 0.0075 + 0.0060 + 0.0600 | **$0.0735** |
| **B′. BYO** + Claude Sonnet 4.6 instead of Flash | 0.0075 + 0.0552 + 0.0600 | **$0.1227** |

- **(A)** **Path A and Path B are at statistical parity** ($0.075 vs $0.0735). The repo's dual-engine
  story is justified on *latency/control*, **not** on cost.
- **(A)** Hidden costs: streaming bills **session-open time, not audio** (un-terminated sockets
  auto-close at 3 h and bill 3 h); 30 s Voice Agent resume grace is billable; in-region LLM Gateway
  +10% since 2026-07-01; STT add-ons (Voice Focus +$0.10/hr, diarization +$0.12/hr).
- **(C) UNKNOWN:** Universal-3.6 Pro pricing not published anywhere found.

### 2.6 Our technical debt vs. current AssemblyAI reality

| Repo state | Current reality | Action |
|---|---|---|
| uses `universal-3-5-pro` | `universal-3-6-pro` is the **recommended default**; 3.5 still supported (**A**) | safe to keep; don't claim "latest" |
| LeMUR referenced in `docs/AUDIT_AND_GAPS.md` | **LeMUR deprecated 2026-03-31**, removed from SDK (**A**) | audit doc already notes migration; keep wording accurate |
| LLM Gateway used | relaunched **2026-04-13**, 25+ models, OpenAI-compatible (**A**) | current |
| `keyterms` (29 terms) + `transcription_prompt` | limits: **100 keyterms**, `agent_context` 1750 chars (**A**) | well within budget |

Documented AssemblyAI landmines worth knowing (**A**, docs): `word_boost` **silently downgrades to
Universal-2**; `language_code` silently ignored; Auto Chapters/Summarization cause **silent 500s** on
U3.5 Pro; `end_of_turn_confidence_threshold` deprecated.

---

## 3. What to BUILD

Ordered by rubric impact × evidence strength. Deadline-aware.

### P0 — unblocks scoring (do these first, 4 days)

1. **Deploy a reachable HTTPS URL.** Without it, criterion 1 caps at ~1–2/5. Ship a hosted demo mode
   or a seeded demo dataset so a judge can click through **without a key**.
2. **Video, 3–5 minutes**, with a ~2-minute working demo at its core; deck **8–10 slides**.
   Record early, keep re-record budget. **(A)** rubric band: <3 min scores 2, <5 min with market
   analysis scores 4.
3. **Public GitHub with incremental commits.** **(A)** "an empty repo with one final push raises red
   flags." Our history is healthy — preserve it.

### P1 — the differentiator the market lacks

4. **Evidence as a first-class object.** Observation IDs, `measured_at`, and a re-runnable check per
   hypothesis. Competitors gate this behind paid add-ons. This is the wedge.
5. **A handoff artifact.** No incumbent ships one; incident.io ships a blog template. Exportable
   shift-context object with acknowledgement = unclaimed, defensible ground.
6. **PIR / post-incident report as a first-class output, not a bolt-on.** PagerDuty EOL'd
   postmortems; AI-drafted PIRs are paywalled. Cheap to lead with.

### P2 — credibility with judges

7. **Per-stage latency instrumentation** (§2.1) so we can state a measured number instead of a
   marketing one. Judges can tell the difference.
8. **Show simulation vs. live explicitly in the UI and narration.** Our honest-labeling posture is a
   scoring asset: **(A)** "Being honest about it reads as confidence" — *Katherine Druckman, JetBrains
   Blog, 2026-06-22*.
9. **A business case with a named user, TAM figure, and one revenue model.** ~20% of the rubric
   (Business Value + Presentation market analysis) and the most commonly omitted element.

---

## 4. What NOT to build

### 4.1 Do not build more agent depth

**(A)** lablab: *"Over-engineering the AI layer — chaining 5 LLM calls when 1 would do adds latency and
failure points."* **(B)** Our Reflexion + ToT + causal-RCA + speculative-execution stack
(docs phases 11–12) is exactly this shape. Judge feedback, same source: *"A strong project with a
confusing demo loses to a simpler project that the judges understand… Trying to do too much, you're
actually guaranteeing that nothing in your demo works end to end."*

**Action:** do not extend Phases 11–12. Surface at most one of them, visibly, in the demo.

### 4.2 Do not build on voice as an assumed demand

- **(A)** **No high-engagement practitioner discussion of voice-based ops** was found on r/sre, r/ops,
  r/devops, or HN. (C) UNKNOWN whether practitioners want to talk to a system mid-incident.
- **(A)** The one on-point practitioner choice runs the other way: an on-call AI built
  *"intentionally non-conversational. There is no chat interface and no back-and-forth prompting… This
  project focuses on helping users think less during critical moments."* — *Sreenu Sasubilli,
  dev.to, 2025-02-05*.
- **(A)** Consumer-side, **PYMNTS 2025-07-31**: voice is the **least-preferred** gen-AI interface
  across all age groups — *"no generation ranks voice as their preferred method."* Not ops data; use
  as a prior, not a verdict.
- **(B)** **So position voice as an interface choice, not as the thesis.** The thesis that survives
  this evidence is *"grounded, auditable, human-gated incident action"*; voice is the demo surface.
  Judging criterion 1 rewards the AssemblyAI integration, so keep the voice loop visible and real —
  but do not stake the pitch on "engineers want to talk to it."

### 4.3 Do not build competing alert-routing breadth

**(A)** 750+ integrations and AIOps are PagerDuty's moat; per-alert metering (FireHydrant Signals)
makes volume a cost penalty. Not winnable in 4 days.

### 4.4 Do not build a voice-only confirmation gate and call it safe

**(A)** §1.3 — the "Are you sure?" prompt is explicitly cited as a defeated control. **Action:** the
final authorization must require a factor the agent cannot self-satisfy (operator-held secret, or a
second distinct human on the channel). Frame the current gate honestly as *voice-UX staging* with
*structural* enforcement in the tool layer.

### 4.5 Do not scale infra scope

**(A)** docs already concede: Docker mode supports restarts only; scaling, cache flush, DNS failover,
circuit breakers have **no live Docker implementation**. Claiming them in the demo would be
overclaiming — the criterion that overclaiming damages is Presentation/Originality credibility.

---

## 5. Evidence quality warnings

- Reddit blocked direct fetch; community quotes come from **search-index excerpts**, so engagement
  counts are approximate.
- Several practitioner sources are **vendor blogs** (tianpan.co, Traversal, ilert, FireHydrant) and
  are commercially interested. They are labelled and are not load-bearing for any P0 decision.
- The lablab event page is JS-rendered; dates/counters were read from its own RSC payload — accurate
  to the page's source strings, but **(C)** the `teamMembersLimit: 6` carries an internal page comment
  saying it is boilerplate and unconfirmed.
- **(C) UNKNOWN:** whether lablab community "hearts" affect judging; per-place prize differentiation;
  Universal-3.6 Pro pricing; any public successor to Shoreline.

---

## 6. The decision this dataset forces

**Ranked by cost-to-score:**

1. **Deploy the URL.** Zero score without it; everything else is decoration until it exists. *This is
   the only true P0.*
2. **Record the 3–5 min video and push the repo.** Second and third gates.
3. **Write the business case.** ~20% of rubric, cheapest remaining points.
4. **Freeze Phases 11–12.** Protect the demo's end-to-end integrity.
5. **Re-frame the pitch** from "voice is the interface people want" to "grounded, auditable,
   human-gated incident action, demonstrated through a real voice loop."
6. **Upgrade the authorization story** from voice confirmation to a non-agent-satisfiable control,
   and say precisely what is simulated.

**What we should not do with 4 days left:** add agent subsystems, add integrations, or refactor.
