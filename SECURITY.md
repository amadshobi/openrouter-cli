# Security Policy

## Supported versions

Only the latest release is supported with security updates.

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report privately by opening a security advisory on GitHub:

- Go to https://github.com/shobixlinuxdev/openrouter-cli/security/advisories/new
- Or email the maintainer directly (see profile for contact)

You can expect an acknowledgment within 48 hours and a detailed response within 5 business days.

## What to include

- Affected version(s)
- Steps to reproduce
- Impact of the vulnerability
- Any suggested fix (optional)

## Scope

This project is a CLI that talks to the OpenRouter API. It reads API keys from
the environment — treat keys as secrets, never commit or log them. Vulnerabilities
related to key handling, command injection, or dependency supply chain are in scope.
