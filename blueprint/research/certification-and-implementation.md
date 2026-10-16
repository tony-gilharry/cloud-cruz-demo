# Certification ladders and packaged implementation

Research date: 2026-09-25. Public sources only. "Verified" = read on an official page; "secondary" = reputable non-official source; "inferred" = the researcher's reading.

**Headline:** only Notion and Databricks publish a real partner certification ladder. Ramp publishes a 14-week implementation guide, but for Procurement, written for customers, with no partner role. AWS Well-Architected is the clearest public review-based quality bar. No company found ties a credential level to a customer time-to-value number, so doing that would be new for Cloud Cruz.

## By company

| Company | Certification | Packaged implementation | Tie to customer outcomes |
|---|---|---|---|
| Notion | Verified. Three free badges (Essentials, Workflows, Advanced, 75% to pass), then a proctored Administrator exam (80%, $100 to $150) (https://www.notion.com/help/badges-and-certifications). Partner certifications require Administrator: Service Specialist, Sales Specialist, Technical Specialist; consulting partners hold all badges plus Administrator and Service Specialist (https://www.notion.com/help/become-a-notion-partner) | "Solutions Kits (templates, implementation guides)" (https://www.notion.com/partners/solutions-partner-program); no public week-by-week plan | Applicants show "documented customer outcomes aligned with Notion's core use cases" and meet "client experience standards" |
| Databricks | Verified. Bronze, Silver, Gold, Platinum; Silver needs "certified team building", Gold "customer success stories... at least one Brickbuilder specialization", Platinum invite-only; a Partner Value Score from use cases, certifications, CSAT and references (https://www.databricks.com/partners/partner-program). 2026 relaunch added specialization badges and individual "Delivery Expert" badges (https://www.databricks.com/blog/building-whats-next-together-introducing-brickbuilder-partner-network-agentic-ai-era). Secondary: specializations "validated on actual technical delivery... not just headcount" | Verified. Brickbuilder Accelerators: "highly focused engagements, often taking 30 days or less", lakehouse setup in "weeks, not months" (https://www.databricks.com/blog/databricks-expands-brickbuilder-program-include-lakehouse-accelerators) | Strongest tie: incentives follow consumption across Source, Activate ("early adoption SPIFFs") and Grow |
| Ramp | Verified. Tiers by referrals or Client Spend Potential, not certification (https://support.ramp.com/hc/en-us/articles/40415613198355-Understanding-Ramp-s-Partner-Tiers); Partner Academy courses are NASBA-certified for CPE (https://ramp.com/blog/ramp-academy-cpe); course list behind login | See below; AP "up and running in under 2 weeks" (https://ramp.com/blog/accounts-payable/how-to-implement-ap-software) | Client Spend Potential rewards referral quality |
| Supabase | No public partner certification. Integration and Solution partners; apply, about a week of review, then launch (https://supabase.com/partners) | None public | The verified listing is the trust signal |
| Cursor | No public partner certification. Benchmark Partners (AWS, BCG, Databricks, McKinsey, NVIDIA, Snowflake) launched Jul 30, 2026 (https://cursor.com/blog/benchmarkpartners); SI deals with EPAM and AHEAD; secondary: a broader network planned later in 2026 | None public | "Measurable enterprise impact", no published metrics |
| Spekit | No public partner certification or program page found (https://www.spekit.com/partners is a product page) | Third-party claims only; low confidence | Thin evidence |

## Ramp's 14-week guide

Public: the Procurement Implementation Best Practices Guide says "a typical procurement implementation takes approximately 14 weeks" (https://support.ramp.com/hc/en-us/articles/49437597525907-Procurement-Implementation-Best-Practices-Guide). Phases: week 1 discovery; week 2 planning (named owners); weeks 2 to 9 four parallel workstreams (Procurement, ERP/IT, Bill Pay, Cutover); weeks 3 to 8 optional demo testing; **week 9 admin sign-off gate**; weeks 9 to 12 production testing; weeks 10 to 11 cutover planning; **week 11 stakeholder review gate**; weeks 12 to 13 training; week 14 go-live, optionally phased; then hypercare. Caveats: Procurement only, customer-facing, no partner role.

## AWS Well-Architected

Six pillars: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability, extended by domain lenses (https://aws.amazon.com/architecture/well-architected/). A review answers a structured question set in the free Well-Architected Tool and yields high and medium risk issues. Partner motion (https://aws.amazon.com/blogs/apn/success-in-the-aws-well-architected-partner-program-a-guide-for-apn-consulting-partners/, 2020): pick a workload, run the review, log high-risk issues, write a prioritized statement of work to fix them; 3,500+ partner-led reviews in 2019; credits made reviews "cost neutral for the client". Inferred strengths: a public, identical rubric; findings tied to cost and reliability; reviews lead to paid remediation; findings are auditable.

## Synthesis

| Pattern | Who uses it | Lightweight 0-to-1 version |
|---|---|---|
| Earn a level by delivering a customer result, not only an exam | Databricks, Notion, Ramp (client value) | One exam per level plus N delivered customers who hit a defined milestone, confirmed by customer sign-off and a product usage event |
| A public review rubric as the quality bar | AWS Well-Architected | A one-page readiness review with about five pillars; partners run it; high-risk items become the remediation scope |
| Packaged, time-boxed engagements | Databricks Accelerators, Ramp's 14-week guide, Notion Solutions Kits | Two or three fixed-scope packages with week-by-week plans, sign-off gates and a go-live checklist; credentials grant the right to deliver them |

Per-level customer savings numbers are the researcher's synthesis, not an existing public practice at these companies.
