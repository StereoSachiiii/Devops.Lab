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
	client        *client.Client
	networkMode   string
	memoryBytes   int64
	nanoCPUs      int64
	runtime       string
	imageRegistry string
	log           *slog.Logger
}

// NewDockerProvider connects to the local Docker daemon and returns a provider
// that uses the standard (insecure) runc runtime.
func NewDockerProvider(networkMode string, memoryMB int, maxCPUs float64, imageRegistry string, log *slog.Logger) (*DockerProvider, error) {
	return newDockerProviderWithRuntime(networkMode, memoryMB, maxCPUs, "", imageRegistry, log)
}

// newDockerProviderWithRuntime connects to the local Docker daemon and uses the specified runtime.
// Used internally by explicit providers (like kata.go, gvisor.go).
func newDockerProviderWithRuntime(networkMode string, memoryMB int, maxCPUs float64, runtime, imageRegistry string, log *slog.Logger) (*DockerProvider, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("docker: client init failed: %w", err)
	}

	return &DockerProvider{
		client:        cli,
		networkMode:   networkMode,
		memoryBytes:   int64(memoryMB) * 1024 * 1024,
		nanoCPUs:      int64(maxCPUs * 1_000_000_000),
		runtime:       runtime,
		imageRegistry: strings.TrimSpace(imageRegistry),
		log:           log,
	}, nil
}

// Provision creates a container from the challenge image and starts it.
// The container runs `sleep infinity` — it stays alive until Remove() is called.
// Labels are added so the reaper can identify orphaned containers on restart.
func (d *DockerProvider) Provision(ctx context.Context, imageName string) (string, error) {
	resolvedImage, err := d.ensureImage(ctx, imageName)
	if err != nil {
		return "", fmt.Errorf("docker: image pull failed: %w", err)
	}

	pidsLimit := int64(256)
	resp, err := d.client.ContainerCreate(ctx, &container.Config{
		Image: resolvedImage,
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
			Memory:    d.memoryBytes,
			NanoCPUs:  d.nanoCPUs,
			PidsLimit: &pidsLimit,
		},
		CapDrop:     []string{"ALL"},
		CapAdd:      []string{"CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID", "NET_BIND_SERVICE", "KILL", "SYS_CHROOT"},
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

	// Close the hijacked connection if the context times out,
	// otherwise stdcopy.StdCopy will block forever.
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			resp.Close()
		case <-done:
		}
	}()
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
func (p *DockerProvider) ExecInteractive(ctx context.Context, containerID string, cols, rows uint) (io.ReadWriteCloser, ResizeFunc, error) {
	return p.ExecInteractiveCmd(ctx, containerID, cols, rows, []string{"/bin/sh", "-i"})
}

// ExecInteractiveCmd opens a PTY running the specified command.
// Used by the tmux helper to run `tmux attach-session`.
func (d *DockerProvider) ExecInteractiveCmd(ctx context.Context, containerID string, cols, rows uint, cmd []string) (io.ReadWriteCloser, ResizeFunc, error) {
	return d.execInteractiveWithCmd(ctx, containerID, cols, rows, cmd)
}

