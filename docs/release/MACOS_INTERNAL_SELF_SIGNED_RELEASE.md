# TimeWhere macOS Self-Signed Internal Release Runbook

Status: TimeWhere.app internal-only signing and packaging runbook for limited managed Mac machines.

This document covers TimeWhere.app only. The Usage Agent is an external project and is not developed, installed, signed, configured, or managed by this repository.

## Release Modes

| Mode | Intended use | Signing identity | Gatekeeper / notarization posture |
|---|---|---|---|
| Unsigned internal build | Local engineering smoke only | None | Not suitable for managed users. macOS may warn or block depending on quarantine and policy. |
| Self-signed internal build | Limited administrator-managed Macs only | `TimeWhere Internal Code Signing` or successor internal identity | Target Macs must import and trust the internal certificate. This is not Apple Developer ID, cannot be notarized as Developer ID software, and is not suitable for public distribution. |
| Developer ID signed / notarized public build | External distribution outside Mac App Store | Apple-issued `Developer ID Application` certificate | Requires Apple Developer Program membership, hardened runtime, notarization, stapling, and Gatekeeper verification before public release. |

Self-signed internal release rules:

- Use only on explicitly approved, limited Macs.
- The administrator must import and trust the internal certificate on every target Mac.
- Do not call self-signed output "notarized", "Developer ID signed", or "public release ready".
- Do not upload self-signed output to GitHub Releases, Chrome Web Store, Mac App Store, a public website, or an auto-update channel.
- Do not commit private keys, `.p12`, `.pfx`, `.cer`, keychain files, tokens, cookies, account emails, or local private paths.
- Prefer the same internal certificate across internal versions. Certificate rotation can change code identity and may affect macOS trust and operator diagnostics.

Public macOS release remains a separate future lane requiring Apple Developer Program, Developer ID Application certificate, hardened runtime, notarization, stapling, and Gatekeeper verification.
## GitHub Actions Unsigned Package SOP

For the Windows-side workflow that triggers the macOS Universal zip build,
downloads the GitHub Actions artifact, and records SHA256 evidence, use
`platforms/desktop-electron/README.md` -> `macOS GitHub Actions Packaging SOP`.

Boundary rules:

- Triggering `timewhere-desktop-mac.yml` requires explicit Product Owner approval
  because the workflow uses `TIMEWHERE_GOOGLE_DESKTOP_CLIENT_SECRET` to generate
  the internal desktop OAuth metadata module.
- The generated macOS zip contains artifact-bundled Desktop OAuth client metadata.
- Uploading that zip to a shared Google Drive folder or any external destination
  requires separate explicit Product Owner approval for that sharing action.
- This SOP still does not approve Developer ID signing, notarization, GitHub
  Release creation, public distribution, or auto-update publication.

## Usage Agent Boundary

The Usage Agent is external to TimeWhere:

- It is not a TimeWhere source module.
- It is not developed in this repository.
- It is not installed by TimeWhere scripts.
- It is not signed, verified, launched, stopped, or kept alive by this repository.
- TimeWhere must not sense whether the Agent exists or is running.
- TimeWhere must not manage Agent LaunchAgent plist, configuration, Accessibility permission, retention, or storage implementation.

Future TimeWhere usage integration must wait for an explicit external interface document. Until then, this repository must not hardcode Agent paths, JSONL schemas, LaunchAgent labels, config names, retention jobs, or process-management assumptions.

Current Product Owner preferences for the external Agent, for future interface-document authorship only:

- v1 keeps JSONL and does not upgrade to SQLite.
- v1 keeps per-user independent records.
- v1 retains records for 90 days.
- Developer ID / notarization is not considered for the current internal Agent path.
- If external logs are stored under a user's Library, they are not audit-grade immutable; a user can delete or tamper with user-owned files.

These preferences are not an implementation approval for this repository.

## Internal Code Signing Certificate

Recommended certificate name:

```text
TimeWhere Internal Code Signing
```

Create on an administrator Mac:

1. Open Keychain Access.
2. Choose Certificate Assistant -> Create a Certificate.
3. Name: `TimeWhere Internal Code Signing`.
4. Identity Type: Self Signed Root.
5. Certificate Type: Code Signing.
6. Enable "Let me override defaults" if needed for validity and trust settings.
7. Store the private key only in an administrator-controlled keychain.
8. Export a password-protected `.p12` only for controlled transfer to approved signing machines.

