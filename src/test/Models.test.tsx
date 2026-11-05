import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Models from "../pages/Models";
import { benchmarkRuntimeModel, fetchRuntimeModels } from "../api";
import { TooltipProvider } from "../components/ui/tooltip";

vi.mock("../api", () => ({
  benchmarkRuntimeModel: vi.fn(),
  fetchRuntimeModels: vi.fn(),
}));

const renderModels = () =>
  render(
    <TooltipProvider>
      <Models />
    </TooltipProvider>,
  );

describe("Models Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists installed models and benchmarks one in a modal", async () => {
    vi.mocked(fetchRuntimeModels).mockResolvedValue({
      node: "mn1@local",
      runner_available: true,
      warnings: [],
      items: [
        {
          id: "nemotron-3.5-bolt-e4b:q4_k_m",
          name: "Nemotron 3.5 Bolt E4B Q4_K_M",
          provider: "docker_model_runner",
          model: "nemotron-3.5-bolt-e4b:q4_k_m",
          docker_model: "nemotron-3.5-bolt-e4b:q4_k_m",
          api_model: "nemotron-3.5-bolt-e4b:q4_k_m",
          backend: "llama.cpp",
          installed: true,
          node: "mn1@local",
          nodes: ["mn1@local"],
          used_by: ["personal_income_tax_expert"],
          owner_count: 1,
          orphaned: false,
          manual: false,
          compatibility: {
            status: "pass",
            ok: true,
            message: "ready",
            warnings: [],
          },
        },
        {
          id: "runtime-helper",
          name: "Runtime Helper",
          provider: "docker_model_runner",
          model: "ai/runtime-helper",
          docker_model: "ai/runtime-helper",
          api_model: "ai/runtime-helper",
          backend: "llama.cpp",
          installed: true,
          node: "mn1@local",
          nodes: ["mn1@local"],
          used_by: [],
          owner_count: 0,
          orphaned: false,
          manual: false,
          compatibility: {
            status: "pass",
            ok: true,
            message: "ready",
            warnings: [],
          },
        },
      ],
      next_page_token: null,
    });
    vi.mocked(benchmarkRuntimeModel).mockResolvedValue({
      model: "nemotron-3.5-bolt-e4b:q4_k_m",
      name: "Nemotron 3.5 Bolt E4B Q4_K_M",
      docker_model: "nemotron-3.5-bolt-e4b:q4_k_m",
      api_model: "nemotron-3.5-bolt-e4b:q4_k_m",
      node: "mn1@local",
      elapsed_ms: 1200,
      first_token_ms: 340,
      generated_tokens: 15,
      tokens_per_second: 12.5,
      sample: "Ready now.",
      estimated: true,
    });

    renderModels();

    expect(
      await screen.findByText("Nemotron 3.5 Bolt E4B Q4_K_M"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Nemotron 3.5 Bolt E4B Q4_K_M")).toHaveLength(1);
    expect(screen.queryByText("Installed Models")).not.toBeInTheDocument();
    expect(screen.queryByText("Blueprint-Owned")).not.toBeInTheDocument();
    expect(screen.queryByText("Orphaned")).not.toBeInTheDocument();
    expect(
      screen.queryByText("nemotron-3.5-bolt-e4b:q4_k_m"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("personal_income_tax_expert")).toBeInTheDocument();
    expect(screen.getByText("Not reported")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /install/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Benchmark Nemotron 3.5 Bolt E4B Q4_K_M",
      }),
    );

    await waitFor(() =>
      expect(benchmarkRuntimeModel).toHaveBeenCalledWith(
        "nemotron-3.5-bolt-e4b:q4_k_m",
      ),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /benchmark model/i,
    });
    expect(within(dialog).getByText("12.5 tok/s")).toBeInTheDocument();
    expect(within(dialog).getByText("340ms")).toBeInTheDocument();
    expect(within(dialog).getByText("Ready now.")).toBeInTheDocument();
  });

  it("shows an empty installed-state message without install controls", async () => {
    vi.mocked(fetchRuntimeModels).mockResolvedValue({
      node: "mn1@local",
      runner_available: true,
      warnings: [],
      items: [],
      next_page_token: null,
    });

    renderModels();

    expect(
      await screen.findByText(/No installed models yet/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /install/i }),
    ).not.toBeInTheDocument();
  });
});
