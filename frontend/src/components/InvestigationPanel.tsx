import { useRef, useState } from 'react';
import { ArrowDown, ArrowRight, CheckCheck, Download, FlaskConical, ListChecks, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { InvestigationBrief, RecoveryCheck } from '../types';

interface Props {
  brief: InvestigationBrief | null;
  checks: RecoveryCheck[];
  disabled: boolean;
  onCommand: (command: string) => void;
}
const number = (value: number | null | undefined, unit: string) => value == null ? '—' : `${Number(value.toFixed(1))}${unit}`;

export function InvestigationPanel({ brief, checks, disabled, onCommand }: Props) {
  const evidenceLibrary = useRef<HTMLDetailsElement>(null);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const investigate = () => onCommand('Investigate the incident');
  const latest = checks[checks.length - 1];
  const exportHandoff = async () => {
    setExportError(''); setExporting(true);
    try {
      const response = await fetch('/api/incident/handoff', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not export the handoff. Reconnect and try again.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'incident-handoff.json';
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'Export failed.'); }
    finally { setExporting(false); }
  };
  const showEvidence = (id: string) => {
    if (evidenceLibrary.current) evidenceLibrary.current.open = true;
    const element = document.getElementById(`evidence-${id}`);
    element?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  };

  return <div className="investigation-brief">
    <div className="investigation-journey" aria-label="Investigation workflow">
      <span className={brief ? 'journey-done' : 'journey-current'}><Search size={14} />Investigate</span><ArrowRight size={12} />
      <span className={brief ? 'journey-current' : ''}><ListChecks size={14} />Review & approve</span><ArrowRight size={12} />
      <span className={latest ? 'journey-current' : ''}><CheckCheck size={14} />Verify</span>
    </div>

    {latest && <section className={`recovery-receipt receipt-${latest.outcome}`} aria-labelledby="recovery-title">
      <div className="brief-section-heading"><p className="eyebrow">AFTER THE ACTION</p><span className="source-pill">{latest.source}</span></div>
      <h3 id="recovery-title">{latest.outcome === 'healthy' ? 'The target is healthy.' : latest.outcome === 'failed' ? 'The action failed.' : latest.outcome === 'unverified' ? 'Recovery is not verified.' : 'The target still needs attention.'}</h3>
      <p className="muted">{latest.service} · {latest.action.replaceAll('_', ' ')}</p>
      <div className="receipt-comparison" aria-label="Before and after the action">
        <div><small>Status</small><span>{latest.before?.status ?? 'unknown'} <ArrowRight size={12} /> <strong>{latest.after?.status ?? 'unknown'}</strong></span></div>
        <div><small>Error rate</small><span>{number(latest.before?.error_rate_pct, '%')} <ArrowRight size={12} /><strong>{number(latest.after?.error_rate_pct, '%')}</strong></span></div>
        <div><small>P99 latency</small><span>{number(latest.before?.latency_p99_ms, ' ms')} <ArrowRight size={12} /><strong>{number(latest.after?.latency_p99_ms, ' ms')}</strong></span></div>
      </div>
      <p className="receipt-note">{latest.source === 'simulation' ? 'Simulated result. ' : ''}This check covers the target service; other services may still be affected.</p>
      <button className="text-button" disabled={disabled} onClick={() => onCommand('Verify recovery')}>Check the whole cluster <ArrowRight size={14} /></button>
    </section>}

    {!brief ? <div className="brief-empty">
      <div className="brief-orbit" aria-hidden="true"><Sparkles size={30} /></div>
      <p className="eyebrow">EVIDENCE BEFORE ACTION</p>
      <h3>Connect the symptoms.<br />Find the next move.</h3>
      <p>Gather service health and logs in one brief. Review hypotheses with linked observations, then choose what to investigate next.</p>
      <button className="button button-primary" disabled={disabled} onClick={investigate}><Sparkles size={16} />Build incident brief</button>
      <small>Read-only investigation · no infrastructure changes</small>
    </div> : <>
      {brief.verification && <section className={`cluster-verification ${brief.verification.recovery_verified ? 'verification-good' : ''}`} aria-label="Cluster recovery check"><CheckCheck size={19} /><div><h4>{brief.verification.stale ? 'The last recovery check is out of date' : brief.verification.recovery_verified ? 'All configured services passed' : 'Recovery is still in progress'}</h4><p>{brief.verification.message}</p>{brief.verification.stale && <button className="text-button" disabled={disabled} onClick={() => onCommand('Verify recovery')}>Check again</button>}</div></section>}
      <div className="brief-toolbar"><span className="source-pill">{brief.source === 'simulation' && <FlaskConical size={12} />}{brief.source} evidence</span><time>Captured {new Date(brief.captured_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><button className="text-button" disabled={disabled} onClick={investigate}><RefreshCw size={13} />Refresh</button></div>
      {brief.stale && <div className="brief-notice" role="status">Service state has changed since this brief. Refresh before relying on its hypotheses.</div>}
      <section className="brief-summary"><p className="eyebrow">{brief.analysis_source === 'assemblyai_llm_gateway' ? 'ASSEMBLYAI INVESTIGATION' : 'CAPTURED OBSERVATIONS'}</p><h3>What the evidence suggests</h3><p>{brief.summary}</p><span>{brief.evidence.length} observations · {Object.keys(brief.baseline).length} services</span></section>
      {brief.warning && <p className="brief-notice">{brief.warning}</p>}
      <div className="hypothesis-list">
        {brief.hypotheses.map((hypothesis, index) => <article className="hypothesis-card" key={`${hypothesis.service}-${index}`}>
          <div className="hypothesis-heading"><span className="hypothesis-number">0{index + 1}</span><div><small>HYPOTHESIS · UNVERIFIED</small><h4>{hypothesis.title}</h4></div></div>
          <p>{hypothesis.reason}</p>
          <div className="evidence-links"><span>Supporting observations</span>{hypothesis.evidence_ids.map(id => <button key={id} onClick={() => showEvidence(id)} aria-label={`View evidence ${id}`}>{id}<ArrowDown size={11} /></button>)}</div>
          <div className="next-check"><strong>Next check</strong><p>{hypothesis.next_check}</p><button className="text-button" disabled={disabled} onClick={() => onCommand(`Inspect logs for ${hypothesis.service}`)}>Inspect {hypothesis.service}<ArrowRight size={13} /></button></div>
        </article>)}
      </div>
      {!!brief.gaps.length && <details className="evidence-gaps"><summary>{brief.gaps.length} evidence gaps to resolve</summary><ul>{brief.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></details>}
      <details ref={evidenceLibrary} className="evidence-library"><summary className="brief-section-heading"><h3 id="evidence-heading">Evidence trail</h3><span className="small-count">{brief.evidence.length} observations · expand</span></summary><p className="muted">Captured source data. References point to this snapshot.</p>
        {brief.evidence.map(item => <article key={item.id} id={`evidence-${item.id}`} tabIndex={-1} className="evidence-observation"><div><span>{item.id}</span><strong>{item.service}</strong><small>{item.kind}</small></div><p>{item.detail}</p></article>)}
      </details>
      <div className="handoff-bar"><div><h4>Bring the next engineer up to speed.</h4><p>Export evidence, hypotheses, and recovery checks.</p></div><button className="button button-secondary" onClick={() => void exportHandoff()} disabled={exporting}><Download size={15} />{exporting ? 'Exporting…' : 'Export handoff'}</button></div>
      {exportError && <p role="alert" className="brief-notice">{exportError}</p>}
    </>}
  </div>;
}
