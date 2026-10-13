import { BrowserRouter, Route, Routes } from "react-router"

import { Layout } from "./components/layout.tsx"
import { AgentsPage } from "./pages/agents.tsx"
import { ApiPage } from "./pages/api.tsx"
import { AreaPage, AreasPage } from "./pages/areas.tsx"
import { DataPage } from "./pages/data.tsx"
import { FlowPage, FlowsPage } from "./pages/flows.tsx"
import { MapPage } from "./pages/map.tsx"

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MapPage />} />
        <Route path="areas" element={<AreasPage />} />
        <Route path="areas/:id" element={<AreaPage />} />
        <Route path="api" element={<ApiPage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="flows" element={<FlowsPage />} />
        <Route path="flows/:id" element={<FlowPage />} />
        <Route path="*" element={<MapPage />} />
      </Route>
    </Routes>
  </BrowserRouter>
)
