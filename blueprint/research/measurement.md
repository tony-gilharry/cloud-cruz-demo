# Measuring partner revenue and cost

Research for Build 2 (Measurement Layer), decisions 105 to 107, Oct 12, 2026. Public sources only. Cloud Cruz is fictional; the companies below are real programs and vendors cited for how they work, never as Cloud Cruz partners.

## Summary

- Programs agree on the definitions. Sourced means the partner originated the deal; influenced means a partner helped a deal that already existed. Sourced is fixed when the opportunity opens; influence can be added later.
- For several partners on one deal, the market uses two layers: one partner is paid (one partner of record per workload or deal), while every contributing partner gets recognition by role. Microsoft's CPOR and Salesforce's revenue vs overlay splits both work this way.
- Program totals must count each dollar once. Sourced, influenced and no-partner revenue are kept as separate buckets that never get summed together.
- Cost lists are consistent: commissions, co-marketing or MDF, partner team headcount, portal and tools, enablement and events. ROI is usually return over fully loaded cost, or partner customer acquisition cost against direct sales.
- The most common headline KPI is partner-sourced revenue, followed by sourced leads and influenced revenue. The large cloud programs now tie tiers to customer outcomes such as launched customers, which matches Cloud Cruz's north star.

## Decision 105: crediting two or more partners on one deal

| Option | Who uses it | Pros | Cons | Fit for Cloud Cruz |
|---|---|---|---|---|
| **A. Full credit by role, never summed** | introw multi-tier attribution: each partner gets "independent credit without one relationship overwriting another." Salesforce overlay splits can exceed 100%. | No disputes; every helper shows up on its scorecard | Partner totals add up to more than real revenue, so they must not be summed | Matches decision 85 (one junction row per partner per role) and feeds tier credit for influence (decisions 74, 94) |
| **B. One winner per deal or workload** | Microsoft CPOR: each workload or subscription "can be associated with only one partner." Marketplace partner of record | Clean totals; safe for payouts | Hides implementers and co-sellers | Already Cloud Cruz's payout rule: only Sourced or Partner of record rows carry commission (decision 85); `tie_breaks` in attribution.yaml pick the winner |
| **C. Weighted split totaling 100%** | Salesforce revenue splits ("the sum of revenue splits cannot exceed 100%"); multi-touch models in PRM tools | Totals reconcile to the deal | Weights are judgment calls and invite argument | attribution.yaml already sets `credit_model: weighted` for influenced touches (referral 1.0, co_sell 0.6, implementation 0.4, influence 0.2) |
| **D. Equal split** | Common in affiliate programs | Simplest split to explain | Ignores who did what | The yaml's `equal` setting; weaker than C with no simpler story |
| **E. Exclusive buckets at program level** | Reditus guidance: keep sourced and influenced exclusive, with "no double counting." Crossbeam reports attributed vs unattributed revenue | One honest company total | Says nothing about individual partners | Fits the program-level page; sourced wins when a deal is both |

**Pattern:** paying and recognizing are separate. Microsoft offers non-incentivized "Influenced Revenue recognition" claims; Salesforce separates revenue splits from overlay splits.

**Open question:** attribution.yaml treats implementation as an influence touch, while decision 85 makes Implementer its own role. The weighted split (C) is only needed if partner-level influenced dollars must reconcile to company totals.

## Decision 106: what counts as program cost, and how ROI is computed

**Components programs count:**

| Component | Seen in |
|---|---|
| Commission payouts | Track360 |
| Partner management team (headcount) | Track360 |
| MDF and co-marketing | Track360; Microsoft co-op funds |
| Partner portal and tooling | Track360 |
| Enablement content | Track360 |
| Events and sponsorship | Track360 |

Partner team headcount is a fixed cost that must be spread over enough deals to beat direct sales (Track360). SPIFFs, funded implementation work and certification vouchers rarely appear as separate lines in public sources. They fall under incentives and enablement.

**How ROI is computed:**
- **Partner CAC:** Track360 divides total quarterly program cost by new customers acquired through partners and compares the result with direct-sales CAC.
- **Return over cost:** introw advises comparing partner pipeline and revenue "against program cost," without a fixed formula.

