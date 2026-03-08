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
	MaxTokens  int              `json:"max_tokens,omitempty"`
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

func (c *Client) GenerateDatabaseSQL(ctx context.Context, naturalLanguage string) (*SQLQueryResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("LLM_API_KEY is not configured")
	}

	text := strings.TrimSpace(naturalLanguage)
	if text == "" {
		return nil, fmt.Errorf("natural language query is empty")
	}

	systemPrompt := "Kamu adalah asisten SQL untuk sistem silsilah keluarga Bani Akhzab. " +
		"Skema: HANYA tabel 'persons' dengan kolom: id (integer PK), full_name (text), " +
		"gender (text, nilai HARUS salah satu dari: 'Laki-laki' atau 'Perempuan' — case-sensitive, huruf kapital di awal), " +
		"father_id (integer nullable FK), mother_id (integer nullable FK), spouse_ids (integer[]), " +
		"generation (text), wa_number (text), alamat (text), url (text), " +
		"created_at (timestamp), updated_at (timestamp), deleted_at (timestamp nullable). " +
		"ATURAN KETAT: " +
		"1. HANYA boleh generate query SELECT. Dilarang INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, COPY, EXECUTE, PREPARE. " +
		"2. HANYA boleh query tabel 'persons'. Dilarang akses tabel lain, information_schema, pg_catalog, atau system catalog apapun. " +
		"3. Dilarang menggunakan WITH, CTE, atau subquery yang mengandung INSERT/UPDATE/DELETE. " +
		"4. Dilarang menggunakan fungsi: pg_sleep, pg_read_file, pg_ls_dir, lo_import, lo_export, dblink, atau fungsi sistem berbahaya lainnya. " +
		"5. Dilarang menggunakan komentar SQL (-- atau /* */). " +
		"6. Query WAJIB memiliki LIMIT maksimal 50. " +
		"7. Gunakan PostgreSQL syntax. Gunakan JOIN sederhana, hindari WITH RECURSIVE jika tidak perlu. " +
		"8. Filter deleted_at IS NULL untuk mengabaikan data yang sudah dihapus. " +
		"Respon SELALU dalam format JSON: {\"sql\": \"...\", \"explanation\": \"...\"}."

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
	personA, err := store.Persons.GetByID(ctx, personAID)
	if err != nil {
		return nil, fmt.Errorf("person A not found: %w", err)
	}
	personB, err := store.Persons.GetByID(ctx, personBID)
	if err != nil {
		return nil, fmt.Errorf("person B not found: %w", err)
	}

	persons, err := store.Persons.List(ctx, 1000, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to list persons: %w", err)
	}

	graph := db.BuildFamilyGraph(ctx, persons)
	paths, _ := graph.FindShortestPaths(personA.ID, personB.ID, true, true, 16)
	if len(paths) == 0 {
		return &RelationshipResult{
			Label:       "",
			Explanation: "Tidak ada jalur hubungan yang ditemukan di dalam data silsilah.",
			Raw:         "",
		}, nil
	}

	path := paths[0]
	label := PathToLabel(path, personB.Gender)
	explanation := fmt.Sprintf("Jalur terpendek memiliki %d langkah.", path.Length)

	return &RelationshipResult{
		Label:       label,
		Explanation: explanation,
		Raw:         "",
	}, nil
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
		NewGetFilteredRelativesTool(store),
		NewCheckRelationshipTool(c, store),
		NewAskDatabaseTool(c, store),
		NewUpdatePersonWANumberTool(store),
	}

	agent := agents.NewOpenAIFunctionsAgent(llm, agentTools)
	executor := agents.NewExecutor(
		agent,
		agents.WithMaxIterations(10),
	)

	systemPrompt := fmt.Sprintf(`[INSTRUKSI SISTEM: Kamu adalah asisten silsilah keluarga Bani Akhzab (Chatbot Nasab) di WhatsApp.
Kamu sedang berbicara dengan: %s (ID: %s).
Selalu gunakan bahasa Indonesia yang sopan, ramah, dan ringkas. Jangan membuat asumsi, gunakan tool jika tidak tahu.
Jika user bertanya tentang keluarganya, gunakan ID user ini (%s) untuk mencari ke tool.
Kamu dapat mengupdate nomor WhatsApp anggota keluarga menggunakan tool UpdatePersonWANumber HANYA jika diminta secara eksplisit oleh user yang terdaftar.

FORMAT WHATSAPP:
- *Teks Tebal* untuk nama orang atau poin penting.
- _Teks Miring_ untuk istilah asing atau penekanan.
- Gunakan bullet points (-) untuk daftar.]

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

// runComplexQuery handles multi-hop, chained, and filtered genealogy queries via an agentic loop.
// It passes full context: user identity, conversation history, and enriched state (with person names).
func (c *Client) runComplexQuery(ctx context.Context, store *db.Store, user *db.Person, history []db.ChatMessage, stateSummary string, query string) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("LLM_API_KEY is not configured")
	}

	llmClient, err := openai.New(
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
		NewGetFilteredRelativesTool(store),
		NewCheckRelationshipTool(c, store),
		NewAskDatabaseTool(c, store),
		NewUpdateConversationFocusTool(store, user.WANumber),
		NewUpdatePersonWANumberTool(store),
	}

	agent := agents.NewOpenAIFunctionsAgent(llmClient, agentTools)
	executor := agents.NewExecutor(
		agent,
		agents.WithMaxIterations(15),
	)

	// Build compact history for context (last 6 messages)
	historyLines := buildAgentHistorySummary(history, 6)

	systemPrompt := fmt.Sprintf(`[INSTRUKSI SISTEM: CHATBOT NASAB BANI AKHZAB]
Kamu adalah asisten ahli silsilah keluarga Bani Akhzab yang cerdas, ramah, dan berbudaya.
Tugas utama: Menjawab pertanyaan silsilah, melacak hubungan keluarga, dan memberikan saran sapaan yang tepat.

USER SAAT INI:
- Nama: %s
- ID: %s

KONTEKS PERCAKAPAN:
%s

STATE (FOKUS SAAT INI):
%s

PANDUAN PENALARAN (CHAIN-OF-THOUGHT):
1. DEKOMPOSISI: Jika pertanyaan melibatkan hubungan berlapis (misal: "sepupu ayah"), pecah menjadi langkah-langkah pencarian (Cari Ayah -> Cari Saudara Ayah -> Cari Anak mereka).
2. KONTEKS: Gunakan ID user (%s) sebagai titik awal jika user bertanya tentang dirinya sendiri ("siapa ayah saya?", "paman saya", dll).
3. EKSEKUSI TOOL: Gunakan tool secara berurutan. Jika butuh ID seseorang, gunakan 'SearchPerson' atau 'GetFilteredRelatives' terlebih dahulu.
4. UPDATE DATA: Kamu dapat memperbarui nomor WhatsApp anggota keluarga menggunakan tool 'UpdatePersonWANumber'. Lakukan HANYA jika diminta secara eksplisit. Pastikan kamu telah mengidentifikasi ID orang yang benar sebelum mengupdate (gunakan SearchPerson/GetFilteredRelatives jika perlu).
5. UPDATE STATE: Gunakan 'UpdateConversationFocus' di akhir penalaran untuk mencatat orang yang menjadi topik utama pembicaraan, agar kamu tahu siapa "dia" di pertanyaan selanjutnya. Cukup panggil tool ini satu kali saja untuk orang yang paling relevan di akhir jawabanmu.
6. ANALISIS SAPAAN & ISTILAH (KULTUR JAWA):
   Gunakan istilah sapaan yang tepat berdasarkan posisi di silsilah:
   - KE ATAS (Munggah): 
     * Orang tua: Bapak/Ibu (Wong Tuwo)
     * Kakek/Nenek: Mbah/Simbah
     * Orang tua Mbah: Buyut
     * Orang tua Buyut: Canggah
     * Orang tua Canggah: Wareng
     * Orang tua Wareng: Udheg-udheg
     * Orang tua Udheg-udheg: Gantung siwur
     * Orang tua Gantung siwur: Grepak senthe
     * Orang tua Grepak senthe: Debok bosok
     * Orang tua Debok bosok: Galih asem
   - KE BAWAH (Mudhun): 
     * Cucu: Putu
     * Cicit (anak cucu): Buyut
   - RELASI SAMPING & LAINNYA:
     * Saudara/Sepupu laki-laki tertua dari Orang Tua: Pak Puh (Bapak Sepuh)
     * Kakak laki-laki/perempuan Orang Tua: Pakdhe / Budhe
     * Adik laki-laki/perempuan Orang Tua: Paklik / Bulik
     * Anak dari saudara kandung: Ponakan
     * Saudara Sepupu (anak paman/bibi): Misanan
     * Saudara Sepupu dari orang tua: Mindhoan
     * Menantu: Mantu
     * Saudara lebih tua: Mas / Mbak
     * Saudara lebih muda: Adik / Dik

ATURAN SAPAAN KRITIS (WAJIB DIIKUTI):
- Orang tua langsung (father_id / mother_id) SELALU disapa *Bapak* atau *Ibu*. DILARANG menyebut mereka sebagai "Mas" atau "Mbak" hanya karena mereka lebih tua. Mas/Mbak HANYA untuk saudara kandung/sebaya, BUKAN untuk orang tua.
- Untuk setiap kerabat, gunakan SATU label hubungan yang paling tepat. JANGAN tambahkan sapaan kedua dalam kurung jika label sudah jelas (contoh: cukup "Ibu", bukan "Ibu (Mbak)").
- Jika kamu mengidentifikasi seseorang sebagai ayah/ibu melalui field father_id/mother_id, label sapaannya adalah Bapak/Ayah (untuk ayah) dan Ibu (untuk ibu), tanpa pengecualian.

ATURAN KOMUNIKASI & FORMAT (WHATSAPP):
- Gunakan bahasa Indonesia yang sopan dan akrab (ala WhatsApp).
- Jangan membuat asumsi tentang data — selalu validasi dengan tool.
- Jawaban harus ringkas, jelas, dan menggunakan emoji yang relevan (misal: 🌳, 👨‍👩‍👧‍👦, ☪️).
- Gunakan format WhatsApp:
  - *Teks Tebal* untuk nama orang atau poin penting (contoh: *Siti Nurul*, BUKAN! **Siti Nurul**).
  - _Teks Miring_ untuk istilah asing atau penekanan halus.
  - Gunakan bullet points (-) untuk daftar anggota keluarga agar mudah dibaca.
  - INGAT!!! ini format whatsapp, bukan format lainnya!. formt whatsapp tidak menggunakan double "*" untuk menebalkan teks, cukup satu "*". Jadi format yang benar adalah *Siti Nurul*, bukan **Siti Nurul**.
- Jika data tidak ditemukan, sampaikan dengan sopan.`, user.FullName, user.ID, historyLines, stateSummary, user.ID)

	input := fmt.Sprintf("%s\n\nPertanyaan User: %s", systemPrompt, query)

	res, err := chains.Call(ctx, executor, map[string]any{
		"input": input,
	})
	if err != nil {
		return "", fmt.Errorf("agent execution failed: %v", err)
	}

	out, ok := res["output"].(string)
	if !ok {
		return "Maaf, terjadi kesalahan saat memproses jawaban.", nil
	}
	return out, nil
}

// buildAgentHistorySummary returns the last N messages formatted for agent context.
func buildAgentHistorySummary(history []db.ChatMessage, maxMsgs int) string {
	if len(history) == 0 {
		return "(tidak ada riwayat percakapan)"
	}
	start := 0
	if len(history) > maxMsgs {
		start = len(history) - maxMsgs
	}
	var lines []string
	for _, m := range history[start:] {
		role := "User"
		if m.Role == "assistant" {
			role = "Bot"
		}
		content := m.Content
		if len(content) > 150 {
			content = content[:150] + "..."
		}
		lines = append(lines, fmt.Sprintf("%s: %s", role, content))
	}
	return strings.Join(lines, "\n")
}
