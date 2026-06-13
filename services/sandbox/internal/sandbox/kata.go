package sandbox

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/docker/docker/client"
)

// KataProvider wraps the DockerProvider but forces the use of a Kata Containers runtime.
type KataProvider struct {
	*DockerProvider
}

// NewKataProvider verifies that a Kata runtime is available on the Docker daemon,
// and returns a provider that enforces its use. Returns an error if not found.
func NewKataProvider(networkMode string, memoryMB int, maxCPUs float64, log *slog.Logger) (*KataProvider, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("kata: client init failed: %w", err)
	}

	info, err := cli.Info(context.Background())
	if err != nil {
		return nil, fmt.Errorf("kata: failed to query docker info: %w", err)
	}

	runtime := ""
	if _, ok := info.Runtimes["kata-fc"]; ok {
		runtime = "kata-fc"
		log.Info("Kata Containers runtime 'kata-fc' verified and locked in")
	} else if _, ok := info.Runtimes["kata-qemu"]; ok {
		runtime = "kata-qemu"
		log.Info("Kata Containers runtime 'kata-qemu' verified and locked in")
	} else {
		return nil, fmt.Errorf("kata: secure runtime (kata-fc or kata-qemu) not found in docker daemon runtimes")
	}

	dp, err := newDockerProviderWithRuntime(networkMode, memoryMB, maxCPUs, runtime, log)
	if err != nil {
		return nil, err
	}

	return &KataProvider{DockerProvider: dp}, nil
}
