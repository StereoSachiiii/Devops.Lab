package sandbox

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	dtypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

// DockerProvider implements SandboxProvider using the Docker Engine API.
type DockerProvider struct {
	client      *client.Client
	networkMode string
	memoryBytes int64
	nanoCPUs    int64
	runtime     string
	log         *slog.Logger
}

// NewDockerProvider connects to the local Docker daemon and returns a provider
// that uses the standard (insecure) runc runtime.
func NewDockerProvider(networkMode string, memoryMB int, maxCPUs float64, log *slog.Logger) (*DockerProvider, error) {
	return newDockerProviderWithRuntime(networkMode, memoryMB, maxCPUs, "", log)
}

// newDockerProviderWithRuntime connects to the local Docker daemon and uses the specified runtime.
// Used internally by explicit providers (like kata.go, gvisor.go).
func newDockerProviderWithRuntime(networkMode string, memoryMB int, maxCPUs float64, runtime string, log *slog.Logger) (*DockerProvider, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("docker: client init failed: %w", err)
	}

	return &DockerProvider{
		client:      cli,
		networkMode: networkMode,
		memoryBytes: int64(memoryMB) * 1024 * 1024,
		nanoCPUs:    int64(maxCPUs * 1_000_000_000),
		runtime:     runtime,
		log:         log,
	}, nil
}

// Provision creates a container from the challenge image and starts it.
// The container runs `sleep infinity` — it stays alive until Remove() is called.
// Labels are added so the reaper can identify orphaned containers on restart.
func (d *DockerProvider) Provision(ctx context.Context, imageName string) (string, error) {
	if err := d.ensureImage(ctx, imageName); err != nil {
		return "", fmt.Errorf("docker: image pull failed: %w", err)
	}

	resp, err := d.client.ContainerCreate(ctx, &container.Config{
		Image: imageName,
		Cmd:   []string{"sleep", "infinity"}, // stays alive waiting for exec
		Labels: map[string]string{
			"managed-by": "devops-platform-sandbox",
		},
		NetworkDisabled: true,
	}, &container.HostConfig{
		Runtime:        d.runtime,
		NetworkMode:    container.NetworkMode(d.networkMode),
		ReadonlyRootfs: false, // lab environments need a writable FS
		AutoRemove:     false,
		Resources: container.Resources{
			Memory:   d.memoryBytes,
			NanoCPUs: d.nanoCPUs,
		},
		CapDrop:     []string{"ALL"},
		SecurityOpt: []string{"no-new-privileges:true"},
	}, nil, nil, "")

	if err != nil {
		return "", fmt.Errorf("docker: container create failed: %w", err)
	}

	if err := d.client.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		_ = d.client.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})
		return "", fmt.Errorf("docker: container start failed: %w", err)
	}

	d.log.Info("Container provisioned", "containerID", resp.ID[:12], "image", imageName)
	return resp.ID, nil
}

// Exec runs a command inside a running container without a TTY.
// Used by: validator, one-off diagnostic commands.
func (d *DockerProvider) Exec(ctx context.Context, containerID string, cmd []string) (ExecResult, error) {
	start := time.Now()

	execID, err := d.client.ContainerExecCreate(ctx, containerID, dtypes.ExecConfig{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          false,
	})
	if err != nil {
		return ExecResult{}, fmt.Errorf("docker: exec create failed: %w", err)
	}

	resp, err := d.client.ContainerExecAttach(ctx, execID.ID, dtypes.ExecStartCheck{})
	if err != nil {
		return ExecResult{}, fmt.Errorf("docker: exec attach failed: %w", err)
	}
	defer resp.Close()

	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, resp.Reader); err != nil {
		return ExecResult{}, fmt.Errorf("docker: exec output read failed: %w", err)
	}

	inspect, err := d.client.ContainerExecInspect(ctx, execID.ID)
	if err != nil {
		return ExecResult{}, fmt.Errorf("docker: exec inspect failed: %w", err)
	}

	return ExecResult{
		Stdout:   strings.TrimSpace(stdout.String()),
		Stderr:   strings.TrimSpace(stderr.String()),
		ExitCode: inspect.ExitCode,
		Duration: time.Since(start),
	}, nil
}

// ExecInteractive opens a PTY inside a running container for WebSocket terminal use.
// Returns a ReadWriteCloser (the PTY stream) and a ResizeFunc (for SIGWINCH events).
// The PTY runs /bin/bash by default.
func (d *DockerProvider) ExecInteractive(ctx context.Context, containerID string, cols, rows uint) (io.ReadWriteCloser, ResizeFunc, error) {
	execID, err := d.client.ContainerExecCreate(ctx, containerID, dtypes.ExecConfig{
		Cmd:          []string{"/bin/bash"},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true, // allocate a pseudo-TTY
	})
	if err != nil {
		return nil, nil, fmt.Errorf("docker: interactive exec create failed: %w", err)
	}

	resp, err := d.client.ContainerExecAttach(ctx, execID.ID, dtypes.ExecStartCheck{Tty: true})
	if err != nil {
		return nil, nil, fmt.Errorf("docker: interactive exec attach failed: %w", err)
	}

	// Set initial terminal size
	_ = d.client.ContainerExecResize(ctx, execID.ID, container.ResizeOptions{
		Width:  uint(cols),
		Height: uint(rows),
	})

	// ResizeFunc lets the WebSocket handler resize the PTY when the browser window changes
	resizeFn := func(newCols, newRows uint) error {
		return d.client.ContainerExecResize(ctx, execID.ID, container.ResizeOptions{
			Width:  uint(newCols),
			Height: uint(newRows),
		})
	}

	// resp.Conn is a net.Conn — wrap it to satisfy io.ReadWriteCloser
	return resp.Conn, resizeFn, nil
}

// Remove force-removes a container. Called on session end or TTL expiry.
func (d *DockerProvider) Remove(ctx context.Context, containerID string) error {
	err := d.client.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true})
	if err != nil {
		return fmt.Errorf("docker: remove failed: %w", err)
	}
	d.log.Info("Container removed", "containerID", containerID[:12])
	return nil
}

// ensureImage pulls the image if not already cached.
func (d *DockerProvider) ensureImage(ctx context.Context, imageName string) error {
	reader, err := d.client.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		return err
	}
	defer reader.Close()
	_, _ = io.Copy(io.Discard, reader)
	return nil
}
