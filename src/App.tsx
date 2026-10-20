import ErrorBoundary from "./ErrorBoundary";
import Home from "./Home";

export default function App() {
  return (
    <ErrorBoundary>
      <Home />
    </ErrorBoundary>
  );
}
