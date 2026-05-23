router_path = ENV['MIRROR_NEURON_ROUTER_PATH'] ||
              File.expand_path('lib/mirror_neuron/api/router.ex', ENV.fetch('MIRROR_NEURON_CORE_DIR'))
content = File.read(router_path)

# 1. Add multipart to Plug.Parsers
content.sub!(/parsers: \[:json\],/, "parsers: [:json, :multipart],\n    length: 50_000_000,")

# 2. Add pause and resume endpoints
pause_resume = <<~ELIXIR
  # Pause Job
  post "/api/v1/jobs/:job_id/pause" do
    case MirrorNeuron.pause(job_id) do
      :ok ->
        send_json(conn, 200, %{status: "paused", job_id: job_id})
      {:error, reason} ->
        handle_job_error(conn, reason)
    end
  end

  # Resume Job
  post "/api/v1/jobs/:job_id/resume" do
    case MirrorNeuron.resume(job_id) do
      :ok ->
        send_json(conn, 200, %{status: "resumed", job_id: job_id})
      {:error, reason} ->
        handle_job_error(conn, reason)
    end
  end
ELIXIR

content.sub!(/# Stop\/Cancel Job/, pause_resume + "\n  # Stop/Cancel Job")

# 3. Add bundle upload endpoint
bundle_upload = <<~ELIXIR
  # Upload and Validate Bundle
  post "/api/v1/bundles/upload" do
    case conn.body_params["bundle"] do
      %Plug.Upload{path: tmp_path, filename: filename} ->
        # Create a unique directory for extraction
        bundle_id = Base.encode16(:crypto.strong_rand_bytes(8), case: :lower)
        target_dir = Path.join(System.tmp_dir!(), "mn_bundle_\#{bundle_id}")
        File.mkdir_p!(target_dir)

        # Unzip
        case :zip.extract(to_charlist(tmp_path), cwd: to_charlist(target_dir)) do
          {:ok, _} ->
            # Let's check if there is a root folder inside the zip
            # If manifest.json is directly inside or inside a subfolder
            manifest_path = Path.join(target_dir, "manifest.json")
            real_target_dir =
              if File.exists?(manifest_path) do
                target_dir
              else
                # Try to find a subfolder
                case File.ls!(target_dir) do
                  [subfolder] ->
                    subpath = Path.join(target_dir, subfolder)
                    if File.dir?(subpath) and File.exists?(Path.join(subpath, "manifest.json")) do
                      subpath
                    else
                      target_dir
                    end
                  _ -> target_dir
                end
              end

            # Validate using JobBundle
            case MirrorNeuron.JobBundle.load(real_target_dir) do
              {:ok, bundle} ->
                send_json(conn, 200, %{bundle_path: real_target_dir, manifest: bundle.manifest})
              {:error, reason} ->
                File.rm_rf!(target_dir)
                send_error(conn, 400, "Invalid bundle: \#{inspect(reason)}")
            end

          {:error, reason} ->
            File.rm_rf!(target_dir)
            send_error(conn, 400, "Failed to unzip: \#{inspect(reason)}")
        end

      _ ->
        send_error(conn, 400, "Missing 'bundle' file upload")
    end
  end
ELIXIR

content.sub!(/# Create Job/, bundle_upload + "\n  # Create Job")

File.write(router_path, content)
