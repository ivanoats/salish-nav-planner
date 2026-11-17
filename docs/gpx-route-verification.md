# GPX route verification

[Issue #53][issue-53] requires separate checks for file fidelity and route
quality. Keep `ENABLE_GPX_EXPORT` unset in production while either check has a
release blocker.

## Format and import

Vitest checks UTF-8, GPX 1.1 schema validity, route-point order, stop names,
and all-or-nothing eligibility. The tests validate offline with `xmllint
--nonet` and the [Topografix XSD][topografix-xsd]. The [vendored
copy][vendored-copy] matches the [schema mirror][schema-mirror] at blob
`d9441f6b6967ccda2fcf672140cb1e71ebb2deca`. The Playwright spec checks the
downloaded bytes and compares every coordinate with the map after the final
destination changes.

For a review run, set `ENABLE_GPX_EXPORT=1` on the Next.js server and download
each eligible fixture. In OpenCPN, use **Route & Mark Manager → Import GPX**,
open each route's properties, and inspect its bends and daily endpoints at
chart scale. Export the imported routes from the same manager and compare day
count, ordered route points, names, and endpoint positions against the
original within 1 m. Record the version, platform, route point limit or tested
lower bound, and whether the app joins points directly or recalculates.
[OpenCPN import and export
instructions][opencpn-import-and-export-instructions]

On 2026-11-12, `xmllint` accepted the generated round trip, Active Pass,
Deception Pass, tall-mast detour, and 76-point Sidney → Bellingham files. GDAL
3.13.3 read the round trip as two routes with 30 points and the long file as
one route with 76 points. OpenCPN 5.14.0 on macOS could not start with an
isolated profile in the local environment. Its import, re-export, and point
limits are pending. Device compatibility is pending.

## Route benchmark fixtures

Initial review on 2026-11-12. Use one travel day per case except the explicit
round trip. Set wind-aware routing off, 6 kt, 3–8 hours per day, and departure
at 08:00 Pacific on 2026-11-12. The review vessel has 5 ft draft, requires 2
ft under-keel margin, and uses a 50 ft mast with a 3 ft air-draft margin
unless noted. Use chart datum for the first depth screen, then evaluate actual
tidal height and clearance datum at ETA.

| Case | Planner input and intended corridor | Expected warning or control |
| --- | --- | --- |
| Open water | Anacortes → Bellingham via the open-water approach to Bellingham Bay | Verify shoreline and marina entrances. Explain mileage deviation above 10%. |
| Tight turn | La Conner → Oak Harbor via the south approach of Swinomish Channel | Verify channel bends, charted shoals, and Rainbow Bridge clearance. An approximate leg must block GPX. |
| Dated pass | Cornet Bay → Port Townsend via Deception Pass | Compare ETA, direction, and speed with NOAA PUG1701, bin 33. Flag transit outside a benchmark window of absolute predicted current at most 2 kt. Record missed windows and timing error. |
| Bridge detour | Port Townsend → Port Ludlow, 60 ft mast, via open water around Marrowstone Island | Reject the fixed Port Townsend Canal span if charted clearance is below the 63 ft requirement. Compare with the shorter canal route at 50 ft and with a direct endpoint chord as a land-crossing control. |
| Canadian channel | Point Roberts → Montague Harbour via Active Pass | Verify the pass against CHS chart 3473 and adjacent cells for complete coverage. Check CHS station 07527 if measuring current. |
| Unreachable stop | Synthetic Playwright dataset, Anacortes → Friday Harbor with no graph edges to Friday Harbor | Identify Day 1 as unreachable and emit no file. |
| Round trip | Anacortes → Bellingham → Anacortes, two days, Round trip on | Preserve both day endpoints and the reverse passage. |
| Long import | Sidney → Bellingham | Check all 76 observed points on import and re-export. |

Chart references: [NOAA ENC][noaa-enc], [NOAA regional current
stations][noaa-regional-current-stations], [CHS chart 3473][chs-chart-3473]
(edition 2020-01-10, notice 2026-03-27), and [CHS Active Pass
currents][chs-active-pass-currents].

### Initial measurements

Distances are planner mileage and the sum of the GPX segment distances.
Independent charted distances, dock-to-water approaches, and depths, rocks,
spans, and timing at chart scale still need review. For each dated case, log
the station, independently estimated ETA, predicted current at both ETAs, and
whether the fixture's transit window is missed. Record the chart cell, edition
and update, datum, and applicable clearance at each vessel constraint.

| Case | Planner NM | GPX NM | Initial result |
| --- | ---: | ---: | --- |
| Open water | 15.90 | 18.87 | +18.7%. The Bellingham end intersects charted land in NOAA ENC US5WA1KR (edition 1/update 0). |
| Tight turn | 16.30 | — | The required La Conner → Oak Harbor leg resolved to approximate geometry. Export blocked. |
| Dated pass | 21.70 | 22.81 | +5.1%. Planner ETA at Deception Pass was 08:09 Pacific. Port Townsend approach intersects charted land in US5SEAMG (edition 1/update 0). The independent ETA and dated current comparison are pending. |
| Bridge detour | 35.10 | 46.63 | +32.8%. The 50 ft case used the canal at 12.90 NM and produced approximate geometry. The 60 ft case avoided the canal but the resulting route via Sandy Hook crosses charted land in US5SEAKL (edition 1/update 1). |
| Canadian channel | 18.40 | 18.72 | +1.7%. Independent CHS geometry, depth, and timing checks are pending. |

The preliminary shoreline screen intersected the full GPX polylines with the
`LNDARE` polygons from local NOAA ENCs using GDAL. It independently flagged
the direct detour chord in US5WA19M (edition 17/update 1). The detour's land
intersection in US5SEAKL runs from roughly 47.94544° N, 122.35630° W to
47.95570° N, 122.39360° W. NOAA cell US5WA17M (edition 22/update 0) shows the
same crossing. This segment belongs to `spur-sandy_hook` and appears in
multiple generated route edges. The screen also found smaller crossings near
Port Townsend and Bellingham.

Scraped data and geometry snapshot for the measured runs, recorded as SHA-256:

| File | SHA-256 |
| --- | --- |
| `locations.geojson` | `e3fe00cc812e29db7097c61a40f55807b9c68b6abe7ded1c7db45b35bd92014e` |
| `edges.json` | `ac5e5201ffb00597522fe67d634fcd86f66bef920f8de4a71af294150e86d0ed` |
| `salish-mesh.json` | `1d59c74b76262f287017e7716cf63105ea7738cb1d2a54d3607f9592ab08e92c` |

### Bridge detour recheck

On 2026-11-16, the rebuilt mesh used charted offshore planning points at
Cultus Bay and Point Hudson. The Sandy Hook harbour connection dropped from
3,053 m to 32 m. The Port Townsend departure cleared Point Hudson's south
breakwater. Both points must fall inside water cells when rebuilding the
mesh. The points represent approaches to the harbours.

The 60 ft case still routed Port Townsend → Sandy Hook → Port Ludlow,
with 35.10 NM in the planner and 34.14 NM along the track (GDAL, UTM zone
10N). Both legs used mesh geometry. NOAA ENC US5SEALG (edition 1/update 0)
charts the canal bridge at 17.6 m (57.7 ft), below the 63 ft requirement.
The detour avoided the bridge. The 50 ft control still chose the 12.90 NM
canal route and used approximate geometry for its canal leg.

GDAL 3.13.3 intersected the full 60 ft track with the NOAA ENC features. The
11 detailed cells covered the entire line. The track intersected no land
(`LNDARE`), shoreline construction (`SLCONS`), bridge, rock, wreck, or
obstruction features. Depth and dredged areas covered the full track. The
lowest area depth bound was 5.4 m at chart datum in US5SEAJH, above the
7 ft benchmark. The direct endpoint chord still intersected charted land.
The cells used for the detour were US5SEAJH (edition 1/update 2)
and US5SEAJJ, US5SEAJK, US5SEAKH, US5SEAKI, US5SEAKJ, US5SEAKK, US5SEALH,
US5SEALI, US5SEAMG, and US5SEAMH (edition 1/update 0).

The same scraped dataset was used for the recheck. The rebuilt mesh SHA-256
is `a4f417df22a355062883f4853e857b615d16fe80e9667d2cb24a5ed85ef8338b`.
Production export stays disabled while the other route and importer checks
are pending.

[issue-53]: https://github.com/ivanoats/salish-nav-planner/issues/53
[topografix-xsd]: https://www.topografix.com/GPX/1/1/gpx.xsd
[vendored-copy]: ../src/application/__tests__/fixtures/gpx-1.1.xsd
[schema-mirror]: https://github.com/GIScience/osmgpxfilter/blob/master/resources/gpx-1.1.xsd
[opencpn-import-and-export-instructions]: https://opencpn.org/wiki/dokuwiki/doku.php?id=opencpn%3Amanual_basic%3Aroute_manager%3Anavigation_sharing
[noaa-enc]: https://nauticalcharts.noaa.gov/charts/noaa-enc.html
[noaa-regional-current-stations]: https://tidesandcurrents.noaa.gov/noaacurrents/stations?g=698
[chs-chart-3473]: https://charts.gc.ca/charts-cartes/charts-cartes-eng.asp?num=3473
[chs-active-pass-currents]: https://www.tides.gc.ca/en/stations/07527/currents
