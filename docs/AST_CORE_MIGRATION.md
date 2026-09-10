# AST and core contract migration

Local file discovery and filesystem trees now execute directly under `astSearch`.
The retired local structure/file adapters and their schemas have been removed.
GitHub repository trees remain available through `ghSearch`.

| Responsibility | Owner |
| --- | --- |
| All ten public tool validators, field descriptions, catalog metadata, and MCP instructions are generated from the enabled tool names. Tool descriptions
describe selection boundaries; field constraints live in the schemas.
