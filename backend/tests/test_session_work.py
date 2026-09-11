"""Disconnects must not let another command overtake approved infrastructure work."""
import asyncio
import threading
import pytest
from app.core.async_work import session_work
from app.core.session import current_session


@pytest.mark.asyncio
@pytest.mark.parametrize('fails', [False, True])
async def test_cancelled_request_holds_lock_until_worker_finishes(operator_session, fails):
    started, release = threading.Event(), threading.Event()
    events = []

    def mutation():
        assert current_session.get() is operator_session
        started.set()
        assert release.wait(3), 'Test must release worker'
        events.append('mutation finished')
        if fails:
            raise RuntimeError('adapter failed')

    async def request():
        async with operator_session.lock:
            await session_work(mutation)

    task = asyncio.create_task(request())
    try:
        while not started.is_set():
            await asyncio.sleep(.001)
        task.cancel()
        await asyncio.sleep(.01)
        task.cancel()  # Provider shutdown may cancel an already-cancelled request.
        await asyncio.sleep(.01)
        assert operator_session.lock.locked()
        assert not task.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert events == ['mutation finished']
        assert not operator_session.lock.locked()
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
async def test_worker_returns_result_and_propagates_adapter_errors():
    assert await session_work(lambda: {'success': True}) == {'success': True}
    with pytest.raises(ValueError, match='invalid target'):
        await session_work(lambda: (_ for _ in ()).throw(ValueError('invalid target')))
