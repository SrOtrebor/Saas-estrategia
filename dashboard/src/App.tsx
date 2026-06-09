import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import TemplateManager from './pages/TemplateManager';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/templates" element={<TemplateManager />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
