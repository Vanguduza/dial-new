# Operational / Provider Application Surface Plan

Customer apps do not replace provider/operator tools.

| Surface | Primary users | Direction |
|---|---|---|
| Technician Android | field technicians | native Compose, offline-first, camera/evidence, job safety, Bluetooth where needed |
| Courier Android | couriers | native Compose, DIAL Delivery SoR, MapLibre, POD/COD/custody |
| Supplier/Merchant Web | Spare suppliers, grocery merchants | Mercur vendor patterns where useful, DIAL supplier/order/settlement projections |
| Grocery Shopper | DIAL shopper | task/pick/substitution/receipt/handoff workflow; native/PWA according to field validation |
| Laundry Facility | intake/production/QC staff | tablet/web queue-first facility workflow |
| Warehouse Android | internal corporate WMS | barcode/QR, offline-safe movement/count workflow |
| Staff Web | employees/managers | ESS, leave, payroll docs, expense, onboarding/actions |
| DIAL Business | B2B customers | Fleet/Projects/org activity/approvals/support |
| Command Centre | DIAL operators/leaders | complete read/decision/control plane |
| Dial Health provider surfaces | clinicians/pharmacies/facilities | governed by ZHOTN specialist architecture |

All surfaces use the same domain APIs/events; they do not own parallel business state.
