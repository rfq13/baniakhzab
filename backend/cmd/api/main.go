package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"

	"github.com/baniakhzab/backend/internal/config"
	"github.com/baniakhzab/backend/internal/db"
	httpapi "github.com/baniakhzab/backend/internal/http"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	loadEnvFile(".env")
	cfg := config.FromEnv()
	if cfg.DB.DSN == "" {
		logger.Error("DATABASE_URL is not set")
		os.Exit(1)
	}
	if strings.TrimSpace(cfg.Auth.JWTSecret) == "" {
		logger.Error("AUTH_JWT_SECRET is not set")
		os.Exit(1)
	}
	if !cfg.IsDevelopment() && strings.TrimSpace(cfg.WhatsApp.SetupPassword) == "" {
		logger.Error("GOWA_SETUP_PASSWORD is required when APP_ENV is not development", "app_env", cfg.AppEnv)
		os.Exit(1)
	}

	connConfig, err := pgx.ParseConfig(cfg.DB.DSN)
	if err != nil {
		logger.Error("failed to parse database config", "error", err)
		os.Exit(1)
	}
	connConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	database := stdlib.OpenDB(*connConfig)
	defer database.Close()

	if err := database.Ping(); err != nil {
		logger.Error("failed to ping database", "error", err)
		os.Exit(1)
	}

	store := db.NewStore(database)

	// Auto-migrate: ensure img_url column exists
	if err := store.Persons.EnsureImgURLColumn(context.Background()); err != nil {
		logger.Error("failed to ensure img_url column", "error", err)
	}

	server := httpapi.NewServer(cfg, store, logger)

	httpServer := &http.Server{
		Addr:         cfg.Addr,
		Handler:      server.Routes(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("starting backend server", "addr", cfg.Addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http server error", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		logger.Error("server shutdown error", "error", err)
	} else {
		log.Println("backend server stopped gracefully")
	}
}

func loadEnvFile(path string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	lines := strings.Split(string(b), "\n")
	for _, line := range lines {
		s := strings.TrimSpace(line)
		if s == "" {
			continue
		}
		if strings.HasPrefix(s, "#") {
			continue
		}
		idx := strings.Index(s, "=")
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(s[:idx])
		val := strings.TrimSpace(s[idx+1:])
		_ = os.Setenv(key, val)
	}
}