**Fit for Cloud Cruz:** every candidate in decision 106 is money Cloud Cruz spends because the program exists, so all seven belong in a fully loaded cost. Two views keep it explainable: **paid to partners** (commissions, SPIFFs, implementation packages, co-marketing fund) and **fully loaded** (adds the 9-person team, tools and platform fees, exam vouchers). AE compensation stays out, because decision 50 treats partner commission as the program cost, not a deduction from the AE.

## Decision 107: the metrics programs lead with

| Source | What leads |
|---|---|
| Crossbeam 2023 KPI survey (500+ respondents) | Partner-sourced revenue 67%, sourced leads 62%, influenced revenue 54%, sourced opportunities 53% |
| Partnership Leaders guide | "Revenue is almost always the North Star"; then engagement, performance (attach rate, win rate, deal size) and health |
| AWS Services Path tiers | Launched opportunities per rolling 12 months (3, 20, 50 by tier), with minimum monthly revenue |
| Google Cloud Partner Network (Dec 2025) | Tiers set on "exceptional customer outcomes"; pre-sales and post-sales contributions count |

**Pattern:** practitioners lead with sourced revenue. The hyperscalers grade partners on launched customers and outcomes. Both report sourced and influenced revenue as separate numbers.

## Sources

| Title | Publisher | Date | URL | Notes |
|---|---|---|---|---|
| Create a Customer Association | Microsoft Learn | Aug 22, 2025 | https://learn.microsoft.com/en-us/partner-center/incentives/submit-osa-claim | Verified. One partner per workload or subscription; non-incentivized influence roles |
| Sell as a Team and Split the Credit | Salesforce Trailhead | Undated | https://trailhead.salesforce.com/content/learn/modules/leads_opportunities_lightning_experience/sell-as-a-team-and-split-the-credit | Verified |
| Partner Attribution | introw | Jul 19, 2026 | https://introw.io/blog/partner-attribution | Verified. Vendor blog; introw is in Cloud Cruz's stack |
| Understanding attribution in Crossbeam | Crossbeam | Jun 24, 2025 | https://help.crossbeam.com/en/articles/11553885-understanding-attribution-in-crossbeam | Verified. Does not say how multi-partner deals are counted |
| Who gets credit for a co-sell deal | PartnerStack | Sep 23, 2025 | https://partnerstack.com/articles/your-guide-to-determining-who-gets-credit-for-a-co-sell-deal | Verified. Names multi-partner attribution, no method |
| Partner-influenced revenue (glossary) | Reditus | Undated | https://getreditus.com/resources/glossary/partner-influenced-revenue | Verified. Vendor glossary |
| Partner program economics and co-marketing | Track360 | Undated (course lesson) | https://track360.io/learn/b2b-partner-and-channel-program-management/partner-program-economics-and-co-marketing | Verified. Example figures are illustrative, not used |
| Most common KPIs for partner teams | Crossbeam | Feb 6, 2023 | https://insider.crossbeam.com/entry/most-common-kpis-and-quarterly-targets-partner-teams-2023 | Verified. Vendor survey; 2023 data |
| How to Measure Success in Partnership Programs | Partnership Leaders | Aug 15, 2024 | https://partnershipleaders.com/post/measuring-success-partner-ecosystem/ | Verified. No cost or ROI method |
| AWS Services Partner Tiers | AWS | Undated (2026 page) | https://aws.amazon.com/partners/services-tiers/ | Verified. Does not say whether AWS-originated launches count |
| Introducing Google Cloud Partner Network | Google Cloud | Dec 16, 2025 | https://cloud.google.com/blog/topics/partners/introducing-google-cloud-partner-network/ | Verified. No split rules published |

**Could not verify:** Canalys has no public partner ROI method I could find; one widely mirrored guide credits Canalys with an MDF-to-pipeline ratio, but no Canalys page confirms it, so it is not used. Forrester's Feb 2025 report on partner evaluation is paywalled; only its abstract was seen. Phoenix Strategy Group's partnership ROI guide returned a 404 and is not used. Microsoft's "partner-attributed revenue" wording and AWS ACE origin rules were not found on official pages. Snowflake and MongoDB publish no public credit-split rules that I found.
