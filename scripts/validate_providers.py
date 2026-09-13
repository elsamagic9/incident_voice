"""Live API checks with isolated simulated data. Uses provider quota; never changes infrastructure."""
import asyncio, json, secrets, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.core.config import settings
from app.core.session import OperatorSession, current_session
from app.core.auth_rbac import operator_registry, SRERole
from app.core.state import cluster_state
from app.services.assemblyai_stream import AssemblyAIStreamSession
from app.services.assemblyai_voice_agent import AssemblyAIVoiceAgentSession
from app.services.lemur_service import lemur_service
from app.services.investigation import investigation_service
from app.services.orchestrator import agent_orchestrator

async def main():
    if not settings.assemblyai_api_key:
        raise SystemExit('Configure ASSEMBLYAI_API_KEY before running provider checks.')
    settings.infrastructure_mode = 'simulation'
    op = operator_registry.get_operator('validator-commander')
    if not op or operator_registry.is_revoked('validator-commander'):
        raw_tok = secrets.token_hex(24)
        op = operator_registry.register_operator('validator-commander', 'Validator Commander', SRERole.SRE_COMMANDER, raw_tok)
    sess = OperatorSession(operator_id=op.operator_id, operator=op.name, role=op.role.value, authenticated=True, token_hash=op.token_hash)
    token = current_session.set(sess)
    errors = []
    async def error(message): errors.append(message)
    async def turn(*args): pass
    stt = AssemblyAIStreamSession(settings.assemblyai_api_key, turn, error)
    managed = None
    try:
        ready = await stt.connect()
        print(json.dumps({'streaming_handshake': ready, 'errors': errors}), flush=True)
        assert ready, 'AssemblyAI Streaming connection failed'
        if ready: await stt.send_audio(bytes(2048))
        await stt.close()
        errors.clear()
        evidence = {'audio_chunks': 0, 'tool_names': [], 'final_transcripts': 0}
        completed = asyncio.Event()
        async def audio(data):
            evidence['audio_chunks'] += 1

        async def agent(text, final):
            if final:
                agent_orchestrator.record_turn('agent', text)
                evidence['final_transcripts'] += 1
                if 'get_cluster_health' in evidence['tool_names'] and any(word in text.lower() for word in ('critical', 'healthy', 'degraded')):
                    completed.set()
        async def tool(event): evidence['tool_names'].append(event['tool_name'])
        managed = AssemblyAIVoiceAgentSession(settings.assemblyai_api_key, on_user_turn=turn,
            on_agent_turn=agent, on_audio_chunk=audio, on_tool_executed=tool, on_error=error)
        ready = await managed.connect()
        if ready:
            command = 'Use get_cluster_health to check the simulated cluster, then summarize its current health briefly.'
            agent_orchestrator.record_turn('user', command)
            await managed.send_text_command(command)
            try: await asyncio.wait_for(completed.wait(), 60)
            except asyncio.TimeoutError: errors.append('Timed out waiting for tool-backed audio reply')
        print(json.dumps({'managed_handshake': ready, **evidence, 'errors': errors}), flush=True)
        assert ready and evidence['audio_chunks'] and completed.is_set(), 'Managed diagnostic and audio response failed'
        await managed.close()
        brief = await investigation_service.investigate()
        print(json.dumps({'brief_source': brief['analysis_source'], 'observations': len(brief['evidence']), 'hypotheses': len(brief['hypotheses']), 'warning': brief['warning']}), flush=True)
        assert brief['analysis_source'] == 'assemblyai_llm_gateway', 'Cited investigation did not succeed'
        report = await lemur_service.generate_postmortem(agent_orchestrator.history,
            cluster_state.incident.timeline_events, cluster_state.incident.id)
        print(json.dumps({'report_source': report['source'], 'warning': report.get('generation_warning')}), flush=True)
        assert report['source'] == 'assemblyai_llm_gateway', 'Provider report did not succeed'

        if settings.poolside_api_key:
            prev_llm = settings.llm_provider
            settings.llm_provider = 'poolside'
            spoken, tools, _ = await agent_orchestrator.process_user_turn('check cluster health')
            poolside_success = bool(tools) and agent_orchestrator.last_reasoning == 'poolside'
            print(json.dumps({'poolside_validation': poolside_success, 'reasoning': agent_orchestrator.last_reasoning, 'tools_count': len(tools)}), flush=True)
            assert poolside_success, 'Poolside LLM dynamic function calling failed'
            settings.llm_provider = prev_llm
    finally:
        await stt.close()
        if managed: await managed.close()
        with operator_registry._lock, operator_registry._db:
            operator_registry._db.execute("DELETE FROM operators WHERE operator_id='validator-commander'")
            operator_registry._db.execute("DELETE FROM revoked_tokens")
        current_session.reset(token)

asyncio.run(main())
