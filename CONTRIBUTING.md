# Contributing

Keep changes close to upstream nos2x and make unattended behavior explicit and testable.

Before opening a pull request:

```sh
bun ci
bun run check
```

Changes to host matching must include positive cases, lookalike-domain rejections, disabled-mode behavior, and all-sites behavior. Never add private keys, `.pem` files, signed private events, or real user data to fixtures, logs, issues, or pull requests.
