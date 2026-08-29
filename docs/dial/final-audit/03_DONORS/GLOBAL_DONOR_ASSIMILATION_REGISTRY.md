# Global Donor, Tool & Repository Assimilation Registry

| Capability | Donor/tool | Adoption | Key boundary |
|---|---|---|---|
| Spare storefront | Mercur B2C | PORT-WHOLESALE if cleared | replace auth/DB/payments/orders |
| Supplier portal | Mercur vendor panel | conditional PORT-WHOLESALE | DIAL supplier/catalogue/orders |
| Spare polish | Your Next Store/Nimara | REFERENCE/selective UX | no commerce SoR |
| Tech UI | **FixItNow — `Sachinrajawat/FixItNow`** | **PORT-WHOLESALE — MIT** | pin MIT publication revision; replace donor auth/DB/payments/jobs with DIAL contracts while preserving mature application/UI structure |
| Tech fallback | NearServe/Homezy | REFERENCE | DIAL-native |
| Android shopping | CoolMallKotlin | conditional PORT-WHOLESALE | DIAL APIs |
| Technician app | Now in Android | REFERENCE architecture | DIAL job SoR |
| Courier app | foodhub-compose rider | conditional wholesale | Delivery SoR |
| Promotions | Medusa Promotion + OfferKit | PORT-ALGORITHM-ENGINE | Pricing authority |
| Fitment/PIM | SandPIM / ACES/PIES | REFERENCE | Catalogue authority |
| Vehicle history | LubeLogger | PORT-SCHEMA-WORKFLOW + UX reference | Hub/Fleet authority |
| Fleet telematics | OpenRemote Fleet | INTEGRATE-SERVICE candidate | observation only |
| Grocery | Instacart | BEHAVIOR/UX REFERENCE | Groceries authority |
| Grocery local | SPAR/OK Zimbabwe | REFERENCE | no runtime |
| Grocery WMS | Sentry WMS | REFERENCE until exact repo/licence pinned | DIAL WMS |
| Laundry | Laundryheap/Rinse | BEHAVIOR/UX REFERENCE | Laundry authority |
| Laundry operator | CleanCloud/Cents | BEHAVIOR/UX REFERENCE | Laundry authority |
| HR/payroll | Frappe HR | WHOLESALE-QUARANTINE + schema/workflow/algorithm/UX ports | DIAL People/Payroll |
| Finance/procurement/assets | ERPNext | WHOLESALE-QUARANTINE + selected ports | DIAL Ledger/Finance |
| ERP cross-check | Odoo | REFERENCE + selective schema/workflow | no runtime |
| Corporate WMS | InvenTree | WHOLESALE-QUARANTINE + selected modules/algorithms | DIAL Inventory |
| Asset custody | Snipe-IT | schema/workflow + UX | DIAL Assets |
| ITSM | GLPI | schema/workflow + UX | DIAL Corporate IT |
| Endpoint inventory | GLPI Agent | INTEGRATE-SERVICE | observations only |
| Records UX | Paperless-ngx | REFERENCE + UX | DIAL Records |
| OCR | OCRmyPDF/Tesseract | INTEGRATE-SERVICE | processing only |
| Extraction | Apache Tika | INTEGRATE-SERVICE | processing only |
| E-sign | Documenso | INTEGRATE-SERVICE + embedded UX | DIAL Contract |
| GRC | Eramba | PORT-SCHEMA-WORKFLOW + UX | DIAL GRC |
| Portfolio | OpenProject | PORT-SCHEMA-WORKFLOW + UX | DIAL Strategy |
| DoA/SoD evaluation | OPA | INTEGRATE-SERVICE | DIAL facts/outcomes |
| Search | Meilisearch | INTEGRATE-SERVICE | projection |
| Workflow | Temporal | INTEGRATE-SERVICE | execution only |
| Queues | BullMQ | LIBRARY | async |
| Slots | Cal.com | INTEGRATE-SERVICE adapter | slot refs only |
| Support | Chatwoot | INTEGRATE-SERVICE | conversations only |
| Surveys | Formbricks | INTEGRATE-SERVICE | outcomes input |
| Analytics/flags | PostHog | INTEGRATE-SERVICE | analytics |
| BI | Metabase | INTEGRATE-SERVICE | read-only BI |
| Observability | OTel/Prometheus/Loki/Tempo/Grafana | INTEGRATE-SERVICE | telemetry |
| Automation | n8n | INTEGRATE-SERVICE | non-authoritative |
| Maps/routing | MapLibre/Nominatim/OSRM/VROOM | library/services | no delivery state |
| Dispatch logic | AWS Last Mile Hyperlocal | PORT-ALGORITHM-ENGINE | Delivery |
| Command UI | Studio Admin | WHOLESALE-QUARANTINE + PORT-UX-UI | DIAL design system |
| UI primitives | shadcn/ui | PORT-SELECTED-MODULE | presentation |
| Dense admin | shadcn-admin | REFERENCE/UX | presentation |
| Analytics UI | Tremor Raw | selected component port | presentation |
| Admin plumbing | Refine Core | LIBRARY | no business/visual authority |
| AI gateway/evals | LiteLLM/Promptfoo/Langfuse | service/library | no business authority |
| Dial Health specialist product logic | ZHOTN-authoritative donor sets | QDRS REFERENCE / CONFORMANCE / retained commodity infrastructure by health module | Dial Health bounded contexts remain health-domain authority |

## FixItNow source and licence control

The previous quarantine was caused by the licence ambiguity of the earlier `AyanSujon/FixItNow` publication. The same FixItNow project is now available as **`Sachinrajawat/FixItNow` under the MIT License**.

Final classification:

```text
Donor: Sachinrajawat/FixItNow
Role: primary Dial a Tech application donor
Adoption: PORT-WHOLESALE
Licence: MIT
Licence gate: VERIFIED_COMPATIBLE at the published MIT source; re-verify/pin the exact selected commit during import
```

The wholesale-port engineering rules remain unchanged:
- import into controlled `/imports`;
- pin commit and MIT notice;
- generate SBOM and security/dependency scans;
- map routes/components/state/workflows;
- replace donor identity/auth, Mongo/data authority, payment and job/order SoRs with DIAL contracts;
- preserve mature UI/application structure where valuable;
- add missing DIAL Opportunity Marketplace, safety, Job Reserve, WHT, evidence, RCE and Command Centre requirements;
- prove donor parity plus DIAL cross-domain integration.

The old missing-licence quarantine is no longer a Tech implementation blocker.
