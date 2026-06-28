# ADR 0002 - Client-Side Rendering Over Server-Side Rendering

Date: 2026-05-04
Status: accepted

## Context

The project originally expected to use server-side rendering for the public feed. That direction made the first route more complex because it had to coordinate Convex HTTP prefetch, SolidStart server data APIs, hydration, and the live Convex client subscription path.

The app is intentionally small. Adding and deploying an additional server-rendering backend creates a large operational cost compared with the current product needs. The expected deployment model is simpler if Convex owns backend behavior and Cloudflare owns static hosting and media infrastructure.

## Decision

The app gives up on server-side rendering and uses client-side rendering instead.

SolidStart remains the frontend framework for now, but `ssr` is disabled. App routes should load application data from the client through Convex rather than using SolidStart server functions or server prefetching for page data.

This decision supersedes the SSR-specific parts of ADR 0001. The caller-optimized feed boundary remains useful, but it should now hide client-side Convex subscription details rather than an SSR-to-client handoff.

## Consequences

- Deployment stays simpler because the app does not require a separate server-rendering backend.
- Convex remains the backend boundary for application data and realtime updates.
- Cloudflare can remain the likely home for static frontend assets and media infrastructure.
- Initial page loads may show client-side loading states before Convex data arrives.
- Public route HTML will not contain fully rendered feed content for crawlers before JavaScript runs.
- Future route data work should avoid introducing server functions unless there is a concrete product or operational reason.
