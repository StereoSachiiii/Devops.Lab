package sandbox

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/docker/docker/client"
)

// GVisorProvider wraps the DockerProvider but forces the use of the runsc runtime.
type GVisorProvider struct {
	*DockerProvider
}

// NewGVisorProvider verifies that the runsc runtime is available on the Docker daemon,
// and returns a provider that enforces its use. Returns an error if not found.
func NewGVisorProvider(networkMode string, memoryMB int, maxCPUs float64, log *slog.Logger) (*GVisorProvider, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("gvisor: client init failed: %w", err)
	}

	info, err := cli.Info(context.Background())
	if err != nil {
		return nil, fmt.Errorf("gvisor: failed to query docker info: %w", err)
	}

	if _, ok := info.Runtimes["runsc"]; !ok {
		return nil, fmt.Errorf("gvisor: secure runtime 'runsc' not found in docker daemon runtimes")
	}

	log.Info("gVisor runtime 'runsc' verified and locked in")

	dp, err := newDockerProviderWithRuntime(networkMode, memoryMB, maxCPUs, "runsc", log)
	if err != nil {
		return nil, err
	}

	return &GVisorProvider{DockerProvider: dp}, nil
}
