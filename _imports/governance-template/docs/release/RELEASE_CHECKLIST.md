# Release Checklist

## Purpose

This checklist is the default releaseMg checklist for release/deployment gate execution. Specific release reports may add stricter gates, but must not silently lower this baseline.

## Preflight

- [ ] Release/deployment target is identified in `PROJECT_MASTER.md`.
- [ ] Active tasks and blockers are checked in `TASK_BOARD.md`.
- [ ] Relevant decisions are checked in `DECISIONS.md`.
- [ ] Build&Test implementation evidence is available where needed.
- [ ] Product&Project Mg conformance review is available where needed.
- [ ] Known risks are listed without rewriting waived/deferred items as pass.

## Artifact / Candidate

- [ ] Version matches candidate version.
- [ ] Commit/branch is recorded.
- [ ] Package/artifact path is recorded, if applicable.
- [ ] SHA256 or equivalent identity is recorded, if applicable.
- [ ] Package/artifact opens or verifies successfully, if applicable.
- [ ] Package/artifact excludes repo-only, test-only, credential, browser-profile, cookie, token, and private local data.

## Test Evidence

- [ ] Required unit tests are recorded.
- [ ] Required integration tests are recorded.
- [ ] Required E2E/browser/manual checks are recorded or explicitly waived/deferred by Product Owner.
- [ ] Manual checks are recorded with owner and date.
- [ ] Failures are classified and assigned back to correct role.

## Documentation Consistency

- [ ] Feature spec and implementation report agree.
- [ ] Release report and project status agree.
- [ ] Accepted risks are preserved as risks.
- [ ] Product Owner decisions are clearly marked.

## Privacy

- [ ] No private user identifier.
- [ ] No account email.
- [ ] No token, cookie, password, credential, or local profile path.
- [ ] No private screenshot or raw production data identifier.

## Final Recommendation

- [ ] releaseMg recommendation is recorded.
- [ ] Product Owner final decision is still required.
