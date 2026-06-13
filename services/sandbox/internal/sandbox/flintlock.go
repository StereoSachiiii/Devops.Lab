package sandbox

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"strings"
	"time"

	flintv1 "github.com/liquidmetal-dev/flintlock/api/services/microvm/v1alpha1"
	flinktypes "github.com/liquidmetal-dev/flintlock/api/types"
	"golang.org/x/crypto/ssh"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const (
	flintlockNamespace   = "devops-sandbox"
	flintlockKernelImage = "ghcr.io/weaveworks-liquidmetal/flintlock-kernel:5.10.77"
	// rootfsPrefix is prepended to bare image names (e.g. "bash:5") so Flintlock
	// can resolve them as OCI container sources.
	rootfsPrefix = "docker.io/library/"
)

// FlintlockProvider implements SandboxProvider using the Flintlock microVM manager.
// It dials the Flintlock daemon via gRPC and uses the v1alpha1 MicroVM API.
type FlintlockProvider struct {
	address   string
	conn      *grpc.ClientConn
	client    flintv1.MicroVMClient
	memoryMB  int32
	vcpus     int32
	sshConfig *ssh.ClientConfig
	log       *slog.Logger
}

// NewFlintlockProvider dials the Flintlock gRPC endpoint and returns a ready provider.
// It reads FLINTLOCK_SSH_KEY_PATH for the private key used to authenticate into microVMs.
// If the env var is unset, password-less auth is attempted as a fallback.
func NewFlintlockProvider(address string, log *slog.Logger) (*FlintlockProvider, error) {
	conn, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("flintlock: grpc dial %q failed: %w", address, err)
	}

	sshCfg, err := buildSSHClientConfig()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("flintlock: SSH config build failed: %w", err)
	}

	log.Info("Flintlock gRPC client created", "address", address)
	return &FlintlockProvider{
		address:   address,
		conn:      conn,
		client:    flintv1.NewMicroVMClient(conn),
		memoryMB:  512,
		vcpus:     1,
		sshConfig: sshCfg,
		log:       log,
	}, nil
}

// buildSSHClientConfig reads the private key from FLINTLOCK_SSH_KEY_PATH (if set)
// and returns an ssh.ClientConfig ready for use.
func buildSSHClientConfig() (*ssh.ClientConfig, error) {
	cfg := &ssh.ClientConfig{
		User:            "root",
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // acceptable inside a private overlay network
		Timeout:         10 * time.Second,
	}

	keyPath := os.Getenv("FLINTLOCK_SSH_KEY_PATH")
	if keyPath == "" {
		// No key path — rely on the cloud-init injected key already in the authorized_keys.
		// This works when the host agent and the microVMs share a known key pair.
		return cfg, nil
	}

	keyBytes, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("read SSH key %s: %w", keyPath, err)
	}

	signer, err := ssh.ParsePrivateKey(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("parse SSH key %s: %w", keyPath, err)
	}

	cfg.Auth = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	return cfg, nil
}

// Close releases the underlying gRPC connection.
func (p *FlintlockProvider) Close() error {
	return p.conn.Close()
}

// Provision calls CreateMicroVM on the Flintlock daemon.
// The image string is used as the root volume's OCI container source.
// Returns the microVM UID which we use as the "containerID" throughout the system.
func (p *FlintlockProvider) Provision(ctx context.Context, image string) (string, error) {
	// Ensure fully qualified image reference.
	rootfsImage := image
	if !strings.Contains(image, "/") {
		rootfsImage = rootfsPrefix + image
	}

	resp, err := p.client.CreateMicroVM(ctx, &flintv1.CreateMicroVMRequest{
		Microvm: &flinktypes.MicroVMSpec{
			Namespace:  flintlockNamespace,
			Vcpu:       p.vcpus,
			MemoryInMb: p.memoryMB,
			Labels: map[string]string{
				"managed-by": "devops-platform-sandbox",
			},
			Kernel: &flinktypes.Kernel{
				Image: flintlockKernelImage,
			},
			RootVolume: &flinktypes.Volume{
				Id:         "root",
				IsReadOnly: false,
				Source: &flinktypes.VolumeSource{
					ContainerSource: &rootfsImage,
				},
			},
		},
	})
	if err != nil {
		return "", fmt.Errorf("flintlock: CreateMicroVM failed: %w", err)
	}

	uid := resp.GetMicrovm().GetSpec().GetUid()
	if uid == "" {
		return "", fmt.Errorf("flintlock: CreateMicroVM returned empty UID")
	}
	p.log.Info("MicroVM provisioned", "uid", uid, "image", image)
	return uid, nil
}

// Exec runs a non-interactive command in the microVM via SSH.
func (p *FlintlockProvider) Exec(ctx context.Context, vmID string, cmd []string) (ExecResult, error) {
	start := time.Now()

	guestIP, err := p.resolveGuestIP(ctx, vmID)
	if err != nil {
		return ExecResult{}, fmt.Errorf("flintlock: exec: resolve guest IP: %w", err)
	}

	client, err := ssh.Dial("tcp", guestIP+":22", p.sshConfig)
	if err != nil {
		return ExecResult{}, fmt.Errorf("flintlock: ssh dial %s: %w", guestIP, err)
	}
	defer client.Close()

	sess, err := client.NewSession()
	if err != nil {
		return ExecResult{}, fmt.Errorf("flintlock: ssh new session: %w", err)
	}
	defer sess.Close()

	var stdout, stderr strings.Builder
	sess.Stdout = &stdout
	sess.Stderr = &stderr

	cmdStr := strings.Join(cmd, " ")
	exitCode := 0
	if runErr := sess.Run(cmdStr); runErr != nil {
		if exitErr, ok := runErr.(*ssh.ExitError); ok {
			exitCode = exitErr.ExitStatus()
		} else {
			return ExecResult{}, fmt.Errorf("flintlock: ssh run %q: %w", cmdStr, runErr)
		}
	}

	return ExecResult{
		Stdout:   strings.TrimSpace(stdout.String()),
		Stderr:   strings.TrimSpace(stderr.String()),
		ExitCode: exitCode,
		Duration: time.Since(start),
	}, nil
}

