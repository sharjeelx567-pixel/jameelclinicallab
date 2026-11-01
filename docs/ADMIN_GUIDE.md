# Administrator guide

## Daily workflow

1. **Reception**: Patients → *Register patient*. The system warns when the CNIC, or the mobile number plus name, matches an existing record. Open the existing record instead of creating a duplicate. Then Orders → *New order*: choose tests (prices come from the server, including panel rates), apply an authorised discount, and record any advance payment. Print the receipt and **sample labels** from the order page.
2. **Collection**: Samples → *To collect* → **Collect** (location and condition are recorded). Scanning a label barcode into the scan box finds the sample.
3. **Laboratory**: **Receive** → **Accept**, or **Reject** with a reason. Rejection automatically queues a replacement sample for recollection.
4. **Results**: Result entry → open a test → enter values. Flags preview as you type, and the server computes the final flags from **approved** ranges. *Save draft* or *Submit for verification*.
5. **Verification** (pathologist): Verification queue (critical results first) → review against ranges and previous results → **Approve**, **Request correction** or **Reject (re-test)**. You cannot approve a result you entered yourself.
6. **Reports**: from the order, *Generate final report* (or an *interim* report if some tests are pending). Open the report to **Print** or **Download PDF**. Every print is logged.
7. **Amendments**: open an approved result → *Amend result* (reason required). Re-enter, submit and re-verify, then generate the amended report. The earlier report is marked *superseded*, and the earlier version stays in history.
8. **Billing**: record payments only when money is received. Card and bank payments need a reference. Refunds need a reason and the `billing.refund` permission. Billing → *Daily cash summary* is used for end-of-day reconciliation.

## Critical results

When a critical value is verified, a **critical** notification is raised for result viewers. Inform the referring clinician within the configured window, then press **Acknowledge (clinician informed)** in Notifications. The acknowledgement is audited.

## Test catalogue and reference ranges

- Lab administrators can add tests, parameters, units, prices and analyzer codes.
- Reference ranges (by sex and age band) and critical limits are entered as **drafts**. A user with *Approve reference ranges* (pathologist by default) must approve each one. Editing an approved range returns it to draft.
- Until a range is approved, results show "No range" and reports print "Not established".

## Staff and permissions

Staff & roles → *Add staff* creates the login. Use *Roles & permissions* to adjust what each role can do. Changes apply within seconds and are audited. Disabling an account signs that person out immediately.

## Settings

Laboratory profile and logo, branches and collection centres, patient categories, maximum discount, self-verification policy, critical-result window, inventory alert thresholds, label size, report footer, retention targets.

## Analyzers

See [ANALYZER_INTEGRATION.md](ANALYZER_INTEGRATION.md). Never mark an analyzer *Verified* without completing the validation procedure.
