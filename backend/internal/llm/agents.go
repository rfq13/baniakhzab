package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/baniakhzab/backend/internal/db"
)

// IntentResult — single structured output from the unified LLM call.
type IntentResult struct {
	Intent        string   `json:"intent"`         // "query_relation", "query_biodata", "query_lineage", "check_ajnabiyyah", "clarify", "general"
	Entities      []string `json:"entities"`       // person names mentioned
	RelationType  string   `json:"relation_type"`  // "father", "mother", "spouse", "children", "siblings", "ancestors", "descendants"
	Confidence    float64  `json:"confidence"`     // 0.0 - 1.0
	ResponseDraft string   `json:"response_draft"` // optional short draft if simple enough
}

// StateUpdate holds changes to apply to GenealogyState.
type StateUpdate struct {
	CurrentPersonID        *string
	LastReferencedPersonID *string
	ActiveLineageRootID    *string
	ComparisonPersonID     *string
}

// ChatWithMemory — main entry point: single-call routing + deterministic execution.
func (c *Client) ChatWithMemory(ctx context.Context, store *db.Store, user *db.Person, waNumber, query string) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("LLM_API_KEY is not configured")
	}

	// 1. Load state + recent history
	state, err := store.Chat.GetState(ctx, waNumber)
	if err != nil {
		return "", fmt.Errorf("load state: %w", err)
	}
	history, err := store.Chat.GetRecentMessages(ctx, waNumber, 10)
	if err != nil {
		return "", fmt.Errorf("load history: %w", err)
	}

	// Save user message
	_ = store.Chat.SaveMessage(ctx, waNumber, "user", query, "")

	// 2. Single structured LLM call: intent + entity + confidence
	intent, err := c.extractIntent(ctx, user, state, history, query)
	if err != nil {
		log.Printf("[DEBUG] extractIntent error: %v\n", err)
		return "", fmt.Errorf("extract intent: %w", err)
	}

	log.Printf("[DEBUG] ChatWithMemory: extracted intent=%+v\n", intent)

	// 3. General chat — no DB needed (check BEFORE confidence gate)
	if intent.Intent == "general" {
		resp := intent.ResponseDraft
		if resp == "" {
			resp, err = c.formatSimpleResponse(ctx, query, "general_chat", "")
			if err != nil {
				resp = "Halo! Saya adalah Chatbot Nasab Bani Akhzab. Silakan tanya tentang silsilah keluarga. 😊"
			}
		}
		_ = store.Chat.SaveMessage(ctx, waNumber, "assistant", resp, "general")
		return resp, nil
	}

	// 4. Confidence gate (only for non-general intents)
	if intent.Confidence < 0.65 || intent.Intent == "clarify" {
		resp := c.handleLowConfidence(intent, query)
		log.Printf("[DEBUG] ChatWithMemory: low confidence -> resp=%s\n", resp)
		_ = store.Chat.SaveMessage(ctx, waNumber, "assistant", resp, "clarification")
		return resp, nil
	}

	// 5. Resolve entity → person ID (deterministic)
	resolvedPerson, ambiguousMatches := c.resolveEntity(ctx, store, user, state, intent)

	// Disambiguation needed
	if len(ambiguousMatches) > 1 {
		resp := formatDisambiguation(ambiguousMatches, intent.Entities)
		_ = store.Chat.SaveMessage(ctx, waNumber, "assistant", resp, "clarification")
		return resp, nil
	}

	// No person found
	if resolvedPerson == nil && intent.Intent != "general" {
		// Use the user themselves if asking about "saya"
		resolvedPerson = user
	}

	// 6. Deterministic DB execution
	var dataJSON string
	var stUpdate StateUpdate

	switch intent.Intent {
	case "query_relation", "query_lineage":
		dataJSON, stUpdate = c.executeLineageQuery(ctx, store, resolvedPerson, intent)
	case "query_biodata":
		d, _ := json.Marshal(resolvedPerson)
		dataJSON = string(d)
		stUpdate.CurrentPersonID = &resolvedPerson.ID
		stUpdate.LastReferencedPersonID = &resolvedPerson.ID
	case "check_ajnabiyyah":
		dataJSON, stUpdate = c.executeAjnabiyyahCheck(ctx, store, user, resolvedPerson, intent)
	}

	log.Printf("[DEBUG] ChatWithMemory: dataJSON from executeLineageQuery=%s\n", dataJSON)

	// 7. Format response — deterministic template for simple relations, LLM only for complex
	var response string
	if intent.Intent == "query_relation" || intent.Intent == "query_lineage" {
		response = c.formatRelationResponse(intent, resolvedPerson, dataJSON)
	}
	if response == "" {
		response, err = c.formatDataResponse(ctx, intent, resolvedPerson, dataJSON)
		if err != nil {
			log.Printf("[DEBUG] ChatWithMemory: formatDataResponse err=%v\n", err)
			response = fmt.Sprintf("Data: %s", dataJSON)
		}
	}

	// 8. Save + update state
	_ = store.Chat.SaveMessage(ctx, waNumber, "assistant", response, intent.Intent)
	c.applyStateUpdate(ctx, store, state, &stUpdate)

	return response, nil
}

