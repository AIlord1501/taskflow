package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/AIlord1501/taskflow/backend-go/internal/handler"
	"github.com/AIlord1501/taskflow/backend-go/internal/repository"
	"github.com/AIlord1501/taskflow/backend-go/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type HealthResponse struct {
	Status    string    `json:"status"`
	Service   string    `json:"service"`
	Timestamp time.Time `json:"timestamp"`
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://taskflow:taskflowpassword@127.0.0.1:5433/taskflow?sslmode=disable"
	}

	// 1. Initialize PostgreSQL Connection Pool with a startup timeout
	initCtx, initCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer initCancel()

	pool, err := pgxpool.New(initCtx, dbURL)
	if err != nil {
		slog.Error("unable to create database pool", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Verify Postgres is actually reachable before accepting HTTP traffic
	if err := pool.Ping(initCtx); err != nil {
		slog.Error("unable to ping database", "error", err)
		os.Exit(1)
	}
	slog.Info("connected to PostgreSQL successfully")

	// 2. Initialize Redis (read-through cache + durable AI job stream)
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}
	redisOpts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Error("invalid REDIS_URL", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	if err := rdb.Ping(initCtx).Err(); err != nil {
		slog.Error("unable to ping redis", "error", err)
		os.Exit(1)
	}
	slog.Info("connected to Redis successfully", "addr", redisOpts.Addr)

	internalSecret := os.Getenv("INTERNAL_SECRET")
	if internalSecret == "" {
		slog.Warn("INTERNAL_SECRET not set; AI worker callback endpoint is disabled")
	}

	// 3. Manual Dependency Injection: Repository -> Service -> Handler
	taskRepo := repository.NewPostgresTaskRepo(pool)
	taskSvc := service.NewTaskService(taskRepo, rdb)
	taskHandler := handler.NewTaskHandler(taskSvc, internalSecret)

	// 4. Register Routes
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", handleHealth)
	taskHandler.RegisterRoutes(mux)

	// 5. Configure & Start HTTP Server
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      loggingMiddleware(corsMiddleware(mux)),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("starting TaskFlow Go API", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("HTTP server crashed", "error", err)
			os.Exit(1)
		}
	}()

	// 6. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down TaskFlow server gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}
	slog.Info("TaskFlow server exited cleanly")
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(HealthResponse{
		Status:    "healthy",
		Service:   "taskflow-core-api",
		Timestamp: time.Now().UTC(),
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("http request",
			"method", r.Method,
			"path", r.URL.Path,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}
