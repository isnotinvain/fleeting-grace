import { HashRouter, Routes, Route } from "react-router-dom";
import { SetupPage } from "./pages/SetupPage";
import { ResultsPage } from "./pages/ResultsPage";
import { ExportPage } from "./pages/ExportPage";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<SetupPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/export/:ic" element={<ExportPage />} />
      </Routes>
    </HashRouter>
  );
}
