# DeviceConfig fixtures

These files pin the shape of `GET /api/device/config` (`DeviceConfig` in `packages/contracts`).
The contracts tests parse every `valid-*.json` and expect every `invalid-*.json` to fail;
the extension's own pure validator will run the same files later, so the API and the
extension agree on what a valid config is. `caps.json` holds the `CAPS` values from
`packages/contracts/src/common.ts`.

The folder is not matched by `node --test "test/*.test.js"`.
