import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import Runs from './pages/Jobs';
import JobDetails from './pages/JobDetails';
import StableJobs from './pages/StableJobs';
import StableJobDetails from './pages/StableJobDetails';
import Models from './pages/Models';
import RunJob from './pages/RunJob';
import JobUi from './pages/JobUi';
import NotFound from './pages/NotFound';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { ConfirmActionDialogHost } from './components/ui/confirm-action-dialog';

function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <ErrorBoundary fallbackTitle="Something went wrong loading the application.">
        <Routes>
          <Route path="/jobs/:jobId/ui" element={<ErrorBoundary><JobUi /></ErrorBoundary>} />
          <Route path="/" element={<Layout />}>
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="jobs" element={<ErrorBoundary><StableJobs /></ErrorBoundary>} />
            <Route path="jobs/:jobId" element={<ErrorBoundary><StableJobDetails /></ErrorBoundary>} />
            <Route path="runs" element={<ErrorBoundary><Runs /></ErrorBoundary>} />
            <Route path="runs/:id" element={<ErrorBoundary><JobDetails /></ErrorBoundary>} />
            <Route path="models" element={<ErrorBoundary><Models /></ErrorBoundary>} />
            <Route path="run" element={<ErrorBoundary><RunJob /></ErrorBoundary>} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
      <ConfirmActionDialogHost />
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
