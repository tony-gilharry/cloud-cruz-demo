# Decision brief: the intent score, Jev, and scaling the automation

A simulated leadership room (fictional role archetypes from Tony's Virtual Leadership Team method). Tony Gilharry is Driver and made the final decisions. Lens for every seat: will this save time, will this save money, is it the simple thing that works, are we moving with intent, should we think again, does it adapt to the market?

## Decision

How Cloud Cruz scores partner intent, whether Jev (TypeSafe's System One model) should power it, and whether the automation scales on a flat team.

## Context and evidence

- The fit score is set (decision 29); decision 35 left the intent score to co-design.
- Jev returns typed judgments (a choice, score or yes/no, each with a probability) from unstructured state; code owns the workflow; TypeSafe's guidance is to send uncertain cases to a person (https://github.com/typesafe-ai/skills, https://github.com/typesafe-ai/typesafe-sdk-js, both MIT). There is no public `typesafe-ai/jev` repository.
- Year-1 volume: about 3,500 partner leads (about 70 a week); the team is 9 people, flat (decision 66).

## DACI

- Driver: Tony Gilharry
- Approver: Tony Gilharry
- Contributors: VP Global Partnerships, Forward-Deployed AI, GTM Analytics, GTM Operations, Security and Privacy, Enterprise Architecture, Finance, Partner Marketing, Partner Field
- Informed: the partner team

## Round 1: the intent score and Jev

- **Forward-Deployed AI:** a points table counts events but cannot read meaning (does this firm have an AI practice, is this a deal in hand, how urgent is the reply). Typed judgments fill those gaps; composite scoring keeps Cloud Cruz's weights in code; low confidence routes to a person.
- **GTM Analytics:** keep the points table as the contract; log every judgment with confidence and model version; check calibration against outcomes.
- **GTM Operations:** design now, run by hand in the beta, automate in build 3 (decision 34).
- **Security and Privacy:** vendor review (retention, training on inputs, processing location, DPA) before any real data; send only needed fields.
- **Enterprise Architecture:** store judgments as fields in Salesforce; build a rules-only fallback.
- **Finance:** verify per-decision pricing; the payoff is rep time, not cash, unless it avoids a hire.
- **VP Global Partnerships:** a strong adapt-to-the-market story, but design a vendor-neutral layer with Jev as the first engine.
- **Partner Marketing:** add stated urgency and timeline as a signal.

## Round 2, think again: does the automation scale?

- **Forward-Deployed AI:** compute is not the constraint; people are.
- **GTM Operations:** at ten times Year-1 volume a fixed hot line produces about 140 same-day calls a week; route by capacity instead (top N per rep per day).
- **GTM Analytics:** guard quality with a human-review rate at or under 10%, a random 5% weekly audit and weekly calibration.
- **Enterprise Architecture:** event-driven, idempotent scoring written to Salesforce; batch work on the scheduler; rules-only fallback.
- **Finance:** cost scales with events; set a monthly spend cap on the judgment API.
- **Security and Privacy:** minimal fields and retention limits; audit a sample rather than everything.
- **Partner Field:** hot leads always get a fast human call; approve.
- **VP Global Partnerships:** per-send human approval is the bottleneck at scale; changing that guardrail is Tony's explicit call.

## Conflicts and tradeoffs

Automation speed versus human judgment; vendor innovation versus concentration risk; the founding "a person approves every state change" guardrail versus volume at scale.

## Decisions (approved by Tony Gilharry, 2026-09-25)

- **68:** the intent score (application 30, meeting 20, stated timeline 20 by typed judgment, events up to 20, visits and content up to 10; deal in hand is urgent; 30-day half-life).
- **69:** a vendor-neutral typed-decision layer with Jev as the first engine; live in build 3; conditions: rules-only fallback, logged confidence, calibration, vendor and privacy review, pricing check.
- **70:** capacity-aware routing (N = 8 per rep per day to start), event-driven scoring, tiered human in the loop, quality guards, monthly spend cap.
- **71:** a person approves every AI send in Year 1 and the demo; policy-level approval only at scale and only by a new explicit decision from Tony.

## Actions and next gate

| Action | Owner | Due | Evidence |
|---|---|---|---|
| Update `03-partner-profile.md` | Claude | Sep 25 | Committed |
| Add partner-lead judgment fields to the Year-1 data | Claude | Oct 1 | Data dictionary |
| Vendor and privacy review of TypeSafe | Tony | Before any real data | Review notes |
| Prototype one typed judgment on synthetic applications | Build 3 | With Build 3 | Demo |