// execInteractiveWithCmd is the shared implementation for ExecInteractive and ExecInteractiveCmd.
func (d *DockerProvider) execInteractiveWithCmd(ctx context.Context, containerID string, cols, rows uint, cmd []string) (io.ReadWriteCloser, ResizeFunc, error) {
	execID, err := d.client.ContainerExecCreate(ctx, containerID, dtypes.ExecConfig{
		Cmd:          cmd,
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

// Remove force-removes a container and its volumes.
func (d *DockerProvider) Remove(ctx context.Context, containerID string) error {
	err := d.client.ContainerRemove(ctx, containerID, container.RemoveOptions{
		Force:         true,
		RemoveVolumes: true,
	})
	if err != nil {
		return fmt.Errorf("docker: remove failed: %w", err)
	}
	d.log.Debug("Container removed", "containerId", containerID[:12])
	return nil
}

// IsRunning checks if the container is currently running.
func (d *DockerProvider) IsRunning(ctx context.Context, containerID string) (bool, error) {
	c, err := d.client.ContainerInspect(ctx, containerID)
	if err != nil {
		if client.IsErrNotFound(err) {
			return false, nil
		}
		return false, fmt.Errorf("docker: inspect failed: %w", err)
	}
	return c.State.Running, nil
}

// ensureImage checks if imageName exists locally. If not, it attempts to pull
// from the configured registry (e.g. GHCR) or fallback to imageName directly.
func (d *DockerProvider) ensureImage(ctx context.Context, imageName string) (string, error) {
	// 1. Check if the image name exists locally as-is
	if _, _, err := d.client.ImageInspectWithRaw(ctx, imageName); err == nil {
		return imageName, nil
	}

	// 2. Resolve registry candidate name
	resolvedName := imageName
	if d.imageRegistry != "" && !strings.Contains(imageName, "/") {
		resolvedName = fmt.Sprintf("%s/%s", strings.TrimRight(d.imageRegistry, "/"), imageName)
		if _, _, err := d.client.ImageInspectWithRaw(ctx, resolvedName); err == nil {
			return resolvedName, nil
		}
	}

	// 3. Attempt pull with resolvedName
	d.log.Info("Pulling image from registry", "image", resolvedName)
	reader, err := d.client.ImagePull(ctx, resolvedName, image.PullOptions{})
	if err != nil {
		// If resolvedName differed from imageName, attempt fallback pull directly
		if resolvedName != imageName {
			d.log.Warn("Pull with registry prefix failed, attempting fallback", "resolved", resolvedName, "original", imageName, "error", err)
			reader, err = d.client.ImagePull(ctx, imageName, image.PullOptions{})
			if err != nil {
				return "", err
			}
			resolvedName = imageName
		} else {
			return "", err
		}
	}
	defer reader.Close()
	_, _ = io.Copy(io.Discard, reader)
	return resolvedName, nil
}

// EnforceDiskQuotas checks all managed containers for disk usage exceeding maxBytes.
func (d *DockerProvider) EnforceDiskQuotas(ctx context.Context, maxBytes int64) ([]string, error) {
	containers, err := d.client.ContainerList(ctx, container.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("docker: failed to list containers: %w", err)
	}

	var killed []string
	for _, c := range containers {
		if c.Labels["managed-by"] != "devops-platform-sandbox" {
			continue
		}

		inspect, _, err := d.client.ContainerInspectWithRaw(ctx, c.ID, true)
		if err != nil {
			d.log.Warn("Failed to inspect container for quota check", "containerId", c.ID[:12], "error", err)
			continue
		}

		if inspect.SizeRw != nil && *inspect.SizeRw > maxBytes {
			d.log.Warn("Container exceeded disk quota, killing", "containerId", c.ID[:12], "size", *inspect.SizeRw, "max", maxBytes)
			_ = d.Remove(ctx, c.ID)
			killed = append(killed, c.ID)
		}
	}

	return killed, nil
}

// ReapOrphans scans the Docker daemon for containers with label managed-by=devops-platform-sandbox
// whose session ID is not present in activeSessionIDs and whose Created timestamp is older than minAge.
func (d *DockerProvider) ReapOrphans(ctx context.Context, activeSessionIDs map[string]struct{}, minAge time.Duration) ([]string, error) {
	containers, err := d.client.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("docker: failed to list containers for orphan reap: %w", err)
	}

	now := time.Now().UTC()
	var reaped []string

	for _, c := range containers {
		if c.Labels["managed-by"] != "devops-platform-sandbox" {
			continue
		}

		sessionID := c.Labels["session-id"]
		if sessionID != "" {
			if _, isActive := activeSessionIDs[sessionID]; isActive {
				continue
			}
		}

		createdTime := time.Unix(c.Created, 0).UTC()
		age := now.Sub(createdTime)
		if age < minAge {
			// Inside grace period — allow in-flight provisioning to register
			continue
		}

		d.log.Warn("Reaping unindexed orphan container",
			"containerId", c.ID[:12],
			"sessionId", sessionID,
			"age", age,
		)
		if err := d.Remove(ctx, c.ID); err != nil {
			d.log.Error("Failed to remove orphan container", "containerId", c.ID[:12], "error", err)
		} else {
			reaped = append(reaped, c.ID)
		}
	}

	return reaped, nil
}
