# How `just hunt` ranks opportunities

Score = **Demand × OSS-Leverage × Enterprise-Willingness-to-Pay**

| Factor | Signal source | Weight |
|---|---|---|
| Demand | HN points, Reddit upvotes, PH votes, Google Trends slope | 0.35 |
| OSS leverage | Existence of MIT/Apache repo in `arsenal.yaml` that does 60%+ of the work | 0.30 |
| Enterprise WTP | Pain in G2 1-star reviews, presence of SSO/SCIM/audit need, ACV > $10k for incumbent | 0.35 |

## Wedge patterns that consistently win
1. **"Open-source X"** where X is a $50/mo SaaS — sell self-host + managed.
2. **"AI-native X"** where X is a workflow tool people hate (Jira, Salesforce).
3. **"X for [vertical]"** — niche down a horizontal tool (CRM for HVAC, Notion for law firms).
4. **"Migrate from X"** — one-click importer is the wedge, then upsell.
5. **Compliance-as-a-feature** — SOC2/HIPAA/GDPR baked in beats the incumbent.

Claude reads `daily-report.md` + `arsenal.yaml` and proposes the top 3 builds with:
- Wedge sentence
- Arsenal pieces to use
- Enterprise hooks (which BoxyHQ/Casbin/audit modules)
- Viral mechanic to wire
- 14-day MVP scope