Target Mac trust setup:

1. Import the certificate into System or login keychain as required by the administrator policy.
2. Mark the certificate as trusted for Code Signing.
3. Do not import the private key onto user machines unless that machine is also an approved signing machine.
4. Verify the signing identity appears in `security find-identity -v -p codesigning`.

Hard rules:

- Never commit private keys or exported certificate bundles.
- Never record certificate passwords in repository documents, scripts, or release evidence.
- Do not rotate the certificate casually. Rotation can change code identity and invalidate trust assumptions.

## Signing

Script:

```text
scripts/release/sign-mac-self-signed.sh
```

Usage:

```bash
TIMEWHERE_CODESIGN_IDENTITY="TimeWhere Internal Code Signing" \
  scripts/release/sign-mac-self-signed.sh /path/to/TimeWhere.app
```

The script:

- Requires the identity through `TIMEWHERE_CODESIGN_IDENTITY`.
- Accepts an app bundle or binary path, but this repository's intended target is TimeWhere.app.
- Rejects identities containing `Developer ID` to avoid accidentally mixing internal and public release lanes.
- Does not run notarization.
- Does not staple.
- Runs `codesign --verify --deep --strict --verbose=2` after signing.

## Verification

Script:

```text
scripts/release/verify-mac-self-signed.sh
```

Usage:

```bash
scripts/release/verify-mac-self-signed.sh /path/to/TimeWhere.app
```

The script:

- Runs `codesign --verify --deep --strict --verbose=2`.
- Runs `codesign -dv --verbose=4`.
- Attempts to print a SHA256 fingerprint for the leaf signing certificate.
- Can optionally run `spctl --assess` when `TIMEWHERE_RUN_SPCTL=1`.

Important: `spctl --assess` is informative only for this lane. A successful self-signed verification is not the same as Apple Developer ID Gatekeeper acceptance, and a failing `spctl` assessment is expected on machines that do not trust the internal certificate or for artifacts carrying quarantine attributes.

## Package And Checksum

Sign first, then package. Do not modify app contents after signing.

Script:

```text
scripts/release/package-mac-internal-zip.sh
```

Usage:

```bash
scripts/release/package-mac-internal-zip.sh /path/to/TimeWhere.app TimeWhere-mac-internal.zip
```

Equivalent manual commands:

```bash
ditto -c -k --keepParent TimeWhere.app TimeWhere-mac-internal.zip
shasum -a 256 TimeWhere-mac-internal.zip > TimeWhere-mac-internal.zip.sha256
```

The SHA256 must be generated against the final zip that will be installed or archived internally.

## Manual Validation Checklist

On a target Mac:

1. Confirm the internal signing certificate is imported and trusted.
2. Verify TimeWhere.app signature with `scripts/release/verify-mac-self-signed.sh`.
3. Package the signed app and record SHA256 for the final zip.
4. Install the app through the administrator-approved internal path.
5. Confirm TimeWhere.app launches on the managed Mac.
6. Confirm macOS warning copy matches the self-signed internal lane and is not represented as notarized/public-ready.
7. If `spctl` is run, treat it as diagnostic only, not as Developer ID notarization evidence.

## Future External Usage Interface

TimeWhere may later consume usage data when a separate interface document exists. That plan must define:

- Which external file/API TimeWhere may read.
- Schema and versioning.
- Retention expectations visible to TimeWhere.
- Error states when data is missing or stale.
- Privacy boundaries and fields TimeWhere must ignore.

Until that interface document is approved, no TimeWhere implementation should be added for usage ingestion.

## Future Auto-Update Boundary

Automatic updates are not implemented in this plan.

A future internal updater would need a separate Product Owner decision and should include:

- An internal `manifest.json`.
- A signed zip artifact.
- SHA256 for the final zip.
- `codesign` verification.
- Internal certificate fingerprint pinning.
- Atomic replacement.
- Rollback on verification or launch failure.
- Clear operator logs without secrets or private user identifiers.

Do not implement auto-update until explicitly approved.

## Explicit Non-Goals

- No Usage Agent source, signing, installation, LaunchAgent, configuration, or permission management in this repository.
- No Developer ID signing.
- No notarization.
- No stapling.
- No GitHub Release.
- No public release.
- No Mac App Store release.
- No automatic update implementation.
- No Network Extension.
- No Endpoint Security.
- No System Extension.
