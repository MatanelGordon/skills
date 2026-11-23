#!/usr/bin/env python3
"""Project init wizard: asks for a project name, then an environment."""
import select
import sys

DEFAULT_NAME = "my-app"
DEFAULT_ENV = "dev"
ENVIRONMENTS = ("dev", "prod")
ANSWER_TIMEOUT_SECONDS = 20


def ask(prompt, default):
    sys.stdout.write(prompt)
    sys.stdout.flush()
    ready, _, _ = select.select([sys.stdin], [], [], ANSWER_TIMEOUT_SECONDS)
    line = sys.stdin.readline() if ready else ""
    if not line:
        raise SystemExit("\nwizard: no answer, giving up")
    return line.strip() or default


def ask_environment():
    env = ask("Environment [dev/prod]: ", DEFAULT_ENV)
    while env not in ENVIRONMENTS:
        env = ask("Please type dev or prod: ", DEFAULT_ENV)
    return env


def main():
    if sys.stdin.isatty():
        name = ask("Project name: ", DEFAULT_NAME)
        env = ask_environment()
    else:
        # Nobody to ask: take the defaults.
        name, env = DEFAULT_NAME, DEFAULT_ENV
    print(f"Created {name} ({env})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
