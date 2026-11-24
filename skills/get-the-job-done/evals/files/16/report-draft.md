## Done: pdf-export merged into doc-tools

- Moved the three scripts from `skills/pdf-export/scripts/` to
  `skills/doc-tools/scripts/`.
- Moved the eval cases into `skills/doc-tools/evals/evals.json`.
- Deleted `skills/pdf-export/`.
- Checked references: `grep -rn pdf-export skills/` comes back empty.
- `npm test` and `npm run validate` pass.

Known leftovers: the installed links `~/.claude/skills/pdf-export` and
`~/.codex/skills/pdf-export` now point at nothing and will dangle until
someone reinstalls.
