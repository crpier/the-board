# ADR 0001 - Caller-Optimized Public Feed Data Interface

Date: 2026-04-09
Status: accepted

## Context

The public feed route currently assembles its data path directly from several layers:

- Convex query definitions in `convex/`
- Convex HTTP prefetch for SSR
- live Convex subscriptions for client updates
- SolidStart route data loading
- route-level loading and empty-state decisions

That makes the `/` route responsible for both page behavior and transport details. Understanding or changing the public feed requires following the seam between SSR prefetch, hydration, live updates, and backend query wiring.

## Decision

The public feed should move toward a caller-optimized interface centered on the route's primary use case.

The preferred interface shape is a page-facing module with a small API, such as `usePublicFeed()`, that hides:

- SSR preload wiring
- the handoff from SSR data to live client data
- Convex transport setup
- the concrete backend query reference for the public feed

Internally, that module may still use a narrower port or adapter boundary, but callers should depend on a route-shaped interface rather than assembling the transport stack themselves.

## Consequences

- The `/` route can become page-focused instead of transport-focused.
- Public feed behavior becomes easier to test at one boundary.
- SSR and live-update policy for the feed can evolve without forcing route churn.
- The abstraction is intentionally opinionated toward the common caller and may need explicit escape hatches if later pages need different feed behavior.
