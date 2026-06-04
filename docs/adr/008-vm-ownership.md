# ADR 008: VM Ownership — Key-Based Access

## Decision
Each VM is owned by a user. User gets a `vmKey` to reference their instance.

Model: `user → vmKey → instance`

- Provision VM → get vmKey (`vm-{uuid}`)
- vmKey stored in Redis
- All VM ops require vmKey in URL
- Enforce: JWT subject must equal session owner

## Store changes
SessionData gets `VMKey` and `IsVM` fields.

New methods:
- `GetByUser(userID)` — list user's sessions/VMs
- `GetByVMKey(vmKey)` — lookup by key
- `DeleteByUser(userID)` — cleanup on account delete
