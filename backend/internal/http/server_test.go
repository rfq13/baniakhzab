package http

import (
	"bytes"
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/baniakhzab/backend/internal/config"
)

type testLogger struct{}

func (testLogger) Info(string, ...any)  {}
func (testLogger) Error(string, ...any) {}

func TestHandleHealth(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()

	srv := &Server{
		logger: testLogger{},
	}

	srv.handleHealth(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}
}

func TestFetchQRCodeAsDataURL(t *testing.T) {
	imgBytes := tinyPNG(t)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(imgBytes)
	}))
	defer ts.Close()

	srv := &Server{}
	dataURL, err := srv.fetchQRCodeAsDataURL(context.Background(), ts.URL+"/statics/qrcode.png")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if !strings.HasPrefix(dataURL, "data:image/png;base64,") {
		t.Fatalf("expected png data URL, got %q", dataURL)
	}

	encoded := strings.TrimPrefix(dataURL, "data:image/png;base64,")
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("expected valid base64 payload, got %v", err)
	}
	if !bytes.Equal(decoded, imgBytes) {
		t.Fatalf("decoded payload mismatch")
	}
}

func TestFetchQRCodeAsDataURLRejectsUnsupportedScheme(t *testing.T) {
	srv := &Server{}
	_, err := srv.fetchQRCodeAsDataURL(context.Background(), "ftp://example.com/scan.png")
	if err == nil {
		t.Fatalf("expected unsupported scheme error")
	}
}

func TestNormalizeWhatsAppQRResult(t *testing.T) {
	imgBytes := tinyPNG(t)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(imgBytes)
	}))
	defer ts.Close()

	srv := &Server{}
	res := map[string]any{
		"results": map[string]any{
			"qr_link": ts.URL + "/statics/qrcode.png",
		},
	}
	if err := srv.normalizeWhatsAppQRResult(context.Background(), res); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	results, _ := res["results"].(map[string]any)
	qrLink, _ := results["qr_link"].(string)
	if !strings.HasPrefix(qrLink, "data:image/png;base64,") {
		t.Fatalf("expected normalized data URL, got %q", qrLink)
	}
}

func TestFetchQRCodeAsDataURLUsesFallbackBaseURL(t *testing.T) {
	imgBytes := tinyPNG(t)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(imgBytes)
	}))
	defer ts.Close()

	srv := &Server{
		cfg: config.Config{
			WhatsApp: config.WhatsAppConfig{
				BaseURL: ts.URL,
			},
		},
	}
	dataURL, err := srv.fetchQRCodeAsDataURL(context.Background(), "http://127.0.0.1:1/statics/qrcode.png")
	if err != nil {
		t.Fatalf("expected fallback download success, got %v", err)
	}
	if !strings.HasPrefix(dataURL, "data:image/png;base64,") {
		t.Fatalf("expected data URL from fallback, got %q", dataURL)
	}
}

func tinyPNG(t *testing.T) []byte {
	t.Helper()

	encoded := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5fN6kAAAAASUVORK5CYII="
	b, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("failed to decode fixture png: %v", err)
	}
	return b
}
