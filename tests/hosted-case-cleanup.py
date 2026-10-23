"""CPU-only Linux process-lifecycle simulations; no processes or browsers launched."""
import importlib.util
import os
from pathlib import Path
import signal
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("hosted_case", Path(__file__).parents[1] / "tools/run-hosted-case.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def process(pid, parent, state="S", session=10):
    return {"pid": pid, "ppid": parent, "state": state, "group": session, "session": session, "start": pid * 100}


class Model:
    def __init__(self, root_exit=True, stubborn=False, refuse_kill=False):
        self.table = {10: process(10, 1), 11: process(11, 10), 99: process(99, 77, session=99)}
        self.clock, self.sent, self.fds = 0, [], {}
        self.root_exit, self.stubborn, self.refuse_kill = root_exit, stubborn, refuse_kill
        self.child = SimpleNamespace(pid=10, wait=Mock(side_effect=self.wait))

    def children(self, pid):
        return {p["pid"] for p in self.table.values() if p["ppid"] == pid}

    def stat(self, pid):
        if pid not in self.table:
            raise FileNotFoundError()
        return self.table[pid].copy()

    def fd_open(self, pid):
        self.stat(pid)
        fd = len(self.fds) + 100
        self.fds[fd] = pid
        return fd

    def ready(self, *_):
        if self.root_exit:
            self.table[10]["state"] = "Z"
            self.table[11]["ppid"] = 1  # Subreaper adopts the surviving browser.
            self.table[11]["session"] = 11  # A descendant-created session stays owned.
            return ([100], [], [])
        return ([], [], [])

    def send(self, fd, sig):
        pid = self.fds[fd]
        self.sent.append((pid, sig))
        if pid == 11 and (self.refuse_kill or self.stubborn and sig == signal.SIGTERM):
            return
        self.table[pid]["state"] = "Z"
        for p in self.table.values():
            if p["ppid"] == pid:
                p["ppid"] = 1

    def sleep(self, seconds):
        self.clock += seconds

    def wait(self, **_):
        self.table.pop(10, None)
        return 1 if self.root_exit else -15

    def reap(self, *_):
        for pid, p in list(self.table.items()):
            if p["ppid"] == 1 and p["state"] == "Z":
                del self.table[pid]
                return pid, 0
        raise ChildProcessError()

    def run(self, case):
        self.case = case
        with patch.object(runner.sys, "platform", "linux"), patch.dict(os.environ, {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "PORT": "9333"}), \
             patch.object(runner.ctypes, "CDLL", return_value=SimpleNamespace(prctl=Mock(return_value=0))), \
             patch.object(runner.socket, "socket"), patch.object(runner.os, "getpid", return_value=1), \
             patch.object(runner.subprocess, "Popen", return_value=self.child) as launch, \
             patch.object(runner, "children", side_effect=self.children), patch.object(runner, "proc_stat", side_effect=self.stat), \
             patch.object(runner.os, "pidfd_open", side_effect=self.fd_open, create=True), patch.object(runner.os, "close"), \
             patch.object(runner.signal, "pidfd_send_signal", side_effect=self.send, create=True), patch.object(runner.signal, "SIGKILL", 9, create=True), \
             patch.object(runner.select, "select", side_effect=self.ready), patch.object(runner.time, "monotonic", side_effect=lambda: self.clock), \
             patch.object(runner.time, "sleep", side_effect=self.sleep), patch.object(runner.os, "waitpid", side_effect=self.reap, create=True), patch.object(runner.os, "WNOHANG", 1, create=True):
            result = runner.supervise(["node", "diagnostic-driver", "--qa"])
            launch.assert_called_once_with(["node", "diagnostic-driver", "--qa"], start_new_session=True)
        case.assertTrue(all(pid != 99 for pid, _ in self.sent), "Unrelated process must never be signalled")
        case.assertEqual(self.table[99]["state"], "S")
        case.assertLessEqual(self.clock, 15.5)
        return result


class CleanupTests(unittest.TestCase):
    def test_execution_and_term_grace_deadlines_are_preserved(self):
        self.assertEqual(runner.RUN_SECONDS, 900)
        self.assertEqual(runner.TERM_GRACE_SECONDS, 10)

    def test_early_runner_exit_retires_surviving_child_in_other_session(self):
        m = Model()
        r = m.run(self)
        self.assertTrue(r["verified"])
        self.assertEqual(r["remaining"], [])
        self.assertEqual(r["process_exit"], 1)
        self.assertIn((11, signal.SIGTERM), m.sent)

    def test_term_resistant_child_requires_kill(self):
        m = Model(stubborn=True)
        self.assertTrue(m.run(self)["verified"])
        self.assertIn((11, 9), m.sent)

    def test_unverified_survivor_fails_closed(self):
        m = Model(refuse_kill=True)
        self.assertFalse(m.run(self)["verified"])
        m.child.wait.assert_not_called()

    def test_timeout_retires_leader_and_child(self):
        m = Model(root_exit=False, stubborn=True)
        r = m.run(self)
        self.assertTrue(r["timed_out"])
        self.assertTrue(r["verified"])
        self.assertIn((10, signal.SIGTERM), m.sent)

    def test_reused_pid_is_not_signalled(self):
        original = process(11, 1)
        with patch.object(runner.os, "pidfd_open", return_value=100, create=True), patch.object(runner.os, "close"), \
             patch.object(runner, "owned", return_value={11: {**original, "start": 9999}}), \
             patch.object(runner.signal, "pidfd_send_signal", create=True) as send:
            self.assertFalse(runner.signal_owned(1, original, signal.SIGTERM))
            send.assert_not_called()

    def test_no_longer_owned_pid_is_not_signalled(self):
        with patch.object(runner.os, "pidfd_open", return_value=100, create=True), patch.object(runner.os, "close"), \
             patch.object(runner, "owned", return_value={}), patch.object(runner.signal, "pidfd_send_signal", create=True) as send:
            self.assertFalse(runner.signal_owned(1, process(11, 1), signal.SIGTERM))
            send.assert_not_called()

    def test_stale_parent_link_is_excluded(self):
        with patch.object(runner, "children", return_value={11}), patch.object(runner, "proc_stat", return_value=process(11, 77)):
            self.assertEqual(runner.owned(1), {})

    def test_local_execution_rejected_before_any_launch(self):
        for platform, actions, environment in [("win32", "true", "github-hosted"), ("linux", "false", "github-hosted"), ("linux", "true", "self-hosted")]:
            with self.subTest(platform=platform, actions=actions, environment=environment), patch.object(runner.sys, "platform", platform), \
                 patch.dict(os.environ, {"GITHUB_ACTIONS": actions, "RUNNER_ENVIRONMENT": environment}), patch.object(runner.subprocess, "Popen") as launch:
                with self.assertRaisesRegex(RuntimeError, "Hosted Linux"):
                    runner.supervise(["node"])
                launch.assert_not_called()

    def test_main_preserves_failure_and_cleanup_exit_verdicts(self):
        cases = [({"verified": True, "process_exit": 0}, 0),
                 ({"verified": True, "process_exit": 1}, 1),
                 ({"verified": True, "process_exit": -15}, 143),
                 ({"verified": True, "process_exit": -9, "timed_out": True}, 124),
                 ({"verified": False, "process_exit": 0}, 125)]
        for receipt, expected in cases:
            with self.subTest(expected=expected), patch.object(runner.sys, "argv", ["wrapper", "cleanup.json", "node"]), \
                 patch.object(runner, "supervise", return_value=receipt), patch.object(runner, "Path") as target:
                self.assertEqual(runner.main(), expected)
                target.return_value.write_text.assert_called_once()


if __name__ == "__main__":
    unittest.main()
