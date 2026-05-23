router_path = ENV['MIRROR_NEURON_ROUTER_PATH'] ||
              File.expand_path('lib/mirror_neuron/api/router.ex', ENV.fetch('MIRROR_NEURON_CORE_DIR'))
content = File.read(router_path)
content.sub!(/manifest ->\n\s*case MirrorNeuron.run_manifest\(manifest\) do/, <<~ELIXIR)
      manifest ->
        input = if manifest["_bundle_path"], do: manifest["_bundle_path"], else: manifest
        case MirrorNeuron.run_manifest(input) do
ELIXIR

File.write(router_path, content)
