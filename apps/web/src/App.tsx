import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Relatorio from "./pages/Relatorio";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/relatorio" element={<Relatorio />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
