import CreatePage from "./pages/CreatePage";
import DashboardPage from "./pages/DashboardPage";
import LinkPage from "./pages/LinkPage";

/** Two public entry points; the dashboard is reached only by choice. */
export default function App() {
  const path = window.location.pathname;
  if (path === "/dashboard" || path.startsWith("/dashboard/")) return <DashboardPage />;
  const match = path.match(/^\/p\/([^/]+)\/?$/);
  if (match) return <LinkPage slug={decodeURIComponent(match[1])} />;
  return <CreatePage />;
}