// extractIntent — SINGLE structured LLM call. No double API call.
func (c *Client) extractIntent(ctx context.Context, user *db.Person, state *db.GenealogyState, history []db.ChatMessage, query string) (*IntentResult, error) {
	// Build compact state summary (not raw JSON dump)
	stateSummary := buildStateSummary(state)

	// Build compact history (last 5 only, condensed)
	historySummary := buildHistorySummary(history, 5)

	systemPrompt := fmt.Sprintf(`Kamu adalah intent classifier untuk chatbot silsilah Bani Akhzab.
Nama user yang sedang chat denganmu adalah: %s.
Jangan reasoning panjang. Fokus ekstraksi entitas. Jika tidak yakin → confidence rendah.

Respon HARUS JSON ketat:
{"intent":"..","entities":[".."],"relation_type":"..","confidence":0.0,"response_draft":".."}

intent: query_relation | query_biodata | query_lineage | check_ajnabiyyah | clarify | general
relation_type: father | mother | parents | spouse | children | siblings | ancestors | descendants | search
confidence: 0.0 - 1.0 (turunkan jika nama ambigu atau tidak jelas)
response_draft: isi HANYA jika intent=general (salam/bantuan), kosongkan untuk query data.
entities: nama orang yang disebut. Jika user menyebut "saya", "aku", "diriku", isikan "%s". Kosongkan jika mengacu konteks sebelumnya ("dia", "beliau").

PENTING: Sapaan/salam seperti "hai", "halo", "assalamualaikum", "hi", "apa kabar", "selamat pagi/siang/sore/malam" SELALU intent=general. Jangan terpengaruh history sebelumnya untuk sapaan.`, user.FullName, user.FullName)

	userContent := fmt.Sprintf("State: %s\nHistory: %s\nUser: %s", stateSummary, historySummary, query)

	resp, err := c.callChat(ctx, chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userContent},
		},
		MaxTokens: 200,
	})
	if err != nil {
		return nil, err
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no choices")
	}

	raw := strings.TrimSpace(resp.Choices[0].Message.Content)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var intent IntentResult
	if err := json.Unmarshal([]byte(raw), &intent); err != nil {
		return &IntentResult{Intent: "general", Confidence: 0.5, ResponseDraft: "Maaf, bisa ulangi pertanyaan Anda?"}, nil
	}
	return &intent, nil
}

// resolveEntity — deterministic entity resolution from DB.
func (c *Client) resolveEntity(ctx context.Context, store *db.Store, user *db.Person, state *db.GenealogyState, intent *IntentResult) (*db.Person, []db.Person) {
	// If entities extracted, search by name
	if len(intent.Entities) > 0 {
		name := intent.Entities[0]
		lowerName := strings.ToLower(strings.TrimSpace(name))
		if lowerName == "saya" || lowerName == "aku" || lowerName == "diriku" || lowerName == strings.ToLower(user.FullName) {
			return user, nil
		}

		matches, err := store.Persons.SearchByName(ctx, name, 5)
		if err != nil || len(matches) == 0 {
			return nil, nil
		}
		if len(matches) == 1 {
			return &matches[0], nil
		}
		// Multiple matches → ambiguous
		return nil, matches
	}

	// No entity → use state (implicit reference like "anaknya siapa?")
	if state.LastReferencedPersonID != nil {
		p, err := store.Persons.GetByID(ctx, *state.LastReferencedPersonID)
		if err == nil {
			return p, nil
		}
	}
	if state.CurrentPersonID != nil {
		p, err := store.Persons.GetByID(ctx, *state.CurrentPersonID)
		if err == nil {
			return p, nil
		}
	}
	return nil, nil
}

