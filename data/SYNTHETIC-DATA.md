# Fork synthetic demo data policy

Paarth approved plausible fictional project data on 2026-10-24 after consulting the Toyota representative. This supersedes earlier requirements to wait for real listings and sample VINs. This is a hackathon demo, not an advertisement or a factual report about a particular car or person.

- Fictional listings, VINs, mileage, prices, paint, driver and finance records use source `synthetic` and a disclosure. Never claim they were scraped, captured from CarMax, or verified through NHTSA. Listing `capturedOn` records the demo snapshot date, not the date of a real dealer advertisement.
- A synthetic VIN is a demo lookup key shaped like a VIN, with a valid check digit. It is not known to be assigned to a vehicle. Do not send registered demo keys to NHTSA; registry lookup comes first. Real user-entered, unregistered VINs may use the decoder with the normal timeout and honest failure state.
- Keep the existing sourced EPA MPG facts and labels; do not relabel fictional prices or cargo figures as EPA data. RAV4 EPA zero cargo means unreported. Fuel costs remain deterministic computations using the driver's inputs, not EPA's default cost figure.
- Paint names, codes and hexes in the synthetic listing describe the desired demo appearance. They are not claims of official Toyota colorimetry or proof that a supplied mesh matches.
- Numeric vehicle assumptions may be synthetic for the demo. Future C3 spec sheets must keep a source label and source string for each value. The present C0 spec fixtures remain illustrative integration data until replaced.
- Actual assets still require Kareem's review. `exact` describes a model's visual match, never the authenticity of a listing or VIN. Model, year, trim, paint and geometry must all be explicitly verified, and matching asset metadata must be present. Until then use `representative`; unknown models stay `unsupported` during identification.
- A user-confirmed swatch may enable a representative view for an unsupported VIN. It never verifies the real paint or promotes the vehicle to exact. Missing required specs stay missing instead of making a half-valid twin.
- Synthetic data permission does not change the AI confirmation gate, ownership boundaries, offline guarantee, or shared contracts.
