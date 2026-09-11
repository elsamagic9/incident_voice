# IncidentVoice — three-minute demonstration

**Story:** An action can succeed while an incident remains unresolved. IncidentVoice connects voice triage to inspectable evidence and recovery checks.

Use a clean simulation session with manual approval enabled and a working AssemblyAI key. The suggested timings below are a recording plan, not verified hackathon duration requirements.

## 0:00–0:20 · State the problem

Show the incident workspace and **Demo simulation** label.

> “During an outage, asking an AI to restart a service is the easy part. Knowing why to act, keeping control, and checking whether it helped are harder. IncidentVoice puts those steps in one voice workspace.”

## 0:20–1:05 · Investigate by voice

Start voice using the managed AssemblyAI engine. Say **“Investigate the incident.”**

Show the incident brief. Point out its provider source, captured observations, and unverified hypotheses. Click one evidence reference and read the actual log or health observation. Use the model's real output rather than a predetermined root-cause claim.

> “The explanation is attached to evidence we can inspect. A citation does not prove the diagnosis; these are hypotheses to verify.”

## 1:05–1:50 · Keep the operator in control

Say **“Restart payment-service.”** Show the exact target and 30-second expiry. Say **“Do not confirm.”** Show that no action executed.

Request the restart again, then approve it explicitly. Explain that the infrastructure change in this demo is simulated.

## 1:50–2:25 · Show the distinguishing moment

The target recovery card compares its status, error rate, and latency before and after the action. Say **“Verify recovery.”**

> “Payment-service improved, but the database and other services still need attention. IncidentVoice does not mistake a successful restart for a resolved incident.”

Point out that the old brief is marked stale. A refreshed investigation should be based on the new observations.

## 2:25–2:50 · Hand off the evidence

Export the handoff JSON or generate an incident review. Show the actual source, recorded actions, and draft follow-up work. If provider generation falls back locally, state that clearly.

> “The next engineer receives the evidence, the working hypotheses, and the recovery checks—not just a chat transcript.”

## 2:50–3:00 · Close with scope

> “This is a prototype for on-call engineers. Next we want to evaluate investigation time and recovery-verification accuracy with real operators.”

Show verified repository and deployment links. No measured business savings, WER, or MTTR improvements are claimed by this script. Check the final submission form for its current media requirements.