// executeLineageQuery — deterministic DB queries, no LLM.
func (c *Client) executeLineageQuery(ctx context.Context, store *db.Store, person *db.Person, intent *IntentResult) (string, StateUpdate) {
	var st StateUpdate
	st.CurrentPersonID = &person.ID

	var fID, mID string
	if person.FatherID != nil {
		fID = *person.FatherID
	}
	if person.MotherID != nil {
		mID = *person.MotherID
	}
	log.Printf("[DEBUG] executeLineageQuery: intent=%s, person_id=%s, father_id=%q, mother_id=%q\n", intent.RelationType, person.ID, fID, mID)

	switch intent.RelationType {
	case "father":
		if person.FatherID != nil {
			father, err := store.Persons.GetByID(ctx, *person.FatherID)
			if err == nil {
				v := buildPersonView(ctx, store, father)
				d, _ := json.Marshal(v)
				st.LastReferencedPersonID = &father.ID
				return string(d), st
			}
		}
		return fmt.Sprintf(`{"info":"Ayah dari %s tidak ada di database"}`, person.FullName), st

	case "mother":
		if person.MotherID != nil {
			mother, err := store.Persons.GetByID(ctx, *person.MotherID)
			if err == nil {
				v := buildPersonView(ctx, store, mother)
				d, _ := json.Marshal(v)
				st.LastReferencedPersonID = &mother.ID
				return string(d), st
			}
		}
		return fmt.Sprintf(`{"info":"Ibu dari %s tidak ada di database"}`, person.FullName), st

	case "parents":
		var parents []PersonView
		if person.FatherID != nil {
			if father, err := store.Persons.GetByID(ctx, *person.FatherID); err == nil {
				parents = append(parents, buildPersonView(ctx, store, father))
			}
		}
		if person.MotherID != nil {
			if mother, err := store.Persons.GetByID(ctx, *person.MotherID); err == nil {
				parents = append(parents, buildPersonView(ctx, store, mother))
			}
		}
		if len(parents) > 0 {
			d, _ := json.Marshal(parents)
			if len(parents) == 1 && person.FatherID != nil {
				st.LastReferencedPersonID = person.FatherID
			} else if len(parents) == 1 && person.MotherID != nil {
				st.LastReferencedPersonID = person.MotherID
			}
			return string(d), st
		}
		return fmt.Sprintf(`{"info":"Data orang tua %s tidak ada di database"}`, person.FullName), st

	case "children":
		children, err := store.Persons.GetChildren(ctx, person.ID)
		if err == nil && len(children) > 0 {
			var views []PersonView
			for _, c := range children {
				views = append(views, buildPersonView(ctx, store, &c))
			}
			d, _ := json.Marshal(views)
			return string(d), st
		}
		return fmt.Sprintf(`{"info":"%s tidak memiliki anak yang tercatat"}`, person.FullName), st

	case "spouse":
		spouses, err := store.Persons.GetSpouses(ctx, person.ID)
		if err == nil && len(spouses) > 0 {
			var views []PersonView
			for _, s := range spouses {
				views = append(views, buildPersonView(ctx, store, &s))
			}
			d, _ := json.Marshal(views)
			if len(spouses) == 1 {
				st.LastReferencedPersonID = &spouses[0].ID
			}
			return string(d), st
		}
		return fmt.Sprintf(`{"info":"%s tidak memiliki pasangan yang tercatat"}`, person.FullName), st

	case "siblings":
		siblings, err := store.Persons.GetSiblings(ctx, person.ID)
		if err == nil && len(siblings) > 0 {
			var views []PersonView
			for _, s := range siblings {
				views = append(views, buildPersonView(ctx, store, &s))
			}
			d, _ := json.Marshal(views)
			return string(d), st
		}
		return fmt.Sprintf(`{"info":"%s tidak memiliki saudara yang tercatat"}`, person.FullName), st

	case "ancestors":
		levels, err := store.Persons.GetAncestors(ctx, person.ID, 5)
		if err == nil && len(levels) > 0 {
			var views [][]PersonView
			for _, lvl := range levels {
				var lvlViews []PersonView
				for _, a := range lvl {
					lvlViews = append(lvlViews, buildPersonView(ctx, store, &a))
				}
				views = append(views, lvlViews)
			}
			d, _ := json.Marshal(views)
			return string(d), st
		}
		return fmt.Sprintf(`{"info":"Leluhur %s tidak ditemukan"}`, person.FullName), st

	case "descendants":
		levels, err := store.Persons.GetDescendants(ctx, person.ID, 3)
		if err == nil && len(levels) > 0 {
			var views [][]PersonView
			for _, lvl := range levels {
				var lvlViews []PersonView
				for _, d := range lvl {
					lvlViews = append(lvlViews, buildPersonView(ctx, store, &d))
				}
				views = append(views, lvlViews)
			}
			d, _ := json.Marshal(views)
			return string(d), st
		}
		return fmt.Sprintf(`{"info":"Keturunan %s tidak ditemukan"}`, person.FullName), st

	case "search":
		if len(intent.Entities) > 0 {
			matches, err := store.Persons.SearchByName(ctx, intent.Entities[0], 10)
			if err == nil {
				var views []PersonView
				for _, m := range matches {
					views = append(views, buildPersonView(ctx, store, &m))
				}
				d, _ := json.Marshal(views)
				if len(matches) == 1 {
					st.LastReferencedPersonID = &matches[0].ID
				}
				return string(d), st
			}
		}
		return `{"info":"Tidak ada hasil pencarian"}`, st

	default:
		v := buildPersonView(ctx, store, person)
		d, _ := json.Marshal(v)
		return string(d), st
	}
}

