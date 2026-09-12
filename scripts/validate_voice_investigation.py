"""Live managed investigation, approval, and recovery check. Uses quota; simulation only."""
import asyncio
import argparse
import json
import secrets
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.core.config import settings
from app.core.session import OperatorSession, current_session
from app.core.auth_rbac import operator_registry, SRERole
from app.core.async_work import session_work
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
from app.services.orchestrator import agent_orchestrator


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-local-evidence', action='store_true', help='Continue approval/recovery checks when Gateway is unavailable; report the actual analysis source.')
    args = parser.parse_args()
    if not settings.assemblyai_api_key:
        raise SystemExit('Configure ASSEMBLYAI_API_KEY first.')
    settings.infrastructure_mode = 'simulation'
    op = operator_registry.get_operator('validator-commander')
    if not op or operator_registry.is_revoked('validator-commander'):
        raw_tok = secrets.token_hex(24)
        op = operator_registry.register_operator('validator-commander', 'Validator Commander', SRERole.SRE_COMMANDER, raw_tok)
    sess = OperatorSession(operator_id=op.operator_id, operator=op.name, role=op.role.value, authenticated=True, token_hash=op.token_hash)
    token = current_session.set(sess)
    received = {'audio_chunks': 0, 'observations': 0, 'hypotheses': 0, 'source': None, 'errors': []}
    finished = asyncio.Event()
    staged = asyncio.Event()
    verified = asyncio.Event()

    async def audio(_):
        received['audio_chunks'] += 1

    async def tool(event):
        received.setdefault('tools', []).append(event['tool_name'])
        if event['tool_name'] == 'investigate_incident':
            result = event['result']
            received.update(observations=len(result.get('evidence', [])),
                            hypotheses=len(result.get('hypotheses', [])), source=result.get('analysis_source'), warning=result.get('warning'))
        elif event['tool_name'] == 'execute_remediation' and event['result'].get('status') == 'staged':
            staged.set()
        elif event['tool_name'] == 'verify_recovery':
            received['remaining_services'] = event['result'].get('remaining_services')
            received['recovery_verified'] = event['result'].get('recovery_verified')
            verified.set()

    async def agent(text, final):
        if not final:
            received['latest_transcript_delta'] = text[-1200:]
        if final:
            received.setdefault('final_transcripts', []).append(text)
        if final and received['observations'] and text.strip():
            finished.set()

    async def error(message):
        received['errors'].append(message)

    voice = AssemblyAIVoiceAgentSession(settings.assemblyai_api_key, on_audio_chunk=audio,
                                        on_tool_executed=tool, on_agent_turn=agent, on_error=error)
    try:
        assert await voice.connect(), 'Managed voice did not become ready'
        await voice.send_text_command('Use investigate_incident to investigate this simulated incident. Then state the leading hypothesis briefly and say that it needs verification.')
        await asyncio.wait_for(finished.wait(), 60)
        assert args.allow_local_evidence or received['source'] == 'assemblyai_llm_gateway', 'AI analysis fell back to local observations'
        print(json.dumps({'investigation_source': received['source'], 'observations': received['observations'], 'warning': received.get('warning')}), flush=True)
        assert received['audio_chunks'] > 0 and received['hypotheses'] > 0
        await voice.send_text_command('Stage a restart of payment-service. Do not execute it yet.')
        await asyncio.wait_for(staged.wait(), 45)
        action = agent_orchestrator.staged_action
        assert action and action['service_name'] == 'payment-service' and action['action'] == 'restart_pod'
        # Simulates the application's explicit approval button, bound to the staged ID.
        async with current_session.get().lock:
            spoken, events = await session_work(agent_orchestrator.confirm_staged_remediation, action['id'])
        received['target_outcome'] = events[0]['result']['verification']['outcome']
        await voice.reply_done.wait()
        await voice.notify_approval(spoken)
        await voice.send_text_command('Use verify_recovery to check the whole cluster. Is the entire incident resolved?')
        await asyncio.wait_for(verified.wait(), 45)
        assert received['target_outcome'] == 'healthy'
        assert received['recovery_verified'] is False and 'order-db' in received['remaining_services']
        assert not received['errors']
        print(json.dumps(received))
    except Exception:
        received['pending_calls'] = [call.get('name') for call in voice.pending_calls]
        received['tool_task_done'] = voice._tool_task.done() if voice._tool_task else None
        print(json.dumps(received), flush=True)
        raise
    finally:
        await voice.close()
        current_session.reset(token)


if __name__ == '__main__':
    asyncio.run(main())
