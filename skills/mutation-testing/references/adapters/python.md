# Python adapter — Mutmut

Official documentation: <https://mutmut.readthedocs.io/en/latest/>

## Compatibility and setup

Use Mutmut 3.8.1 as the audited baseline. Re-check PyPI and the official docs
before pinning in a project. Mutmut requires fork semantics; on Windows, run it
under WSL. Install in the project's isolated development environment:

```bash
python -m pip install 'mutmut==3.8.1'
```

Do not add the dependency or its metadata during test-only remediation unless
the owning project explicitly approves that separate configuration change.

## Scope and run

Configure production roots with `source_paths`, then narrow through `only_mutate`
or `do_not_mutate` in project configuration. For a targeted function family:

```bash
mutmut run 'package.module.function*'
mutmut browse
```

Mutmut remembers prior outcomes, selects tests related to mutated code, and can
run mutants in parallel. Clear or segregate its cache when the frozen commit,
test command, or scope changes so old evidence is not mistaken for a new run.
Inside `mutmut browse`, select a mutant and press `r` to rerun it. Use
`mutmut apply <mutant-id>` only when you need to inspect the mutation in the
disposable worktree; restore clean production before editing tests.

## Evidence and limits

Retain its result database/output and record the selected mutant from
`mutmut browse` for targeted proof. Path and function selection are supported;
exact changed-line selection is not a portable Mutmut contract. If the selected
function is broader than the diff, report that expansion. Use the TUI's selected
mutant rerun when available; otherwise rerun the narrowest function pattern and
match the same location/type outcome.

Preserve Mutmut's native labels. `killed` and `caught by type check` are caught;
`survived` is actionable; `no tests` is no coverage; and `skipped`, `not
checked`, interruption, `suspicious`, timeout, and segfault remain incomplete.
Do not count an abnormal test-run result as a surviving or killed mutant.
