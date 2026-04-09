import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./app.css";
import { ConvexProvider } from "~/lib/convex-solid";
import { convex } from "~/lib/convex";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>SolidStart - Basic</Title>
          <a href="/">Index</a>
          <a href="/about">About</a>
          <ConvexProvider client={convex}>
            <Suspense>{props.children}</Suspense>
          </ConvexProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
