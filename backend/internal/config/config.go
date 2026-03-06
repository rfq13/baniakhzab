package config

import (
	"os"
	"strconv"
	"strings"
)

type DBConfig struct {
	DSN string
}

type WhatsAppConfig struct {
	BaseURL       string
	BasicUser     string
	BasicPass     string
	SetupPassword string
}

type AuthConfig struct {
	JWTSecret              string
	FrontendBaseURL        string
	OneTimeTokenTTLMinutes int
}

type LLMConfig struct {
	BaseURL string
	APIKey  string
	Model   string
}

type Config struct {
	AppEnv   string
	Addr     string
	DB       DBConfig
	WhatsApp WhatsAppConfig
	Auth     AuthConfig
	LLM      LLMConfig
}

func FromEnv() Config {
	appEnv := strings.ToLower(strings.TrimSpace(getEnv("APP_ENV", "production")))
	if appEnv == "" {
		appEnv = "production"
	}

	ttl, _ := strconv.Atoi(os.Getenv("AUTH_ONE_TIME_TOKEN_TTL_MINUTES"))
	if ttl <= 0 {
		ttl = 10
	}

	return Config{
		AppEnv: appEnv,
		Addr: getEnv("BACKEND_ADDR", ":8080"),
		DB: DBConfig{
			DSN: adjustDSN(os.Getenv("DATABASE_URL")),
		},
		WhatsApp: WhatsAppConfig{
			BaseURL:       getEnv("GOWA_BASE_URL", "http://localhost:3000"),
			BasicUser:     os.Getenv("GOWA_BASIC_USER"),
			BasicPass:     os.Getenv("GOWA_BASIC_PASS"),
			SetupPassword: strings.TrimSpace(os.Getenv("GOWA_SETUP_PASSWORD")),
		},
		Auth: AuthConfig{
			JWTSecret:              os.Getenv("AUTH_JWT_SECRET"),
			FrontendBaseURL:        getEnv("AUTH_FRONTEND_BASE_URL", "http://localhost:5173"),
			OneTimeTokenTTLMinutes: ttl,
		},
		LLM: LLMConfig{
			BaseURL: getEnv("LLM_BASE_URL", "https://api.openai.com/v1"),
			APIKey:  os.Getenv("LLM_API_KEY"),
			Model:   getEnv("LLM_MODEL", "gpt-4.1-mini"),
		},
	}
}

func (c Config) IsDevelopment() bool {
	return strings.EqualFold(strings.TrimSpace(c.AppEnv), "development")
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func adjustDSN(dsn string) string {
	if dsn == "" {
		return dsn
	}
	// Supabase pooler via pgbouncer in transaction mode needs describe-only cache
	// to avoid "prepared statement already exists".
	if strings.Contains(dsn, "pooler.supabase.com") {
		hasQ := strings.Contains(dsn, "?")
		parts := []string{}
		if !strings.Contains(dsn, "statement_cache_mode=") {
			parts = append(parts, "statement_cache_mode=disable")
		}
		if !strings.Contains(dsn, "prefer_simple_protocol=") {
			parts = append(parts, "prefer_simple_protocol=true")
		}
		if len(parts) == 0 {
			return dsn
		}
		if hasQ {
			return dsn + "&" + strings.Join(parts, "&")
		}
		return dsn + "?" + strings.Join(parts, "&")
	}
	return dsn
}