// executeAjnabiyyahCheck — deterministic check via DB data.
func (c *Client) executeAjnabiyyahCheck(ctx context.Context, store *db.Store, user *db.Person, target *db.Person, intent *IntentResult) (string, StateUpdate) {
	st := StateUpdate{ComparisonPersonID: &target.ID}

	result, err := c.CheckRelationship(ctx, store, user.ID, target.ID)
	if err != nil {
		return fmt.Sprintf(`{"error":"Gagal cek hubungan: %v"}`, err), st
	}
	d, _ := json.Marshal(result)
	return string(d), st
}

// formatRelationResponse — deterministic template for relation queries, no LLM needed.
func (c *Client) formatRelationResponse(intent *IntentResult, person *db.Person, dataJSON string) string {
	personName := "seseorang"
	if person != nil {
		personName = person.FullName
	}

	switch intent.RelationType {
	case "father":
		var pv PersonView
		if err := json.Unmarshal([]byte(dataJSON), &pv); err == nil && pv.FullName != "" {
			return fmt.Sprintf("Ayah dari %s adalah **%s** 👨 %s", personName, pv.FullName, formatExtras(pv))
		}
	case "mother":
		var pv PersonView
		if err := json.Unmarshal([]byte(dataJSON), &pv); err == nil && pv.FullName != "" {
			return fmt.Sprintf("Ibu dari %s adalah **%s** 👩 %s", personName, pv.FullName, formatExtras(pv))
		}
	case "parents":
		var pvs []PersonView
		if err := json.Unmarshal([]byte(dataJSON), &pvs); err == nil && len(pvs) > 0 {
			var parts []string
			for _, pv := range pvs {
				if pv.Gender == "perempuan" {
					parts = append(parts, fmt.Sprintf("Ibu: **%s** 👩", pv.FullName))
				} else {
					parts = append(parts, fmt.Sprintf("Ayah: **%s** 👨", pv.FullName))
				}
			}
			return fmt.Sprintf("Orang tua %s:\n%s", personName, strings.Join(parts, "\n"))
		}
	case "children":
		var pvs []PersonView
		if err := json.Unmarshal([]byte(dataJSON), &pvs); err == nil && len(pvs) > 0 {
			var names []string
			for _, pv := range pvs {
				names = append(names, pv.FullName)
			}
			return fmt.Sprintf("Anak-anak %s: %s 👨‍👩‍👧‍👦 (total %d orang)", personName, strings.Join(names, ", "), len(names))
		}
	case "spouse":
		var pvs []PersonView
		if err := json.Unmarshal([]byte(dataJSON), &pvs); err == nil && len(pvs) > 0 {
			var names []string
			for _, pv := range pvs {
				names = append(names, pv.FullName)
			}
			return fmt.Sprintf("Pasangan %s: %s 💑", personName, strings.Join(names, ", "))
		}
	case "siblings":
		var pvs []PersonView
		if err := json.Unmarshal([]byte(dataJSON), &pvs); err == nil && len(pvs) > 0 {
			var names []string
			for _, pv := range pvs {
				names = append(names, pv.FullName)
			}
			return fmt.Sprintf("Saudara %s: %s 👫 (total %d orang)", personName, strings.Join(names, ", "), len(names))
		}
	case "search":
		var pvs []PersonView
		if err := json.Unmarshal([]byte(dataJSON), &pvs); err == nil && len(pvs) > 0 {
			var lines []string
			for i, pv := range pvs {
				lines = append(lines, fmt.Sprintf("%d. **%s** (%s)", i+1, pv.FullName, pv.Gender))
			}
			return fmt.Sprintf("Hasil pencarian:\n%s", strings.Join(lines, "\n"))
		}
	}

	return "" // fallback to LLM formatting
}

