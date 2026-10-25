# Readable admin and account presentation

25 October 2026. The owner requested a minimalist admin and removal of raw database/Clerk identifiers from visible screens. The screenshot's UUID-bearing inquiry names came from disposable test data, not an inquiry ID column; those records are removed after testing, and the focused abuse harness now uses readable test names and subjects.

Admin role rows now display Clerk names and verified emails. The role-list route first requires `staff.manage`, then makes one bounded Clerk lookup for the returned page's subjects (at most 50). It exposes only name/email presentation data to that authorized caller, with an honest unavailable fallback. Names and emails never grant permissions: role mutations still re-resolve the exact verified email, bind the opaque subject and enforce expected versions/protected-owner rules. Responses stay private and uncached.

Raw role subjects, selected-subject copy, staff-note actor IDs and numeric price/stock/role versions are removed from visible/accessible labels. Record/category/media selector fallbacks are readable, and capability/status copy uses plain language. Internal IDs, expected versions, audit records, routes and ownership checks remain intact. No arbitrary content is hidden with UUID-matching CSS or rewritten in the database.

The customer account components already render names, emails, filenames, contact details and address labels; their IDs are internal React keys, API arguments or state. Root verifies the real dashboard and Clerk settings in the built-in browser. Contact success now shows simple confirmation while keeping the internal receipt for API idempotency.

This is presentation cleanup, not removal of identifiers from network responses, internal resource URLs, audit history or authentication internals. These identifiers remain necessary and are protected by existing authorization. No owner profile, address, session or role change is part of this cleanup. See [verification](verification/admin-presentation.json).
