package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// ActiveContainers tracks the number of actively running sandbox containers.
	ActiveContainers = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "sandbox_active_containers",
		Help: "Current number of active running sandbox containers",
	})

	// ProvisionDuration records the duration in seconds to provision a sandbox container.
	ProvisionDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "sandbox_provision_duration_seconds",
		Help:    "Time taken to provision a sandbox container",
		Buckets: []float64{0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60},
	}, []string{"provider", "image"})

	// DiskQuotaKillsTotal tracks the total number of containers killed due to exceeding disk quota limits.
	DiskQuotaKillsTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "sandbox_disk_quota_kills_total",
		Help: "Total count of sandbox containers killed due to disk quota violations",
	})

	// ValidationDuration records the duration in seconds for challenge validation runs.
	ValidationDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "sandbox_validation_duration_seconds",
		Help:    "Time taken to execute validator checks on a sandbox",
		Buckets: []float64{0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15},
	}, []string{"passed"})
)
