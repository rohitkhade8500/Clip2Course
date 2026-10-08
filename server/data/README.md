# server/data

Runtime data assets loaded by the server at startup.

- `common-passwords.txt` — the 10,000 most common passwords, one per line
  (source: [SecLists 10k-most-common](https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/10k-most-common.txt)).
  Loaded once into a `Set` by `src/config.ts` to enforce Requirement 1.2.

This directory sits next to `src/` and `dist/`, so the same relative path
(`../data/...`) resolves both when running from source and from the build.
