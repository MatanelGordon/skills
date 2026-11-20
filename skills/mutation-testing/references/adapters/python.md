# Python adapter — Mutmut

Official docs: <https://mutmut.readthedocs.io/en/latest/>.

## Compatibility and setup

Use Mutmut 3.8.1 under a project environment. It requires fork semantics; use
WSL on Windows.

```bash
python -m pip install 'mutmut==3.8.1'
mutmut --version
```

Mutmut 3 reads configuration only from `pyproject.toml` or `setup.cfg`. Any
temporary `source_paths`, `only_mutate`, or `do_not_mutate` edit stays in the
disposable worktree and never enters the test-only candidate.

## Scope, run, and headless proof

Exact changed-line selection is not portable; disclose function/file expansion.
Run discovery, then use noninteractive commands:

```bash
mutmut run 'package.module.function*'
mutmut results
mutmut show '<mutant-name>'
mutmut run '<mutant-name>'
mutmut export-cicd-stats
```

Do not depend on `mutmut browse`; it is an interactive Textual UI. Retain the
per-file/result metadata under `mutants/` (including exported CI stats), and
delete or segregate that directory when commit, tests, or scope changes.

`killed`, `caught by type check`, and timeout are detected (spot-check timeout);
`survived` and `no tests` are undetected/actionable; `suspicious`/segfault are
excluded; `skipped` is out of scope; `not checked` or interrupted is incomplete.

