# EPC + Visual Parts Browsing — Customer UX Blueprint

## Spare entry modes

Customers may enter through:

1. text/part-number search;
2. vehicle category browse;
3. Garage/Vehicle Hub;
4. hero/exploded visual browse;
5. EPC hierarchy;
6. previous part/order;
7. guided support.

No one path is mandatory.

## Visual-first flow

`Garage → Vehicle → Explore parts → Hero → Explode → System → EPC assembly → Part → Offers`

The visual transition should feel premium, but after the first use customers must be able to skip directly to categories/EPC.

## Part panel

Every selected EPC/hotspot part panel should show, when available:

- part name;
- reference/part number;
- diagram callout;
- quantity;
- applicability;
- supersession;
- fitment confidence/source;
- available quality tiers/brands;
- supplier freshness;
- price/ETA;
- save/share;
- add/select offer;
- source it;
- ask DIAL.

## Mobile

- pinch/zoom diagram;
- large hotspot targets;
- bottom-sheet selected-part details;
- back-stack remembers system/group/assembly;
- animation is tap-initiated on data saver;
- static fallback always available.

## Support

"Ask DIAL about this part" opens support with:

```text
vehicle ref
VIN/chassis confidence
EPC provider/revision
system/group/assembly
diagram
hotspot/callout
part ref
selected supplier offers
fitment claims
```

The customer should never have to retype the part number after opening support.
