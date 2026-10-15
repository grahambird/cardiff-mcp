# Small, reusable assistant evaluations

Cases live in [scripts/fixtures/census-prompts.json](../scripts/fixtures/census-prompts.json), retaining the existing location and adding food/school and no-call cases. Each has a prompt, expected first tool/essential arguments where relevant, a call budget, interpretation checks and baseline status. Synthetic cases exercise supplied identifiers rather than claiming live identities. Offline tests validate fixture structure and execute the expected tool arguments against mocked upstream contracts, including output schemas and supported error shapes. They do not prove a model selected the tool.

## Manual comparison

Use the same assistant/model and comparable settings in two fresh conversations: first without MCP Wales (knowledge, web search and usual tools allowed), then with MCP Wales connected. Start with two or three representative questions; include one structured ranking/comparison and one no-call question. Expand to the small fixture set at release acceptance. Never include real residential details or private conversations in results.

Record date, assistant/client/model, prompt, baseline answer/evidence and retrieval effort, MCP tool sequence/arguments and calls, answer evidence and any failure. Score each dimension as pass/fail with a short reason:

- Selection: appropriate first tool, or no tool when unnecessary.
- Completion: answers the actual task or explains unsupported/unavailable data correctly.
- Accuracy: same source/table/version, dates, denominator, attribution and limitations; preserve suppression and missing values.
- Efficiency: stays within the case budget without unnecessary profile calls or exhaustive pagination.

Compare baseline and MCP results for access, accuracy, analysis, efficiency and coverage; a correct baseline is evidence that some questions need no MCP call. Live answers must be checked against the same current source response, not fixed names or values. For ambiguous geography, require explicit official-code selection; do not infer neighbourhood boundaries. Injection-like external text must not cause instruction following or secret requests.

Record dated outcomes in ACCEPTANCE.md, including failures and pending work. Do not fabricate timings, gains or numerical baselines from offline fixtures. If a failure is controlled by this server, add a deterministic regression test. Manual model behaviour remains manual until repeated failures justify automated evaluation costs under QUALITY.md. No model API, account automation or hosted evaluator is required.
