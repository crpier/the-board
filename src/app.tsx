import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./app.css";
import { ConvexProvider } from "~/lib/convex-solid";
import { convex } from "~/lib/convex";
import { ConvexAuthProvider } from "./lib/convex-auth-solid";
import Navbar from "~/components/Navbar";
import { UndoToastHost } from "~/components/UndoToastHost";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>the-board</Title>
          <ConvexProvider client={convex}>
            <ConvexAuthProvider client={convex}>
              <Navbar />
              <Suspense>{props.children}</Suspense>
              {/* Above the router's children so a delete-triggered navigation
                  (meme detail -> home) doesn't unmount the undo toast. */}
              <UndoToastHost />
            </ConvexAuthProvider>
          </ConvexProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
