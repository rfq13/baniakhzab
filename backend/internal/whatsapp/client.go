package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Client communicates with a GoWA (go-whatsapp-web-multidevice) instance.
type Client struct {
	baseURL    string
	username   string
	password   string
	httpClient *http.Client

	mu       sync.RWMutex
	deviceID string
}

func NewClient(baseURL, username, password string) *Client {
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	return &Client{
		baseURL:  strings.TrimRight(baseURL, "/"),
		username: username,
		password: password,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// SetDeviceID sets the current device ID (thread-safe).
func (c *Client) SetDeviceID(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.deviceID = id
}

// GetDeviceID returns the current device ID (thread-safe).
func (c *Client) GetDeviceID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.deviceID
}

// setAuth sets Basic Auth on the request if credentials are configured.
func (c *Client) setAuth(req *http.Request) {
	if c.username != "" || c.password != "" {
		req.SetBasicAuth(c.username, c.password)
	}
}

// setDevice sets X-Device-Id header if a device ID is available.
func (c *Client) setDevice(req *http.Request) {
	if id := c.GetDeviceID(); id != "" {
		req.Header.Set("X-Device-Id", id)
	}
}

// ---------- Send Messages ----------

type sendMessageRequest struct {
	Phone   string `json:"phone"`
	Message string `json:"message"`
}

func (c *Client) SendText(ctx context.Context, waNumber, message string) error {
	if waNumber == "" {
		return fmt.Errorf("waNumber is empty")
	}
	if message == "" {
		return fmt.Errorf("message is empty")
	}

	phone := waNumber
	if !strings.Contains(waNumber, "@") {
		phone = waNumber + "@s.whatsapp.net"
	}

	body, err := json.Marshal(sendMessageRequest{
		Phone:   phone,
		Message: message,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/send/message", bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	c.setDevice(req)
	c.setAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("whatsapp send message failed with status %d", resp.StatusCode)
	}
	return nil
}

// ---------- Device Discovery ----------

type gowaResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Results any    `json:"results"`
}

type gowaDevice struct {
	ID    string `json:"id"`
	State string `json:"state"`
}

// DiscoverOrCreateDevice queries GoWA for existing devices. If none exist, it
// creates one. Returns the device ID.
func (c *Client) DiscoverOrCreateDevice(ctx context.Context) (string, error) {
	// 1. Try listing existing devices
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/devices", nil)
	if err != nil {
		return "", err
	}
	c.setAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("list devices failed: %w", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		var listResp struct {
			Results []gowaDevice `json:"results"`
		}
		if json.Unmarshal(body, &listResp) == nil && len(listResp.Results) > 0 {
			id := listResp.Results[0].ID
			c.SetDeviceID(id)
			return id, nil
		}
	}

	// 2. No devices found — create one
	reqBody := bytes.NewReader([]byte(`{}`))
	req2, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/devices", reqBody)
	if err != nil {
		return "", err
	}
	req2.Header.Set("Content-Type", "application/json")
	c.setAuth(req2)

	resp2, err := c.httpClient.Do(req2)
	if err != nil {
		return "", fmt.Errorf("create device failed: %w", err)
	}
	body2, _ := io.ReadAll(resp2.Body)
	resp2.Body.Close()

	if resp2.StatusCode < 200 || resp2.StatusCode >= 300 {
		return "", fmt.Errorf("create device failed with status %d: %s", resp2.StatusCode, string(body2))
	}

	var createResp struct {
		Results gowaDevice `json:"results"`
	}
	if err := json.Unmarshal(body2, &createResp); err != nil {
		return "", fmt.Errorf("failed to parse create device response: %w", err)
	}

	id := createResp.Results.ID
	c.SetDeviceID(id)
	return id, nil
}

// GetDeviceStatus queries GoWA for the device status.
func (c *Client) GetDeviceStatus(ctx context.Context) (map[string]any, error) {
	deviceID := c.GetDeviceID()
	if deviceID == "" {
		// No device yet, return "not connected"
		return map[string]any{"is_connected": false, "is_logged_in": false}, nil
	}

	reqURL := fmt.Sprintf("%s/devices/%s/status", c.baseURL, deviceID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	c.setAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// If device not found on GoWA (stale ID), just return disconnected
	if resp.StatusCode == 404 || resp.StatusCode >= 500 {
		return map[string]any{"is_connected": false, "is_logged_in": false}, nil
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("get device status failed with status %d", resp.StatusCode)
	}

	var res gowaResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	if statusMap, ok := res.Results.(map[string]any); ok {
		return statusMap, nil
	}
	return nil, fmt.Errorf("invalid response format from get device status")
}

// ---------- Login / QR ----------

func (c *Client) GetLoginQR(ctx context.Context) (map[string]any, error) {
	deviceID := c.GetDeviceID()
	if deviceID == "" {
		var err error
		deviceID, err = c.DiscoverOrCreateDevice(ctx)
		if err != nil {
			return nil, fmt.Errorf("discover device for QR: %w", err)
		}
	}

	return c.doGetLoginQR(ctx, deviceID, true)
}

func (c *Client) doGetLoginQR(ctx context.Context, deviceID string, canRetry bool) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/app/login", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Device-Id", deviceID)
	c.setAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	bodyBytes, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var res map[string]any
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, fmt.Errorf("decode QR response: %w", err)
	}

	// ALREADY_LOGGED_IN is not an error — it means the device is authenticated
	if code, _ := res["code"].(string); code == "ALREADY_LOGGED_IN" {
		res["already_logged_in"] = true
		return res, nil
	}

	// DEVICE_NOT_FOUND means stale device ID — clear it and retry once
	if code, _ := res["code"].(string); code == "DEVICE_NOT_FOUND" && canRetry {
		c.mu.Lock()
		c.deviceID = ""
		c.mu.Unlock()

		newID, err := c.DiscoverOrCreateDevice(ctx)
		if err != nil {
			return nil, fmt.Errorf("re-discover device for QR: %w", err)
		}
		return c.doGetLoginQR(ctx, newID, false)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("get login QR failed (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return res, nil
}

func (c *Client) GetLoginCode(ctx context.Context, phone string) (map[string]any, error) {
	deviceID := c.GetDeviceID()
	reqURL := fmt.Sprintf("%s/app/login/with-code?phone=%s", c.baseURL, phone)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if deviceID != "" {
		req.Header.Set("X-Device-Id", deviceID)
	}
	c.setAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("get login code failed with status %d", resp.StatusCode)
	}

	var res map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}
	return res, nil
}

func (c *Client) Logout(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/app/logout", nil)
	if err != nil {
		return err
	}
	c.setDevice(req)
	c.setAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("logout failed with status %d", resp.StatusCode)
	}
	return nil
}
