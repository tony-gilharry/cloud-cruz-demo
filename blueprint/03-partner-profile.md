# 03 Partner profile

**Cloud Cruz recruits partners that can get its customer live faster and cheaper than the customer could alone. Two gates keep out the wrong firms, a 100-point fit score ranks the right ones, and an intent score says who to call today.** (Decisions 28 to 31, 35)

> All of this is synthetic. Real agencies appear only as examples of a segment, never as Cloud Cruz partners or targets (decision 30).

## Four segments

Segments come from one test: can this firm build on an AI data platform? The service tags in the public mediasense Global Agency Family Tree 2026 answer it (data and CRM, digital creative, consulting), and the segments follow Cloud Cruz's own customer profile (decision 28).

| Segment | Who | Role in the program |
|---|---|---|
| **Anchor** | Holding-company data and digital units | Invite-only, white-glove; the route to high-profile commercial clients; Elite |
| **Scale** | Consultancies' digital arms | Strategic SIs; the enterprise route |
| **Specialist** | Independent digital and data agencies | Premier and Select targets |
| **Builder** | Boutique AI studios and consultancies | The beta cohort; the volume that serves the mid-market customer |

(Decision 31)

## Two gates

A partner must have both before it is scored:
1. An AI or data delivery practice.
2. Three or more mid-market B2B software clients.

## The fit score (100 points)

Who the partner is. Recruit at **70 or more, with no category at zero** (decision 29).

| Signal | Points | What it measures |
|---|---|---|
| Client-base quality | 25 | Marquee and ICP-fit clients: would Cloud Cruz want their customers? |
| Propensity to refer | 20 | Active in other vendors' programs; co-sell history in Crossbeam |
| Propensity to learn | 20 | Certified people, including hyperscaler badges on Credly |
| Delivery maturity | 20 | Can they ship and run production work? |
| Average project value | 10 | Deal size they usually work at |
| Customer count | 5 | How many customers they serve |

What happens at each score (decision 37): 70+ is approved automatically; 50 to 69 goes to a partner manager, who can admit with a logged reason; under 50 goes to nurture.

## The intent score (100 points)

How ready the partner is right now (decision 68).

| Signal | Points | How it's read |
|---|---|---|
| Completed the program application | 30 | Event |
| Responded to outreach or booked a meeting | 20 | Event |
| Stated need and timeline: now 20, this quarter 10, later 0 | 20 | Typed judgment from the application or reply |
| Webinar or cohort attendance | 10 each, up to 20 | Event |
| Directory visits or content downloads | Up to 10 | Event |
| **Deal in hand** | **Automatic urgent** | Typed judgment on free text; a person confirms low-confidence calls |

Signals older than 30 days count half, so the score reflects now.

## Who to call today

| | Low intent | High intent (50+) |
|---|---|---|
| **High fit (70+)** | Warm: the agent drafts outreach | **Hot: a person calls** |
| **Low fit** | Nurture: automated sequence | Warm: qualify the gap |
| **Deal in hand** | **Urgent: a Slack alert; the partner development rep, a partner manager and the AE engage now** | |

Hot is not a fixed line. **Routing follows capacity:** each partner development rep gets the top leads by fit x intent every day (8 to start), and the agent handles the rest. A person approves every AI-drafted send in Year 1 (decisions 36, 70, 71).

## How the scores are read: a typed-decision layer

Plain events (an application, a webinar) are counted in code. Signals that need judgment (does this firm have an AI practice, is this a deal in hand, how urgent is the stated need) come from a typed-decision layer: a model returns a typed answer, a choice, score or yes/no, with a probability, and Cloud Cruz's own weights turn it into points. Low-confidence answers go to a person. Jev, TypeSafe's System One model, is the planned first engine; the layer is vendor-neutral, with a rules-only fallback. It is run by hand in the beta and goes live in build 3 (decision 69).

It scales on a flat team: scoring runs only when a new signal arrives, every judgment is logged in Salesforce with its confidence, and quality is guarded by a human-review rate at or under 10%, a 5% weekly audit and a monthly spend cap (decision 70).

## Region

The United States, the Americas and English-speaking firms, to start (decision 67).

## The agency profile

Every partner has a profile built on Osterwalder's Business Model Canvas: customer segments, value proposition, channels, relationships, revenue streams, key resources, activities, partners and costs. The partner development rep and partner account manager fill it in call by call in Salesforce. It powers fair, capability-based routing and a public partner directory where customers can self-match (decision 51).

## Why this saves time and money

Customers get a partner who has done the work before. Partners get leads that fit what they already do. The Cloud Cruz team spends its limited hours on the partners most likely to get customers live, which is how a 9-person team reaches 400 customers live through partners (decisions 65, 66).