func formatExtras(pv PersonView) string {
	var extras []string
	if pv.SpouseNames != nil && len(pv.SpouseNames) > 0 {
		extras = append(extras, fmt.Sprintf("Pasangan: %s", strings.Join(pv.SpouseNames, ", ")))
	}
	if extras == nil {
		return ""
	}
	return "(" + strings.Join(extras, ", ") + ")"
}

// formatDataResponse — LLM ONLY formats DB data into natural language. Max 250 tokens.
func (c *Client) formatDataResponse(ctx context.Context, intent *IntentResult, person *db.Person, dataJSON string) (string, error) {
	personName := "seseorang"
	if person != nil {
		personName = person.FullName
	}

	systemPrompt := `Kamu memformat data silsilah keluarga menjadi jawaban bahasa Indonesia yang sopan dan ringkas.
Gunakan HANYA data yang diberikan. JANGAN bilang data tidak tersedia jika data sudah ada.
Gunakan emoji. Jawab maksimal 2-3 kalimat. JANGAN tampilkan ID atau URL.`

	// Build a clearer description of what was queried
	queryDesc := intent.RelationType
	switch intent.RelationType {
	case "parents":
		queryDesc = fmt.Sprintf("orang tua (ayah dan ibu) dari %s", personName)
	case "father":
		queryDesc = fmt.Sprintf("ayah dari %s", personName)
	case "mother":
		queryDesc = fmt.Sprintf("ibu dari %s", personName)
	case "children":
		queryDesc = fmt.Sprintf("anak-anak dari %s", personName)
	case "spouse":
		queryDesc = fmt.Sprintf("pasangan dari %s", personName)
	case "siblings":
		queryDesc = fmt.Sprintf("saudara dari %s", personName)
	case "ancestors":
		queryDesc = fmt.Sprintf("leluhur dari %s", personName)
	case "descendants":
		queryDesc = fmt.Sprintf("keturunan dari %s", personName)
	}

	userContent := fmt.Sprintf("Pertanyaan: %s\nData hasil query:\n%s", queryDesc, dataJSON)

	resp, err := c.callChat(ctx, chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userContent},
		},
		MaxTokens: 250,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no choices")
	}
	return strings.TrimSpace(resp.Choices[0].Message.Content), nil
}

// formatSimpleResponse — for general chat, max 150 tokens.
func (c *Client) formatSimpleResponse(ctx context.Context, query, action, data string) (string, error) {
	systemPrompt := `Kamu adalah Chatbot Nasab Bani Akhzab. Jawab sopan, ringkas, bahasa Indonesia. Maksimal 2 kalimat.`
	resp, err := c.callChat(ctx, chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: query},
		},
		MaxTokens: 150,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no choices")
	}
	return strings.TrimSpace(resp.Choices[0].Message.Content), nil
}

// handleLowConfidence — when confidence < 0.65, ask for clarification without LLM call.
func (c *Client) handleLowConfidence(intent *IntentResult, query string) string {
	if len(intent.Entities) > 0 {
		return fmt.Sprintf("Maaf, saya kurang yakin dengan pertanyaan Anda tentang \"%s\". Bisa diperjelas? Misalnya: \"Siapa ayah dari %s?\"",
			intent.Entities[0], intent.Entities[0])
	}
	return "Maaf, bisa ulangi pertanyaan Anda dengan lebih spesifik? Contoh: \"Siapa ayah dari Ahmad?\" atau \"Anak-anak si Hasan siapa saja?\""
}

