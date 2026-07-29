#!/usr/bin/env python3
"""
Launch the dev server in its own session so nothing upstream can reap it.

A plain `nohup ... &` still leaves the server in the launching shell's process
group, so whatever tears that group down takes the server with it, mid-run,
which reads exactly like a flaky app. `os.setsid()` after a double fork puts the
server in a fresh session with no controlling terminal, so it outlives the
launcher and has to be killed deliberately by pid.

Usage: python3 spawn-dev.py <cwd> <port> <logfile> <pidfile> [supervisor.sh]

With a supervisor script the launched process is the supervisor loop, which
restarts the server after an external kill; without one it is the server itself.
"""
import os
import sys

cwd, port, logfile, pidfile = sys.argv[1:5]
supervisor = sys.argv[5] if len(sys.argv) > 5 else None

if os.fork() > 0:
    sys.exit(0)
os.setsid()
if os.fork() > 0:
    os._exit(0)

os.chdir(cwd)
fd = os.open(logfile, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
os.dup2(fd, 1)
os.dup2(fd, 2)
os.close(0)
with open(pidfile, "w") as f:
    f.write(str(os.getpid()))
if supervisor:
    os.execvp("bash", ["bash", supervisor, cwd, port, logfile])
else:
    os.execvp("pnpm", ["pnpm", "exec", "next", "dev", "--turbopack", "--port", port])
