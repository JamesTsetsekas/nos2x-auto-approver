# Security policy

## Intended use

nos2x Auto Approver is deliberately unsafe for valuable identities. Use it only in a dedicated browser profile with a disposable test key and review the approved hosts before every unattended run.

The extension never intentionally transmits the private key itself. Approved sites can nevertheless request arbitrary signatures and encryption or decryption operations, which is enough to impersonate the test identity and expose data handled through that identity.

## Reporting a vulnerability

Please report vulnerabilities privately through the repository's **Security** tab by opening a private vulnerability report. Do not include private keys, signed private content, browser profiles, or real user data in a report.

Until the repository has a published security contact, do not open a public issue for an unpatched vulnerability.
