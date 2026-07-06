# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Report privately via GitHub's [private vulnerability reporting](../../security/advisories/new) on this repository. You should receive a response within 72 hours.

## Scope notes

- The Casper payment rail verifies every transfer server-side against the node — reports about client-side bypass of that verification are highest priority.
- The agent keypair (`agent/keys/`) is gitignored by design; never commit key material.
