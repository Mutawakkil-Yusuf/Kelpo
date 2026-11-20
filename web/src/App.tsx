import CreatePage from "./pages/CreatePage";
import LinkPage from "./pages/LinkPage";

/** Minimal router: /p/:slug is the client view, everything else is the create flow. */
export default function App() {
  const match = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (match) return <LinkPage slug={decodeURIComponent(match[1])} />;
  return <CreatePage />;
}
