import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import RunList from "./pages/runs/RunList";
import RunDetails from "./pages/runs/RunDetails";
import JobList from "./pages/jobs/JobList";
import JobDetails from "./pages/jobs/JobDetails";
import Models from "./pages/Models";
import StartRun from "./pages/runs/StartRun";
import JobUi from "./pages/jobs/JobUi";
import NotFound from "./pages/NotFound";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { ConfirmActionDialogHost } from "./components/ui/confirm-action-dialog";

function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <ErrorBoundary fallbackTitle="Something went wrong loading the application.">
        <Routes>
          <Route
            path="/jobs/:jobId/ui"
            element={
              <ErrorBoundary>
                <JobUi />
              </ErrorBoundary>
            }
          />
          <Route path="/" element={<Layout />}>
            <Route
              index
              element={
                <ErrorBoundary>
                  <Dashboard />
                </ErrorBoundary>
              }
            />
            <Route
              path="jobs"
              element={
                <ErrorBoundary>
                  <JobList />
                </ErrorBoundary>
              }
            />
            <Route
              path="jobs/:jobId"
              element={
                <ErrorBoundary>
                  <JobDetails />
                </ErrorBoundary>
              }
            />
            <Route
              path="runs"
              element={
                <ErrorBoundary>
                  <RunList />
                </ErrorBoundary>
              }
            />
            <Route
              path="runs/:id"
              element={
                <ErrorBoundary>
                  <RunDetails />
                </ErrorBoundary>
              }
            />
            <Route
              path="models"
              element={
                <ErrorBoundary>
                  <Models />
                </ErrorBoundary>
              }
            />
            <Route
              path="run"
              element={
                <ErrorBoundary>
                  <StartRun />
                </ErrorBoundary>
              }
            />
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
