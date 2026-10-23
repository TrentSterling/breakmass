"""Run one hosted case in a new session and retire only its owned descendants."""
import ctypes
import json
import os
from pathlib import Path
import select
import signal
import socket
import subprocess
import sys
import time

RUN_SECONDS = 15 * 60
TERM_GRACE_SECONDS = 10
KILL_VERIFY_SECONDS = 5


def proc_stat(pid):
    text = Path(f"/proc/{pid}/stat").read_text()
    fields = text[text.rfind(")") + 2:].split()
    return {"pid": pid, "state": fields[0], "ppid": int(fields[1]),
            "group": int(fields[2]), "session": int(fields[3]), "start": int(fields[19])}


def children(pid):
    result = set()
    try:
        threads = list(Path(f"/proc/{pid}/task").iterdir())
    except FileNotFoundError:
        return result
    for thread in threads:
        try:
            result.update(map(int, (thread / "children").read_text().split()))
        except FileNotFoundError:
            pass
    return result


def owned(supervisor):
    """Subreaper adoption retains ownership even if a descendant changes session."""
    result, pending = {}, [(pid, supervisor) for pid in children(supervisor)]
    while pending:
        pid, parent = pending.pop()
        if pid == supervisor or pid in result:
            continue
        try:
            process = proc_stat(pid)
            if process["ppid"] != parent:
                continue
            result[pid] = process
            pending.extend((child, pid) for child in children(pid))
        except FileNotFoundError:
            pass
    return result


def signal_owned(supervisor, process, sig):
    """Pin the process identity before rechecking ownership; never signal by name."""
    fd = None
    try:
        fd = os.pidfd_open(process["pid"])
        current = owned(supervisor).get(process["pid"])
        if current and current["start"] == process["start"]:
            signal.pidfd_send_signal(fd, sig)
            return True
    except ProcessLookupError:
        pass
    finally:
        if fd is not None:
            os.close(fd)
    return False


def cleanup(supervisor):
    sent = []
    for sig, budget in ((signal.SIGTERM, TERM_GRACE_SECONDS), (signal.SIGKILL, KILL_VERIFY_SECONDS)):
        deadline, empty, signalled = time.monotonic() + budget, 0, set()
        while True:
            live = [p for p in owned(supervisor).values() if p["state"] not in ("Z", "X")]
            empty = empty + 1 if not live else 0
            if empty >= 2:
                return {"terminated": True, "signals": sent}
            for process in live:
                identity = (process["pid"], process["start"])
                if identity not in signalled and signal_owned(supervisor, process, sig):
                    signalled.add(identity)
                    sent.append({**process, "signal": int(sig)})
            if time.monotonic() >= deadline:
                break
            time.sleep(.1)
    return {"terminated": False, "signals": sent, "remaining": list(owned(supervisor).values())}


def supervise(command):
    if sys.platform != "linux" or os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted":
        raise RuntimeError("Hosted Linux execution only; no local browser run is permitted")
    # This affects only this short-lived supervisor, not system security policy.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise OSError(ctypes.get_errno(), "Cannot retain orphaned descendants")
    port = int(os.environ["PORT"])
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", port))  # Refuse an occupied CDP port before launch.
    supervisor, child, fd = os.getpid(), None, None
    receipt = {"verified": False, "port": port, "timed_out": False, "process_exit": None}
    try:
        child = subprocess.Popen(command, start_new_session=True)
        receipt["leader"] = child.pid
        fd = os.pidfd_open(child.pid)
        leader = proc_stat(child.pid)
        if leader["ppid"] != supervisor or leader["session"] != child.pid or leader["group"] != child.pid:
            raise RuntimeError("Runner did not enter its owned session")
        receipt["leader_identity"] = leader
        # pidfd readiness observes exit without reaping the leader prematurely.
        receipt["timed_out"] = not bool(select.select([fd], [], [], RUN_SECONDS)[0])
    except (Exception, KeyboardInterrupt) as error:
        receipt["error"] = str(error)
    finally:
        if fd is not None:
            os.close(fd)
        try:
            receipt["cleanup"] = cleanup(supervisor)
            if receipt["cleanup"]["terminated"]:
                if child is not None:
                    receipt["process_exit"] = child.wait(timeout=1)
                while True:
                    try:
                        if os.waitpid(-1, os.WNOHANG)[0] == 0:
                            break
                    except ChildProcessError:
                        break
                receipt["remaining"] = list(owned(supervisor).values())
                receipt["verified"] = not receipt["remaining"]
        except Exception as error:
            receipt["cleanup_error"] = str(error)
    return receipt


def main():
    destination, command = Path(sys.argv[1]), sys.argv[2:]
    try:
        receipt = supervise(command)
    except Exception as error:
        receipt = {"verified": False, "error": str(error)}
    destination.write_text(json.dumps(receipt, indent=2) + "\n")
    if not receipt["verified"] or receipt.get("error"):
        return 125
    if receipt.get("timed_out"):
        return 124
    code = receipt["process_exit"]
    return code if code >= 0 else 128 - code


if __name__ == "__main__":
    raise SystemExit(main())
