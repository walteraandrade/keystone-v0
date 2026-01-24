# Documentation Maintenance

Update docs when modifying codebase:

| Change | Update |
|--------|--------|
| New entity/relationship | `docs/DOMAIN_MODEL.md` + `docs/ONTOLOGY_VERSIONING.md` |
| New endpoint | `docs/API.md` |
| New design pattern | `docs/DESIGN_PATTERNS.md` + relevant `src/**/README.md` |
| Config changes | `docs/DEVELOPMENT.md` |
| Architecture changes | `docs/ARCHITECTURE.md` |

**README.md**: Never add implementation details. Keep minimal: description, quickstart, links.