// ExecInteractive opens a PTY-backed SSH session inside the microVM.
// Returns an io.ReadWriteCloser bridging stdin/stdout and a ResizeFunc for window changes.
func (p *FlintlockProvider) ExecInteractive(ctx context.Context, vmID string, cols, rows uint) (io.ReadWriteCloser, ResizeFunc, error) {
	guestIP, err := p.resolveGuestIP(ctx, vmID)
	if err != nil {
		return nil, nil, fmt.Errorf("flintlock: interactive exec: resolve guest IP: %w", err)
	}

	client, err := ssh.Dial("tcp", guestIP+":22", p.sshConfig)
	if err != nil {
		return nil, nil, fmt.Errorf("flintlock: ssh dial %s: %w", guestIP, err)
	}

	sess, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, nil, fmt.Errorf("flintlock: ssh new session: %w", err)
	}

	// Request a PTY with the initial terminal dimensions.
	if err := sess.RequestPty("xterm-256color", int(rows), int(cols), ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}); err != nil {
		sess.Close()
		client.Close()
		return nil, nil, fmt.Errorf("flintlock: ssh RequestPty: %w", err)
	}

	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, nil, fmt.Errorf("flintlock: ssh StdinPipe: %w", err)
	}

	stdout, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, nil, fmt.Errorf("flintlock: ssh StdoutPipe: %w", err)
	}

	if err := sess.Shell(); err != nil {
		sess.Close()
		client.Close()
		return nil, nil, fmt.Errorf("flintlock: ssh Shell: %w", err)
	}

	rwc := &sshSessionRWC{
		stdin:  stdin,
		stdout: stdout,
		sess:   sess,
		client: client,
	}

	resizeFn := func(newCols, newRows uint) error {
		return sess.WindowChange(int(newRows), int(newCols))
	}

	return rwc, resizeFn, nil
}

// Remove calls DeleteMicroVM on the Flintlock daemon.
func (p *FlintlockProvider) Remove(ctx context.Context, vmID string) error {
	_, err := p.client.DeleteMicroVM(ctx, &flintv1.DeleteMicroVMRequest{
		Uid: vmID,
	})
	if err != nil {
		return fmt.Errorf("flintlock: DeleteMicroVM %q: %w", vmID, err)
	}
	p.log.Info("MicroVM removed", "uid", vmID)
	return nil
}

// resolveGuestIP queries Flintlock for the microVM's network interface status,
// then performs an ARP-style lookup to find the guest's IPv4 address via the host tap device.
func (p *FlintlockProvider) resolveGuestIP(ctx context.Context, vmID string) (string, error) {
	resp, err := p.client.GetMicroVM(ctx, &flintv1.GetMicroVMRequest{Uid: vmID})
	if err != nil {
		return "", fmt.Errorf("GetMicroVM: %w", err)
	}

	for _, iface := range resp.GetMicrovm().GetStatus().GetNetworkInterfaces() {
		ip, err := ipFromTapDevice(iface.GetHostDeviceName())
		if err == nil && ip != "" {
			return ip, nil
		}
	}
	return "", fmt.Errorf("could not resolve guest IP for vm %q", vmID)
}

// ipFromTapDevice finds the guest IPv4 peer address via the host tap device.
// In a typical Flintlock setup the tap is configured with a /30 where the
// peer (.2) is the guest.
func ipFromTapDevice(tapDevice string) (string, error) {
	iface, err := net.InterfaceByName(tapDevice)
	if err != nil {
		return "", err
	}
	addrs, err := iface.Addrs()
	if err != nil || len(addrs) == 0 {
		return "", fmt.Errorf("no addresses on %s", tapDevice)
	}
	for _, addr := range addrs {
		ip, ipNet, err := net.ParseCIDR(addr.String())
		if err != nil || ip.To4() == nil {
			continue
		}
		// Return the peer address (host + 1) for /30 tap subnets.
		guestIP := make(net.IP, len(ip.To4()))
		copy(guestIP, ip.To4())
		guestIP[3]++
		if ipNet.Contains(guestIP) {
			return guestIP.String(), nil
		}
		return ip.String(), nil
	}
	return "", fmt.Errorf("no IPv4 on %s", tapDevice)
}

// sshSessionRWC wraps an ssh.Session's stdin/stdout as an io.ReadWriteCloser.
// Closing it tears down the SSH session and the underlying client connection.
type sshSessionRWC struct {
	stdin  io.WriteCloser
	stdout io.Reader
	sess   *ssh.Session
	client *ssh.Client
}

func (s *sshSessionRWC) Read(p []byte) (int, error)  { return s.stdout.Read(p) }
func (s *sshSessionRWC) Write(p []byte) (int, error) { return s.stdin.Write(p) }
func (s *sshSessionRWC) Close() error {
	_ = s.stdin.Close()
	_ = s.sess.Close()
	return s.client.Close()
}
