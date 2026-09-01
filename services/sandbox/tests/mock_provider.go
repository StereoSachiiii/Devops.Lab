package tests

import (
	"context"
	"io"
	"sync"
	"time"

	"github.com/devops-platform/sandbox/internal/sandbox"
)

// MockProvider is a test implementation of SandboxProvider.
type MockProvider struct {
	mu             sync.Mutex
	containers     map[string]bool
	ProvisionDelay time.Duration
	ProvisionCount int
	ExecCount      int
	ExecFn         func(ctx context.Context, containerID string, cmd []string) (sandbox.ExecResult, error)
	RunningFlag    bool
}

// NewMockProvider creates a new mock provider.
func NewMockProvider() *MockProvider {
	return &MockProvider{
		containers:  make(map[string]bool),
		RunningFlag: true,
	}
}

func (m *MockProvider) Provision(ctx context.Context, image string) (string, error) {
	if m.ProvisionDelay > 0 {
		select {
		case <-time.After(m.ProvisionDelay):
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.ProvisionCount++
	id := "mock-container-id"
	m.containers[id] = true
	return id, nil
}

func (m *MockProvider) Exec(ctx context.Context, containerID string, cmd []string) (sandbox.ExecResult, error) {
	m.mu.Lock()
	m.ExecCount++
	m.mu.Unlock()

	if m.ExecFn != nil {
		return m.ExecFn(ctx, containerID, cmd)
	}
	return sandbox.ExecResult{ExitCode: 0}, nil
}

func (m *MockProvider) ExecInteractive(ctx context.Context, containerID string, cols, rows uint) (io.ReadWriteCloser, sandbox.ResizeFunc, error) {
	return nil, nil, nil
}

func (m *MockProvider) ExecInteractiveCmd(ctx context.Context, containerID string, cols, rows uint, cmd []string) (io.ReadWriteCloser, sandbox.ResizeFunc, error) {
	return nil, nil, nil
}

func (m *MockProvider) Remove(ctx context.Context, containerID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.containers, containerID)
	return nil
}

func (m *MockProvider) IsRunning(ctx context.Context, containerID string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, exists := m.containers[containerID]
	if !exists {
		return false, nil
	}
	return m.RunningFlag, nil
}

func (m *MockProvider) GetProvisionCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.ProvisionCount
}

func (m *MockProvider) EnforceDiskQuotas(ctx context.Context, maxBytes int64) ([]string, error) {
	return nil, nil
}
