import { useEffect, useState } from 'react';
import { Check, ShieldAlert, Timer, X, Mic } from 'lucide-react';
import type { StagedRemediation } from '../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  action: StagedRemediation;
  disabled: boolean;
  onApprove: () => void;
  onCancel: () => void;
}

export function ApprovalCard({ action, disabled, onApprove, onCancel }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [action.id]);

  const seconds = action.expires_at ? Math.max(0, Math.ceil(action.expires_at - now / 1000)) : null;
  const expired = seconds === 0;

  return (
    <Card
      className="approval-card border-amber-500/50 bg-amber-950/20 shadow-[0_0_25px_rgba(245,158,11,0.15)] flex-row items-center p-5 gap-5"
      aria-labelledby="approval-title"
    >
      <div className="approval-icon flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 shrink-0">
        <ShieldAlert size={28} className="text-amber-400 animate-pulse" />
      </div>

      <div className="approval-copy flex-1 min-w-0">
        <div className="flex gap-2.5 items-center flex-wrap">
          <Badge variant="warning" className="uppercase tracking-wider text-[10px]">
            Approval Required
          </Badge>
          {seconds !== null && (
            <Badge
              variant={expired ? "destructive" : "secondary"}
              className="gap-1 font-mono text-[11px]"
            >
              <Timer size={12} className={expired ? 'text-rose-400' : 'text-amber-400 animate-spin'} />
              <span>{expired ? 'Approval expired' : `${seconds}s remaining`}</span>
            </Badge>
          )}
        </div>

        <h2 id="approval-title" className="text-base font-semibold text-slate-100 mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-amber-300 font-mono uppercase font-bold">{action.action.replaceAll('_', ' ')}</span>
          <span className="text-slate-400 font-normal">on</span>
          <span className="font-mono text-cyan-300 font-semibold">{action.service_name}</span>
          {action.params?.count != null && (
            <span className="text-slate-400 text-xs font-normal"> → {action.params.count} replicas</span>
          )}
        </h2>

        <p className="text-zinc-400 text-xs mt-0.5">
          {action.simulated
            ? 'This changes demo data only. Say “confirm” or approve below.'
            : 'This will change the configured infrastructure. Say “confirm” or approve below.'}
        </p>

        {action.challenge_code && (
          <div className="challenge-code flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Mic size={13} className="text-cyan-400" />
              Speak voice phrase:
            </span>
            <code className="text-xs font-mono font-bold text-cyan-300 bg-zinc-950 px-2.5 py-0.5 rounded border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
              “Confirm {action.challenge_code}”
            </code>
            <span className="text-zinc-500 text-xs">or click below</span>
          </div>
        )}
      </div>

      <div className="approval-actions flex items-center gap-2.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="button button-secondary text-slate-300 hover:text-white border-zinc-700 bg-zinc-900/80 gap-1.5"
          onClick={onCancel}
          disabled={disabled}
        >
          <X size={14} />
          <span>Cancel</span>
        </Button>

        <Button
          variant="cyan"
          size="sm"
          className="button button-primary gap-1.5 font-semibold"
          onClick={onApprove}
          disabled={disabled || expired}
        >
          <Check size={15} strokeWidth={2.5} />
          <span>Approve action</span>
        </Button>
      </div>
    </Card>
  );
}
