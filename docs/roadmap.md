# Planner roadmap

## In progress

- **Route consistency.** Share each leg's track between the map and pass
  timing, check the track against known spans and named passages, and stop
  the itinerary at the last reachable harbour. See
  [ADR 0004](adr/0004-consistent-route-tracks.md).

## Next options

| Priority | Option | First deliverable |
| --- | --- | --- |
| 1 | [First-day destination suggestions](https://github.com/ivanoats/salish-nav-planner/issues/26) | Rank reachable first stops by hours, speed, mast height and available wind. Explain the ranking and retain manual selection. |
| 2 | Data and deployment review | Trace which route and location data the hosted app delivers to browsers. Document the client data contract and decide how to handle redistribution before expanding coverage. |
| 3 | [Sharing](https://github.com/ivanoats/salish-nav-planner/issues/27) | Try Copy link on mobile and check that the itinerary survives a round trip. Use the results to decide whether native sharing or shorter links are worth adding. |
| 4 | [Verdant visual design](https://github.com/ivanoats/salish-nav-planner/issues/44) | Pilot Verdant tokens on trip controls and the itinerary, then review the map, accessibility and mobile layout. |
