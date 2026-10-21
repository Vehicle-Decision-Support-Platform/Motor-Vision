# Architecture

Motor-Vision uses a browser frontend, a Node.js application boundary, and a reserved Python inference boundary.

- `frontend/` owns presentation, browser state, synthetic demonstrations, and current local scoring behavior.
- `backend/` owns HTTP APIs, guarded external retrieval, and static delivery.
- `ml-api/` is reserved for typed Python inference endpoints once real model artifacts exist.
- `ai-models/` separates artifacts and training work by research component.
- `datasets/` separates immutable raw inputs from reproducibly processed data.

The Node backend should call the future ML API over an internal interface. The browser should consume validated, versioned JSON through Node rather than loading Python artifacts directly.
