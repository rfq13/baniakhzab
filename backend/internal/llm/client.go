package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/baniakhzab/backend/internal/config"
	"github.com/baniakhzab/backend/internal/db"
	"github.com/tmc/langchaingo/agents"
	"github.com/tmc/langchaingo/chains"
	"github.com/tmc/langchaingo/llms/openai"
	"github.com/tmc/langchaingo/tools"
)

type Client struct {
	baseURL string
	apiKey  string
	model   string
	http    *http.Client
}

func NewClient(cfg config.LLMConfig) *Client {
	return &Client{
		baseURL: cfg.BaseURL,
		apiKey:  cfg.APIKey,
		model:   cfg.Model,
		http: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

type toolFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

type toolDefinition struct {
	Type     string       `json:"type"`
	Function toolFunction `json:"function"`
}

type toolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type toolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Function toolCallFunction `json:"function"`
}

type chatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	Name       string     `json:"name,omitempty"`
	ToolCalls  []toolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type chatRequest struct {
	Model      string           `json:"model"`
	Messages   []chatMessage    `json:"messages"`
	Tools      []toolDefinition `json:"tools,omitempty"`
	ToolChoice string           `json:"tool_choice,omitempty"`
}

type chatChoice struct {
	Index        int         `json:"index"`
	FinishReason string      `json:"finish_reason"`
	Message      chatMessage `json:"message"`
}

type chatResponse struct {
	Choices []chatChoice `json:"choices"`
}

type AjnabiyyahResult struct {
	Conclusion string `json:"conclusion"`
	Reasoning  string `json:"reasoning"`
	Raw        string `json:"raw"`
}

type SQLQueryResult struct {
	SQL         string `json:"sql"`
	Explanation string `json:"explanation"`
}

type RelationshipResult struct {
	Label       string `json:"label"`
	Explanation string `json:"explanation"`
	Raw         string `json:"raw"`
}

func (c *Client) RunAjnabiyyah(ctx context.Context, store *db.Store, personAID, personBID string) (*AjnabiyyahResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("LLM_API_KEY is not configured")
	}

	personA, err := store.Persons.GetByID(ctx, personAID)
	if err != nil {
		return nil, fmt.Errorf("person A not found: %w", err)
	}
	personB, err := store.Persons.GetByID(ctx, personBID)
	if err != nil {
		return nil, fmt.Errorf("person B not found: %w", err)
	}

	tools := []toolDefinition{
		{
			Type: "function",
			Function: toolFunction{
				Name:        "get_person_pair",
				Description: "Ambil detail dua orang dari database berdasarkan ID untuk analisis hubungan kekerabatan.",
				Parameters: json.RawMessage(`{
  "type": "object",
  "properties": {
    "person_a_id": { "type": "string" },
    "person_b_id": { "type": "string" }
  },
  "required": ["person_a_id", "person_b_id"]
}`),
			},
		},
	}

	initialMessages := []chatMessage{
		{
			Role: "system",
			Content: "Kamu adalah asisten fikih keluarga yang membantu menganalisis apakah dua orang dalam pohon silsilah berstatus mahram atau ajnabi. " +
				"Gunakan data yang diberikan oleh tool untuk menyimpulkan secara singkat.",
		},
		{
			Role:    "user",
			Content: fmt.Sprintf("Analisis hubungan ajnabiyyah antara Person A (%s) dan Person B (%s).", personA.FullName, personB.FullName),
		},
	}

	reqBody := chatRequest{
		Model:      c.model,
		Messages:   initialMessages,
		Tools:      tools,
		ToolChoice: "auto",
	}

	resp1, err := c.callChat(ctx, reqBody)
	if err != nil {
		return nil, err
	}
	if len(resp1.Choices) == 0 {
		return nil, fmt.Errorf("llm returned no choices")
	}

	msg := resp1.Choices[0].Message
	if len(msg.ToolCalls) == 0 {
		return &AjnabiyyahResult{
			Conclusion: "",
			Reasoning:  "",
			Raw:        msg.Content,
		}, nil
	}

	tc := msg.ToolCalls[0]
	toolContent, err := c.buildToolContent(personA, personB)
	if err != nil {
		return nil, err
	}

	messages2 := append(initialMessages, chatMessage{
		Role:      "assistant",
		ToolCalls: []toolCall{tc},
		Content:   "",
	})
	messages2 = append(messages2, chatMessage{
		Role:       "tool",
		Name:       tc.Function.Name,
		ToolCallID: tc.ID,
		Content:    toolContent,
	})

	resp2, err := c.callChat(ctx, chatRequest{
		Model:    c.model,
		Messages: messages2,
	})
	if err != nil {
		return nil, err
	}
	if len(resp2.Choices) == 0 {
		return nil, fmt.Errorf("llm returned no choices on second call")
	}

	finalMsg := resp2.Choices[0].Message

	res := &AjnabiyyahResult{
		Raw: finalMsg.Content,
	}
	return res, nil
}

