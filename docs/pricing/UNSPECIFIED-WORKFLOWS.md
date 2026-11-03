# Pricing lock-in and document write follow-ups

Recorded October 26, 2026 from the user's clarification. These are known missing workflows, not implemented capabilities. The user asked to complete and deploy everything else while documenting them.

The supplied `Agent_Pricing_Engine_Developer_Handoff(1).docx` has identical document content to the original handoff used for the specification. Its twelve sections define the transportation calculation, backend configuration and internal display. They do not define a sales rep acceptance submission or final document field write. Section 12 explicitly excludes quote/contract generation and ancillary fees.

## Sales rep lock-in submission

The user described a necessary form submission where a Sales rep locks in a number. Before implementation, define:

- Which number is accepted: final rate per CF, billable CF, transportation price, or another quote amount; whether the rep may override it.
- The exact form/action and eligible Extension User roles.
- Which service owns the accepted record, its job identity, input/revision snapshot and audit trail.
- Whether subsequent rate publication or input changes invalidate acceptance, require reconfirmation, or preserve the accepted amount.
- Confirmation, duplicate/retry handling, authorization revocation, correction and cancellation behavior.

Current behavior calculates through Operations and displays/copies a result. It does not accept, lock, submit or persist a quote. Reopening the extension does not recover an accepted price.

## Final cubic feet or total price written to the document

The user described writing final cubic feet or final total price into a document. Before implementation, define:

- The destination document/form and verified target field(s), including whether this is Granot form data, generated contract content or another output.
- Whether cubic feet means actual volume or minimum-adjusted billable volume. A 75 CF move currently prices at 300 billable CF; those values must never be silently exchanged.
- Whether total price means transportation only or the full quote. This calculator excludes ancillary fees, discounts, deposits and Binding Estimate Fee.
- Whether to write a rate, total, volume or multiple values, and how Granot's own recalculation interacts with them.
- Whether the action only fills fields or also saves/submits, and the overwrite/confirmation rules, role permissions, stale-input checks and failure recovery.

Current behavior does not write Granot `I1PERCFLBS`, `I1TOTAL`, ancillary charges, generated documents or submit buttons. Read/display/copy remains available once approved rates are configured and calculations enabled. Existing Tariff Adjustment and Binding Estimate Fee behavior remains separate.

These decisions do not alter the implemented server calculation formula. Once agreed, implement acceptance in its owning server and keep the extension as an authorized adapter; do not duplicate pricing policy in page scripts.
