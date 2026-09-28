# Demo video narration script

The recorded screen capture is silent. Speak this over it, or re-record the flow
live while narrating. Timings match `docs/demo/*.png`, which are captured in
order. Target 2:30–3:00 total; the rubric rewards 3–5 minutes with market
analysis, and penalizes anything under 3.

## 0:00 — The problem (show `01-landing`)

> It's 3 a.m. An on-call engineer has roughly ten minutes before the outage
> costs more than the fix. In that window they're copying alerts into one tool,
> logs into another, a dashboard into a third, and trying to work out what to
> tell the rest of the team in the handoff. The work isn't fixing the outage.
> The work is figuring out what's actually true right now.
>
> This is IncidentVoice. It's built on AssemblyAI's Voice Agent API, and you
> talk to it.

## 0:25 — Investigation with evidence (show `02-investigation-brief`)

> "Investigate the incident."
>
> Notice what it does *not* do. It doesn't say "the database looks slow." Every
> hypothesis on this screen is linked to a numbered observation, and the analysis
> came from AssemblyAI's LLM Gateway — the source is labeled, not implied.
>
> Let me open observation E01.

## 0:55 — Opening the evidence (show `03-cited-evidence`)

> This is the part that matters most. You can audit the claim. If the evidence
> doesn't support the hypothesis, you can throw the hypothesis out instead of
> arguing with a model about how confident it's feeling.

## 1:15 — The dangerous request (show `04-staged-approval-card`)

> Now the interesting part. "Restart payment-service."
>
> The agent would happily restart it. It just did exactly that. But look at what
> happened instead: nothing ran. The change is staged, with the exact target and
> a 30-second expiry. And this box here is a one-time code — Alpha, Seven, Golf.
>
> I have to say that code out loud to authorize it. Not "yes." Not "confirm."
> The code.
>
> And here's why that matters. The biggest objection engineers raise about AI ops
> agents isn't that they're wrong — it's that they'll ask you for permission and
> then answer their own question when the guardrails are stressed. So the code is
> generated per action, shown only here on the card, and it's never sent back to
> the model that requested the change. The agent physically cannot approve itself.

## 1:55 — The veto (show `05-cancelled`)

> And I can still say no. One word, and it's gone.

## 2:05 — Approval and execution (show `06-approved-and-applied`)

> So: confirm the code, and now — and only now — does it execute.

## 2:20 — The payoff (show `07-recovery-partial`)

> Payment-service is green. Here's the part most demos would stop at, and stop
> at, because the service came back and it looks like you won.
>
> It didn't. Order-db is still critical. IncidentVoice checks the whole blast
> radius, not just the thing you happened to fix. A restart is not a recovery.

## 2:40 — Handoff and review (show `08-incident-review`)

> The evidence exports as a structured handoff, and the incident review is
> drafted from the same evidence — with its source labeled, including when the
> provider fails and it falls back locally.

## 2:55 — The honest close

> Two things I want to be straight about. This demo runs against a clearly
> marked simulation, and the interface never blurs that line. And this is one
> team of engineers — the next step is a measured pilot against real
> on-call teams, comparing time-to-cited-diagnosis against their normal
> workflow.
>
> The pitch in one line: a restart is not a recovery, and an assistant that
> can't show its work isn't worth trusting at 3 a.m.
>
> It's built on AssemblyAI. Thank you.

## Do not say

- Any latency number. The only honest figures we have are 568 ms to turn
  complete on AssemblyAI's own benchmarks and our own offline per-stage numbers
  — do not merge them into a single "sub-second" claim.
- Any word-accuracy or WER figure. We have none for this app.
- "Autonomous." Nothing destructive runs without the code.
- That the pilot is done. It is not.