func (c *Client) GenerateAjnabiyyahSQL(ctx context.Context, naturalLanguage string) (*SQLQueryResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("LLM_API_KEY is not configured")
	}

	text := strings.TrimSpace(naturalLanguage)
	if text == "" {
		text = "Buat query SQL untuk mengambil daftar anggota keluarga yang berstatus ajnabi (bukan mahram) terhadap satu orang tertentu."
	}

	systemPrompt := "Kamu adalah asisten SQL untuk sistem silsilah keluarga Bani Akhzab. " +
		"Skema utama: tabel persons dengan kolom id (UUID), full_name (text), gender (text), father_id (UUID, nullable), mother_id (UUID, nullable), " +
		"spouse_ids (UUID[]), generation (text). " +
		"Buat query SELECT yang hanya membaca data (tanpa INSERT/UPDATE/DELETE) untuk membantu analisis siapa saja yang ajnabi (bukan mahram) " +
		"berdasarkan garis keturunan dan hubungan pernikahan. " +
		"Respon SELALU dalam format JSON dengan bentuk: {\"sql\": \"...\", \"explanation\": \"...\"}."

	messages := []chatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: text},
	}

	resp, err := c.callChat(ctx, chatRequest{
		Model:    c.model,
		Messages: messages,
	})
	if err != nil {
		return nil, err
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("llm returned no choices")
	}

	raw := strings.TrimSpace(resp.Choices[0].Message.Content)

	var out SQLQueryResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return &SQLQueryResult{
			SQL:         raw,
			Explanation: "",
		}, nil
	}
	return &out, nil
}

func (c *Client) CheckRelationship(ctx context.Context, store *db.Store, personAID, personBID string) (*RelationshipResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("LLM_API_KEY is not configured")
	}

	personA, err := store.Persons.GetByID(ctx, personAID)
	if err != nil {
		return nil, fmt.Errorf("person A not found: %w", err)
	}
	personB, err := store.Persons.GetByID(ctx, personBID)
	if err != nil {
		return nil, fmt.Errorf("person B not found: %w", err)
	}

	payload := map[string]any{
		"person_a": personA,
		"person_b": personB,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	systemPrompt := "Kamu adalah asisten kekerabatan untuk keluarga besar Bani Akhzab. " +
		"Tugasmu menjelaskan hubungan kekerabatan antara dua orang (misalnya: kakak, adik, paman, bibi, sepupu, keponakan, mertua, ipar, dan seterusnya). " +
		"Gunakan data struktur keluarga yang diberikan. " +
		"Jawab dalam bahasa Indonesia yang ringkas. " +
		"Respon SELALU dalam format JSON: {\"label\": \"<hubungan singkat>\", \"explanation\": \"<penjelasan singkat>\"}."

	userContent := "Berikut data dua orang dari pohon silsilah dalam format JSON:\n" +
		string(data) +
		"\nJelaskan hubungan kekerabatan mereka."

	messages := []chatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userContent},
	}

	resp, err := c.callChat(ctx, chatRequest{
		Model:    c.model,
		Messages: messages,
	})
	if err != nil {
		return nil, err
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("llm returned no choices")
	}

	raw := strings.TrimSpace(resp.Choices[0].Message.Content)

	var out RelationshipResult
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return &RelationshipResult{
			Label:       "",
			Explanation: "",
			Raw:         raw,
		}, nil
	}
	out.Raw = raw
	return &out, nil
}

func (c *Client) callChat(ctx context.Context, body chatRequest) (*chatResponse, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("llm request failed with status %d", resp.StatusCode)
	}

	var out chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) buildToolContent(a, b *db.Person) (string, error) {
	payload := map[string]any{
		"person_a": a,
		"person_b": b,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (c *Client) ChatWithAgent(ctx context.Context, store *db.Store, user *db.Person, query string) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("LLM_API_KEY is not configured")
	}

	llm, err := openai.New(
		openai.WithBaseURL(c.baseURL),
		openai.WithToken(c.apiKey),
		openai.WithModel(c.model),
	)
	if err != nil {
		return "", fmt.Errorf("failed to initialize langchaingo openai client: %v", err)
	}

	agentTools := []tools.Tool{
		NewSearchPersonTool(store),
		NewGetPersonFamilyTool(store),
		NewCheckRelationshipTool(c, store),
	}

	agent := agents.NewOpenAIFunctionsAgent(llm, agentTools)
	executor := agents.NewExecutor(
		agent,
		agents.WithMaxIterations(5),
	)

	systemPrompt := fmt.Sprintf(`[INSTRUKSI SISTEM: Kamu adalah asisten silsilah keluarga Bani Akhzab (Chatbot Nasab) di WhatsApp.
Kamu sedang berbicara dengan: %s (ID: %s).
Selalu gunakan bahasa Indonesia yang sopan, ramah, dan ringkas. Jangan membuat asumsi, gunakan tool jika tidak tahu.
Jika user bertanya tentang keluarganya, gunakan ID user ini (%s) untuk mencari ke tool.]

Pertanyaan User: %s`, user.FullName, user.ID, user.ID, query)

	res, err := chains.Call(ctx, executor, map[string]any{
		"input": systemPrompt,
	})
	if err != nil {
		return "", fmt.Errorf("langchaingo agent execution failed: %v", err)
	}

	out, ok := res["output"].(string)
	if !ok {
		return "Maaf, terjadi kesalahan saat memproses jawaban (format tidak sesuai).", nil
	}

	return out, nil
}
