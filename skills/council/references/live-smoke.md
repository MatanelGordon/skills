# Opt-in live multi-agent smoke

Use this only when validating a Council release in a host that can spawn genuinely isolated sub-agents. It is opt-in because it consumes several model calls and cannot run inside local Node tests. The local suite already covers protocol mechanics; this smoke covers host isolation and real prompt propagation.

The scenario is `../evals/live-smoke.json`. Keep every generated artifact in an isolated temporary directory outside the repository.

## Run

1. Validate the manifest brief and routing with `council-protocol.mjs`. The implicit architecture request must return `AUTO_ARCHITECTURE`.
2. Select members from the manifest features. The result must exactly equal `expectedMembers`.
3. Read [personas.md](personas.md) and [protocol.md](protocol.md). Build each round-one prompt from the literal blocks and spawn every member in a fresh isolated context. Record the host-assigned spawn ID, exact prompt, and exact response. Never invent an ID.
4. Classify round 1. This scenario is intended to be `NOT_CONVERGED`. Run the casting-director check, persist its literal output, and validate it with the helper. `NONE NEEDED` keeps the original roster; a valid named member becomes the only late joiner. A converged result makes this particular smoke inconclusive because it does not exercise the contested round-two path; report it instead of manufacturing disagreement or changing a vote.
5. Record the mapping used for any round-one anonymous packet. Ask the helper for a fresh round-two mapping with the prior mapping supplied, then build prompts with the manifest's `maxPromptChars`. If it returns `PACKET_TOO_LARGE`, the smoke fails; do not compact.
6. Spawn every round-two voter in a new isolated context. Round-two spawn IDs must be distinct from one another and from all round-one IDs. Record each exact prompt and response.
7. Write the ledger shape below and verify it. A nonzero exit is a failed smoke.

```bash
node <council-skill-dir>/scripts/council-protocol.mjs verify-live-smoke /absolute/path/to/ledger.json
```

## Ledger contract

```json
{
  "decisionBrief": "exact manifest brief",
  "castingDirectorOutput": "NONE NEEDED or MISSING ROLE: valid-name",
  "round1": [
    {
      "persona": "Skeptic",
      "spawnId": "host-assigned-id",
      "prompt": "exact prompt",
      "response": "exact response"
    }
  ],
  "round1Mapping": {
    "Skeptic": "R2"
  },
  "round2": {
    "mapping": {
      "Skeptic": "R1"
    },
    "packet": "exact helper-generated anonymous packet",
    "members": [
      {
        "persona": "Skeptic",
        "spawnId": "new-host-assigned-id",
        "prompt": "exact helper-generated prompt",
        "response": "exact response"
      }
    ]
  }
}
```

The arrays must include every expected member, not just Skeptic. The CLI verifier loads the shipped persona blocks and reconstructs the complete helper-owned round-one and round-two prompts for exact equality. It also requires JSON-string prompts, responses, and host IDs; the expected contested round-one state; a valid recorded casting result; usable member slots; one-to-one fresh mappings; distinct IDs across rounds; and byte-for-byte round-one responses in the anonymous packet. It does not claim that an ID proves provider-level process isolation; it proves the host reported separate spawns and that the run preserved their contexts and text as recorded.