// formatDisambiguation — deterministic, no LLM call.
func formatDisambiguation(matches []db.Person, entities []string) string {
	name := "orang tersebut"
	if len(entities) > 0 {
		name = entities[0]
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Ditemukan %d orang dengan nama \"%s\":\n\n", len(matches), name)
	for i, m := range matches {
		gen := ""
		if m.Generation != "" {
			gen = fmt.Sprintf(" (generasi %s)", m.Generation)
		}
		parent := ""
		if m.FatherID != nil {
			parent = " — ada data ayah"
		}
		fmt.Fprintf(&b, "%d. %s%s%s\n", i+1, m.FullName, gen, parent)
	}
	b.WriteString("\nBalas dengan nomor atau nama lengkapnya.")
	return b.String()
}

// applyStateUpdate persists state changes.
func (c *Client) applyStateUpdate(ctx context.Context, store *db.Store, state *db.GenealogyState, update *StateUpdate) {
	if update.CurrentPersonID != nil {
		state.CurrentPersonID = update.CurrentPersonID
	}
	if update.LastReferencedPersonID != nil {
		state.LastReferencedPersonID = update.LastReferencedPersonID
	}
	if update.ActiveLineageRootID != nil {
		state.ActiveLineageRootID = update.ActiveLineageRootID
	}
	if update.ComparisonPersonID != nil {
		state.ComparisonPersonID = update.ComparisonPersonID
	}
	_ = store.Chat.UpdateState(ctx, state)
}

// --- Helpers ---

type PersonView struct {
	FullName    string   `json:"nama_lengkap"`
	Gender      string   `json:"jenis_kelamin,omitempty"`
	Generation  string   `json:"generasi,omitempty"`
	Alamat      string   `json:"alamat,omitempty"`
	FatherName  string   `json:"nama_ayah,omitempty"`
	MotherName  string   `json:"nama_ibu,omitempty"`
	SpouseNames []string `json:"nama_pasangan,omitempty"`
}

func buildPersonView(ctx context.Context, store *db.Store, p *db.Person) PersonView {
	v := PersonView{
		FullName:   p.FullName,
		Generation: p.Generation,
		Alamat:     p.Alamat,
	}
	if p.Gender != "" {
		gl := strings.ToLower(p.Gender)
		if gl == "p" || strings.HasPrefix(gl, "perempuan") || gl == "female" || gl == "f" {
			v.Gender = "perempuan"
		} else {
			v.Gender = "laki-laki"
		}
	}
	if p.FatherID != nil {
		if f, err := store.Persons.GetByID(ctx, *p.FatherID); err == nil {
			v.FatherName = f.FullName
		}
	}
	if p.MotherID != nil {
		if m, err := store.Persons.GetByID(ctx, *p.MotherID); err == nil {
			v.MotherName = m.FullName
		}
	}
	for _, sid := range p.SpouseIDs {
		if s, err := store.Persons.GetByID(ctx, sid); err == nil {
			v.SpouseNames = append(v.SpouseNames, s.FullName)
		}
	}
	return v
}

func buildStateSummary(state *db.GenealogyState) string {
	parts := []string{}
	if state.CurrentPersonID != nil {
		parts = append(parts, fmt.Sprintf("current=%s", *state.CurrentPersonID))
	}
	if state.LastReferencedPersonID != nil {
		parts = append(parts, fmt.Sprintf("last_ref=%s", *state.LastReferencedPersonID))
	}
	if state.ComparisonPersonID != nil {
		parts = append(parts, fmt.Sprintf("compare=%s", *state.ComparisonPersonID))
	}
	if len(parts) == 0 {
		return "empty"
	}
	return strings.Join(parts, ", ")
}

func buildHistorySummary(history []db.ChatMessage, maxMsgs int) string {
	start := 0
	if len(history) > maxMsgs {
		start = len(history) - maxMsgs
	}
	var lines []string
	for _, m := range history[start:] {
		// Truncate long messages to 100 chars
		content := m.Content
		if len(content) > 100 {
			content = content[:100] + "..."
		}
		lines = append(lines, fmt.Sprintf("%s: %s", m.Role, content))
	}
	if len(lines) == 0 {
		return "none"
	}
	return strings.Join(lines, "\n")
}
