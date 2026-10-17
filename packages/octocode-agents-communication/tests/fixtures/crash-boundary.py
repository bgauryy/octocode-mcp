"""Freeze real production execution at an OS/process boundary; replace no protocol code."""
import json
import linecache
import os
import signal
import socket
import sys
import time
from pathlib import Path


def saved(path, value):
    temporary = f'{path}.{os.getpid()}.tmp'
    with open(temporary, 'w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


mode, marker, *arguments = sys.argv[1:]
if mode == 'server':
    endpoint, log = arguments
    try:
        os.unlink(endpoint)
    except FileNotFoundError:
        pass
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(endpoint)
    listener.listen(8)
    saved(marker, dict(pid=os.getpid(), listening=True))
    while True:
        client, _ = listener.accept()
        data = bytearray()
        with client:
            while True:
                chunk = client.recv(65536)
                if not chunk:
                    break
                data.extend(chunk)
            frames = [json.loads(line) for line in data.decode().splitlines() if line]
            with open(log, 'a', encoding='utf-8') as stream:
                for frame in frames:
                    stream.write(json.dumps(dict(pid=os.getpid(), at=time.time_ns() // 1000000, frame=frame)) + '\n')
                stream.flush()
                os.fsync(stream.fileno())
    raise AssertionError('unreachable')

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from communication import cli, database, dispatch, transport

if mode == 'recovery-owner':
    from communication.store import Store
    path, workspace, identity = arguments
    store = Store(path, workspace, create=False)
    try:
        with dispatch.claim_delivery_owner(path, identity):
            store.attach(identity, {'transport': 'raw'})
            store.call(identity, 'heartbeat', {'vendorSession': 'new-managed-session'})
            saved(marker, dict(pid=os.getpid(), recovered=True))
    except Exception as error:
        saved(marker, dict(pid=os.getpid(), error=str(error)))
        raise
    finally:
        store.db.close()
    sys.exit(0)

frozen = False


def freeze(frame, event, details=None):
    global frozen
    frozen = True
    saved(marker, dict(pid=os.getpid(), boundary=mode, event=event,
                       source=frame.f_code.co_filename, function=frame.f_code.co_name,
                       line=frame.f_lineno, at=time.time_ns() // 1000000, **(details or {})))
    os.kill(os.getpid(), signal.SIGSTOP)


def trace(frame, event, _argument):
    if frozen:
        return trace
    if frame.f_code is transport.NativeDelivery.offer.__code__:
        if mode == 'before-submit' and event == 'call':
            freeze(frame, event)
        if mode == 'uncertain-submit' and event == 'return':
            freeze(frame, event)
    if mode == 'after-submit-before-ack' and event == 'return' and frame.f_code is dispatch.DeliveryMixin.finish_dispatch.__code__ and frame.f_locals.get('error') is None:
        freeze(frame, event)
    if mode == 'during-complete' and event == 'line' and frame.f_code is database.transaction.__wrapped__.__code__ and linecache.getline(frame.f_code.co_filename, frame.f_lineno).strip() == "db.execute('COMMIT')":
        db = frame.f_locals['db']
        replies = db.execute("SELECT id,replyTo FROM messages WHERE key LIKE 'complete:%'").fetchall()
        if replies:
            acknowledged = db.execute('SELECT count(*) FROM deliveries WHERE acknowledgedAt IS NOT NULL').fetchone()[0]
            freeze(frame, event, dict(inTransaction=db.in_transaction, uncommittedReplies=replies, uncommittedAcknowledged=acknowledged))
    return trace


sys.settrace(trace)
cli.main() if not arguments else cli.run(arguments)
raise AssertionError('The requested real crash boundary was not reached')
