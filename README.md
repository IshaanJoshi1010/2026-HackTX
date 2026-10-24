# 2026-HackTX

**Fork** is an AI digital twin for Toyota owners, built for HackTX 2026 and the Toyota Financial Services "What's Your Next Move?" challenge. Enter a VIN, watch the car assemble in 3D, describe what is changing in your life, and Fork branches the timeline to compare keeping your car with replacing it.

*The future branches. Explore yours.*

## Team

| Dev | Person | Role | Branch | Owns |
| --- | --- | --- | --- | --- |
| Dev 1 | Kareem | 3D experience | `dev1-3d` | `/ui/3d`, `/public/models`, `/public/points`, `/scripts/3d` |
| Dev 2 | Ishaan | Product UI, integration, merges to `main` | `dev2-ui` | `/app` (except `/app/api`), `/ui` (except `/ui/3d`) |
| Dev 3 | Paarth | Data and AI | `dev3-data-ai` | `/data`, `/ai`, `/app/api` |
| Dev 4 | Anirudh | Simulation and decisions | `dev4-sim` | `/sim`, `/decision` |

Dev 3 and Dev 4 co-write `/contracts`, and Dev 1 and Dev 2 review it. Only touch your own folders. Need a change in someone else's? Write a request.

## Start here

```
git clone https://github.com/IshaanJoshi1010/2026-HackTX.git && cd 2026-HackTX
git checkout <your branch>
npm ci
```

Then open Claude Code in the repo and paste your kickoff prompt (`D1-00`, `D2-00`, `D3-00` or `D4-00`) from `docs/prompts/`.

- Your first handoff: [`docs/handoffs/`](docs/handoffs/) (`DEV1-kareem.md`, `DEV2-ishaan.md`, `DEV3-paarth.md`, `DEV4-anirudh.md`)
- Team guide: [`docs/TEAM_README.md`](docs/TEAM_README.md)
- Shared rules: [`CLAUDE.md`](CLAUDE.md)
- Interfaces between devs: [`contracts/INTERFACES.md`](contracts/INTERFACES.md)
- Handoff log: [`docs/HANDOFF.md`](docs/HANDOFF.md)
- Open questions: [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md)
