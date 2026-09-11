"""Keep a session serialized until its blocking operation actually finishes."""
import asyncio
import anyio


async def session_work(function, *args, **kwargs):
    # Cancelling to_thread only cancels the waiter, not the infrastructure call.
    # Drain the worker before propagating cancellation to the lock's owner.
    worker = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
    cancelled = False
    with anyio.CancelScope(shield=True):
        while True:
            try:
                result = await asyncio.shield(worker)
                break
            except asyncio.CancelledError:
                if worker.cancelled():
                    raise
                cancelled = True
            except Exception:
                if cancelled:
                    raise asyncio.CancelledError from None
                raise
    if cancelled:
        raise asyncio.CancelledError
    return result
