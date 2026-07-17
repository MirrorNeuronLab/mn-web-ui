import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import JobDetails from './pages/JobDetails';
import Models from './pages/Models';
import RunJob from './pages/RunJob';
import RunUi from './pages/RunUi';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { ConfirmActionDialogHost } from './components/ui/confirm-action-dialog';

function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:id" element={<JobDetails />} />
          <Route path="models" element={<Models />} />
          <Route path="runs/:runId/ui" element={<RunUi />} />
          <Route path="run" element={<RunJob />} />
        </Route>
      </Routes>
      <ConfirmActionDialogHost />
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
