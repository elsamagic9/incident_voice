import asyncio
import os
import sys
import time
from typing import List, Dict, Any

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.core.session import OperatorSession, current_session, sessions
from app.core.auth_rbac import operator_registry, SRERole, security_manager
from app.services.orchestrator import AgentOrchestrator
from scripts.stress_test_500 import expand_to_500

async def process_prompt(sem, idx, item, total):
    async with sem:
        prompt = item["text"]
        category = item.get("category", "general")
        expected_tool = item.get("expect_tool")
        expect_staged = item.get("expect_staged", False)

        orchestrator = AgentOrchestrator()
        
        t0 = time.perf_counter()
        error_reason = None
        spoken, tools = None, []
        duration_ms = 0
        try:
            spoken, tools, postmortem = await asyncio.wait_for(
                orchestrator.process_user_turn(prompt),
                timeout=30.0
            )
            duration_ms = (time.perf_counter() - t0) * 1000
            tool_names = [t.get("tool_name") for t in (tools or [])]

            if not spoken or not isinstance(spoken, str) or not spoken.strip():
                error_reason = "Empty or non-string spoken response returned."
            elif expected_tool and not (expected_tool in tool_names if isinstance(expected_tool, str) else any(t in tool_names for t in expected_tool)):
                error_reason = f"Expected tool '{expected_tool}' was not invoked. Got tools: {tool_names}"
            elif expect_staged and not orchestrator.awaiting_confirmation:
                error_reason = f"Action was expected to be staged for approval, but awaiting_confirmation is False."
                
        except Exception as exc:
            duration_ms = (time.perf_counter() - t0) * 1000
            error_reason = f"Exception: {type(exc).__name__}: {str(exc)}"
            tool_names = []
            
        if error_reason:
            print(f"❌ [Prompt {idx:03d}/{total}] FAILED: '{prompt}' ({duration_ms:.1f}ms) - {error_reason}")
            return False, error_reason
        else:
            tool_summary = f"[{', '.join(tool_names)}]" if tool_names else "[conversational]"
            print(f"✅ [Prompt {idx:03d}/{total}] PASS: '{prompt[:45]}' -> {tool_summary} ({duration_ms:.1f}ms)")
            return True, None

async def main():
    session = OperatorSession()
    session.operator_id = 'op-demo'
    session.operator = 'Demo Operator'
    session.role = SRERole.SRE_COMMANDER.value
    session.authenticated = True
    sessions[session.id] = session
    current_session.set(session)
    security_manager.current_role = SRERole.SRE_COMMANDER
    security_manager.operator_id = 'op-demo'
    security_manager.session_operator = 'Demo Operator'
    security_manager._session = session
    operator_registry.session_is_valid = lambda s: True

    catalog = expand_to_500()
    total = len(catalog)
    
    print(f"================================================================")
    print(f"  STARTING CONCURRENT 500-PROMPT STRESS TEST (Poolside API)     ")
    print(f"================================================================")

    start_time = time.time()
    
    # 20 concurrent requests max
    sem = asyncio.Semaphore(20)
    
    tasks = []
    for idx, item in enumerate(catalog, start=1):
        tasks.append(process_prompt(sem, idx, item, total))
        
    results = await asyncio.gather(*tasks)
    
    passed = sum(1 for r in results if r[0])
    failed = total - passed
    total_elapsed = time.time() - start_time
    
    print(f"\n================================================================")
    print(f"  CONCURRENT STRESS TEST COMPLETED in {total_elapsed:.2f}s        ")
    print(f"  Total: {total} | Passed: {passed} | Failed: {failed}          ")
    print(f"================================================================")
    
    if failed > 0:
        sys.exit(1)
        
if __name__ == "__main__":
    asyncio.run(main())
