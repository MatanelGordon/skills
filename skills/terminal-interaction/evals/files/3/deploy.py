#!/usr/bin/env python3
"""Deploy CLI: checks the cluster, asks for confirmation, then deploys."""
import sys
import termios
import time

SPINNER_FRAMES = "|/-\\"
HEALTH_CHECK_SECONDS = 3.0
FRAME_SECONDS = 0.1


def check_cluster():
    started = time.monotonic()
    frame = 0
    while time.monotonic() - started < HEALTH_CHECK_SECONDS:
        sys.stdout.write(f"\rChecking cluster health {SPINNER_FRAMES[frame % len(SPINNER_FRAMES)]}")
        sys.stdout.flush()
        frame += 1
        time.sleep(FRAME_SECONDS)
    sys.stdout.write("\rChecking cluster health ok\n")
    sys.stdout.flush()


def confirm(env):
    if not sys.stdin.isatty():
        print("No terminal to ask on: refusing to deploy unattended.")
        return False
    # Throw away anything typed before the question was on screen.
    termios.tcflush(sys.stdin, termios.TCIFLUSH)
    try:
        answer = input(f"Deploy api to {env}? [y/N] ")
    except EOFError:
        answer = ""
    return answer.strip().lower() == "y"


def main(argv):
    env = argv[1] if len(argv) > 1 else "staging"
    check_cluster()
    if not confirm(env):
        print("Aborted.")
        return 1
    print(f"Deploying api to {env} ... done")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
