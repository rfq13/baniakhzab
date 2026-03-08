package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/baniakhzab/backend/internal/db"
	"github.com/tmc/langchaingo/callbacks"
	"github.com/tmc/langchaingo/tools"
)

// sqlQueryTimeout is the maximum execution time for LLM-generated SQL queries.
const sqlQueryTimeout = 3 * time.Second

// normalizeIslamicName maps common Indonesian/Islamic name prefix variants to canonical forms
func normalizeIslamicName(name string) string {
	replacements := map[string]string{
		"Moh.":      "Muhammad",
		"Moh ":      "Muhammad ",
		"Mohamad ": "Muhammad ",
		"Mohammad ": "Muhammad ",
		"M. ":       "Muhammad ",
		"M ":        "Muhammad ",
		"Abd.":      "Abdul",
		"Abd ":      "Abdul ",
		"Siti ":     "Siti ",
		"Syiti ":    "Siti ",
	}
	result := name
	for k, v := range replacements {
		if strings.HasPrefix(result, k) {
			result = v + result[len(k):]
			break
		}
	}
	return result
}

// fuzzySearchByTokens splits name into significant tokens and searches each
func fuzzySearchByTokens(ctx context.Context, store *db.Store, name string) []db.Person {
	skip := map[string]bool{
		"bin": true, "binti": true, "al": true, "el": true,
		"moh": true, "moch": true, "m": true,
	}
	tokens := strings.Fields(name)
	seen := make(map[string]db.Person)
	for _, tok := range tokens {
		clean := strings.Trim(tok, ".,()'\"")
		if len(clean) < 3 || skip[strings.ToLower(clean)] {
			continue
		}
		matches, err := store.Persons.SearchByName(ctx, clean, 10)
		if err != nil {
			continue
		}
		for _, m := range matches {
			if _, ok := seen[m.ID]; !ok {
				seen[m.ID] = m
			}
		}
	}
	var result []db.Person
	for _, p := range seen {
		result = append(result, p)
	}
	return result
}

type SearchPersonTool struct {
	store *db.Store
}

var _ tools.Tool = SearchPersonTool{}

func NewSearchPersonTool(store *db.Store) *SearchPersonTool {
	return &SearchPersonTool{store: store}
}

func (t SearchPersonTool) Name() string {
	return "SearchPerson"
}

func (t SearchPersonTool) Description() string {
	return `Cari orang di dalam database silsilah berdasarkan nama (parsial atau lengkap). 
Berguna untuk menemukan ID seseorang sebelum menggunakan tool lain. 
Input harus berupa JSON dengan key "query" yang berisi nama yang dicari.`
}

func (t SearchPersonTool) Call(ctx context.Context, input string) (string, error) {
	var payload struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err != nil {
		// Fallback to raw string if it's not JSON
		payload.Query = input
	}

	matches, err := t.store.Persons.SearchByName(ctx, payload.Query, 10)
	if err != nil {
		return fmt.Sprintf("Error saat mencari: %v", err), nil
	}
	if len(matches) == 0 {
		// Fuzzy fallback 1: normalized name
		norm := normalizeIslamicName(payload.Query)
		if norm != payload.Query {
			matches, err = t.store.Persons.SearchByName(ctx, norm, 10)
		}
	}
	if len(matches) == 0 {
		// Fuzzy fallback 2: search by each significant token
		matches = fuzzySearchByTokens(ctx, t.store, payload.Query)
	}
	if len(matches) == 0 {
		return fmt.Sprintf("Tidak ada yang ditemukan dengan nama '%s'", payload.Query), nil
	}

	res, err := json.Marshal(matches)
	if err != nil {
		return "", err
	}
	return string(res), nil
}

type GetPersonFamilyTool struct {
	store *db.Store
}

var _ tools.Tool = GetPersonFamilyTool{}

func NewGetPersonFamilyTool(store *db.Store) *GetPersonFamilyTool {
	return &GetPersonFamilyTool{store: store}
}

func (t GetPersonFamilyTool) Name() string {
	return "GetPersonFamily"
}

func (t GetPersonFamilyTool) Description() string {
	return `Ambil detail lengkap seseorang beserta ID anggota keluarga intinya (ayah, ibu, pasangan, dan anak). 
Berguna untuk menelusuri silsilah secara bertahap. 
Input harus berupa JSON dengan key "person_id" yang berisi UUID.`
}

func (t GetPersonFamilyTool) Call(ctx context.Context, input string) (string, error) {
	var payload struct {
		PersonID string `json:"person_id"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err != nil {
		payload.PersonID = input
	}

	if payload.PersonID == "" {
		return "Parameter person_id wajib diisi", nil
	}

	person, err := t.store.Persons.GetByID(ctx, payload.PersonID)
	if err != nil {
		return fmt.Sprintf("Person tidak ditemukan: %v", err), nil
	}

	// Kita simulasikan ini dengan cara manual di struct

	result := map[string]any{
		"person": person,
	}

	if person.FatherID != nil {
		father, err := t.store.Persons.GetByID(ctx, *person.FatherID)
		if err == nil {
			result["father_detail"] = father
		}
	}
	if person.MotherID != nil {
		mother, err := t.store.Persons.GetByID(ctx, *person.MotherID)
		if err == nil {
			result["mother_detail"] = mother
		}
	}

	if len(person.SpouseIDs) > 0 {
		spouses := make([]*db.Person, 0, len(person.SpouseIDs))
		for _, sid := range person.SpouseIDs {
			sp, err := t.store.Persons.GetByID(ctx, sid)
			if err == nil {
				spouses = append(spouses, sp)
			}
		}
		result["spouses_detail"] = spouses
	}

	res, err := json.Marshal(result)
	if err != nil {
		return "", err
	}
	return string(res), nil
}

type CheckRelationshipTool struct {
	client *Client
	store  *db.Store
}

var _ tools.Tool = CheckRelationshipTool{}

func NewCheckRelationshipTool(c *Client, store *db.Store) *CheckRelationshipTool {
	return &CheckRelationshipTool{client: c, store: store}
}

func (t CheckRelationshipTool) Name() string {
	return "CheckRelationship"
}

func (t CheckRelationshipTool) Description() string {
	return `Cek hubungan kekerabatan/mahram spesifik antara dua orang menggunakan label langsung.
Sangat berguna untuk ditanya tentang hubungan dua orang secara spesifik.
Input harus berupa JSON dengan key "person_a_id" dan "person_b_id" yang berisi UUID.`
}

func (t CheckRelationshipTool) Call(ctx context.Context, input string) (string, error) {
	var payload struct {
		PersonAID string `json:"person_a_id"`
		PersonBID string `json:"person_b_id"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err != nil {
		return "Input tidak valid, harus JSON dengan person_a_id dan person_b_id", nil
	}

	if payload.PersonAID == "" || payload.PersonBID == "" {
		return "Parameter person_a_id dan person_b_id wajib diisi", nil
	}

	result, err := t.client.CheckRelationship(ctx, t.store, payload.PersonAID, payload.PersonBID)
	if err != nil {
		return fmt.Sprintf("Gagal mengecek hubungan: %v", err), nil
	}

	res, err := json.Marshal(result)
	if err != nil {
		return "", err
	}
	return string(res), nil
}

// Ensure interface compatibility for Tool methods that aren't strict interfaces in all LangChainGo versions.
func (t SearchPersonTool) CallWithContext(ctx context.Context, input string, callbacksHandler ...callbacks.Handler) (string, error) {
	return t.Call(ctx, input)
}
func (t GetPersonFamilyTool) CallWithContext(ctx context.Context, input string, callbacksHandler ...callbacks.Handler) (string, error) {
	return t.Call(ctx, input)
}
func (t CheckRelationshipTool) CallWithContext(ctx context.Context, input string, callbacksHandler ...callbacks.Handler) (string, error) {
	return t.Call(ctx, input)
}
func (t AskDatabaseTool) CallWithContext(ctx context.Context, input string, callbacksHandler ...callbacks.Handler) (string, error) {
	return t.Call(ctx, input)
}

type AskDatabaseTool struct {
	client *Client
	store  *db.Store
}

var _ tools.Tool = AskDatabaseTool{}

func NewAskDatabaseTool(c *Client, store *db.Store) *AskDatabaseTool {
	return &AskDatabaseTool{client: c, store: store}
}

func (t AskDatabaseTool) Name() string {
	return "AskDatabase"
}

func (t AskDatabaseTool) Description() string {
	return `Tanya langsung ke database silsilah keluarga dalam bentuk SQL (akan digenerate otomatis). 
WAJIB gunakan tool ini untuk pertanyaan yang:
- Menghitung jumlah (berapa banyak, ada berapa, total)
- Mencari berdasarkan kriteria tertentu di seluruh keluarga besar (belum menikah, perempuan, laki-laki, dll)
- Statistik atau agregat (rata-rata, terbanyak, dll)
- Daftar orang dengan filter tertentu yang tidak bisa dijawab oleh GetFilteredRelatives
Input harus berupa JSON dengan key "question" berisi pertanyaan spesifik dalam bahasa alami.
Contoh pertanyaan yang cocok: "berapa perempuan yang belum menikah?", "siapa saja laki-laki yang tidak punya anak?", "ada berapa orang di generasi ke-3?".`
}

func (t AskDatabaseTool) Call(ctx context.Context, input string) (string, error) {
	var payload struct {
		Question string `json:"question"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err != nil {
		payload.Question = input
	}

	res, err := t.client.GenerateDatabaseSQL(ctx, payload.Question)
	if err != nil {
		return "Gagal generate SQL dari pertanyaan.", nil
	}

	// Validate the LLM-generated SQL through the security guard
	guardCfg := DefaultSQLGuardConfig()
	guard := ValidateSQL(res.SQL, guardCfg)
	if !guard.Allowed {
		log.Printf("[SQLGuard] BLOCKED query for question=%q reason=%s sql=%q", payload.Question, guard.Reason, res.SQL)
		return fmt.Sprintf("Query ditolak oleh sistem keamanan: %s. Coba gunakan tool lain seperti SearchPerson atau GetFilteredRelatives.", guard.Reason), nil
	}

	// Execute with a strict timeout to prevent slow/expensive queries
	queryCtx, cancel := context.WithTimeout(ctx, sqlQueryTimeout)
	defer cancel()

	rows, err := t.store.DB.QueryContext(queryCtx, guard.SafeSQL)
	if err != nil {
		log.Printf("[SQLGuard] EXEC_ERROR question=%q sql=%q err=%v", payload.Question, guard.SafeSQL, err)
		return "Gagal mengeksekusi query database. Coba ulangi pertanyaan dengan lebih spesifik.", nil
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return "Gagal membaca hasil query.", nil
	}

	var results []map[string]any
	for rows.Next() {
		columns := make([]any, len(cols))
		columnPointers := make([]any, len(cols))
		for i := range columns {
			columnPointers[i] = &columns[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return "Gagal membaca baris hasil query.", nil
		}

		rowMap := make(map[string]any)
		for i, colName := range cols {
			val := columnPointers[i].(*any)
			switch v := (*val).(type) {
			case []byte:
				rowMap[colName] = string(v)
			default:
				rowMap[colName] = v
			}
		}
		results = append(results, rowMap)
	}

	log.Printf("[SQLGuard] OK question=%q rows=%d sql=%q", payload.Question, len(results), guard.SafeSQL)

	out, _ := json.Marshal(results)
	return fmt.Sprintf("Hasil query:\n%s\nPenjelasan: %s", string(out), res.Explanation), nil
}

// GetFilteredRelativesTool fetches a person's relatives for a given relation type
// and optionally filters by gender and/or name substring. This allows the agent
// to answer questions like "sepupu yang cowo", "sepupu yang bernama X" in one call,
// and chain the resulting IDs to further tool calls for multi-hop queries.
type GetFilteredRelativesTool struct {
	store *db.Store
}

var _ tools.Tool = GetFilteredRelativesTool{}

func NewGetFilteredRelativesTool(store *db.Store) *GetFilteredRelativesTool {
	return &GetFilteredRelativesTool{store: store}
}

func (t GetFilteredRelativesTool) Name() string {
	return "GetFilteredRelatives"
}

func (t GetFilteredRelativesTool) Description() string {
	return `Ambil daftar kerabat seseorang berdasarkan jenis relasi, dengan filter opsional gender dan/atau nama.
Berguna untuk pertanyaan seperti "sepupu yang cowo", "saudara yang bernama X", "anak perempuan dari Y".
Input harus berupa JSON dengan key:
  - "person_id" (wajib): UUID orang yang menjadi titik acuan.
  - "relation" (wajib): jenis relasi — "children", "siblings", "cousins", "spouse", "ancestors", "descendants".
  - "gender" (opsional): "laki-laki" atau "perempuan" untuk filter gender.
  - "name_contains" (opsional): substring nama untuk filter nama (case-insensitive).
Output: list orang yang cocok beserta ID mereka (dapat digunakan sebagai person_id di tool lain).`
}

func (t GetFilteredRelativesTool) Call(ctx context.Context, input string) (string, error) {
	var payload struct {
		PersonID     string `json:"person_id"`
		Relation     string `json:"relation"`
		Gender       string `json:"gender"`
		NameContains string `json:"name_contains"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err != nil {
		return "Input tidak valid, harus JSON dengan person_id dan relation", nil
	}
	if payload.PersonID == "" || payload.Relation == "" {
		return "Parameter person_id dan relation wajib diisi", nil
	}

	var persons []db.Person
	var err error

	switch payload.Relation {
	case "children":
		persons, err = t.store.Persons.GetChildren(ctx, payload.PersonID)
	case "siblings":
		persons, err = t.store.Persons.GetSiblings(ctx, payload.PersonID)
	case "cousins":
		persons, err = t.store.Persons.GetCousins(ctx, payload.PersonID)
	case "spouse":
		persons, err = t.store.Persons.GetSpouses(ctx, payload.PersonID)
	case "ancestors":
		levels, e := t.store.Persons.GetAncestors(ctx, payload.PersonID, 5)
		if e != nil {
			err = e
		} else {
			for _, lvl := range levels {
				persons = append(persons, lvl...)
			}
		}
	case "descendants":
		levels, e := t.store.Persons.GetDescendants(ctx, payload.PersonID, 3)
		if e != nil {
			err = e
		} else {
			for _, lvl := range levels {
				persons = append(persons, lvl...)
			}
		}
	default:
		return fmt.Sprintf("Relasi tidak dikenal: %s. Gunakan: children, siblings, cousins, spouse, ancestors, descendants", payload.Relation), nil
	}

	if err != nil {
		return fmt.Sprintf("Gagal mengambil data relasi: %v", err), nil
	}

	// Apply gender filter
	if payload.Gender != "" {
		wantGender := strings.ToLower(payload.Gender)
		var filtered []db.Person
		for _, p := range persons {
			g := strings.ToLower(p.Gender)
			isLaki := g == "l" || g == "laki-laki" || g == "male" || g == "m"
			isPerempuan := g == "p" || g == "perempuan" || g == "female" || g == "f"
			if strings.HasPrefix(wantGender, "laki") && isLaki {
				filtered = append(filtered, p)
			} else if strings.HasPrefix(wantGender, "perempuan") && isPerempuan {
				filtered = append(filtered, p)
			}
		}
		persons = filtered
	}

	// Apply name filter
	if payload.NameContains != "" {
		needle := strings.ToLower(payload.NameContains)
		var filtered []db.Person
		for _, p := range persons {
			if strings.Contains(strings.ToLower(p.FullName), needle) {
				filtered = append(filtered, p)
			}
		}
		persons = filtered
	}

	if len(persons) == 0 {
		return fmt.Sprintf("Tidak ada %s yang cocok dengan filter yang diberikan", payload.Relation), nil
	}

	type personSummary struct {
		ID       string `json:"id"`
		FullName string `json:"full_name"`
		Gender   string `json:"gender"`
	}
	summaries := make([]personSummary, 0, len(persons))
	for _, p := range persons {
		summaries = append(summaries, personSummary{
			ID:       p.ID,
			FullName: p.FullName,
			Gender:   p.Gender,
		})
	}

	out, err := json.Marshal(map[string]any{
		"total":  len(summaries),
		"result": summaries,
	})
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func (t GetFilteredRelativesTool) CallWithContext(ctx context.Context, input string, callbacksHandler ...callbacks.Handler) (string, error) {
	return t.Call(ctx, input)
}

// UpdateConversationFocusTool allows the agent to explicitly persist which person 
// is currently being discussed. This helps follow-up queries like "what's their address?".
type UpdateConversationFocusTool struct {
	store *db.Store
	wa    string
}

var _ tools.Tool = UpdateConversationFocusTool{}

func NewUpdateConversationFocusTool(store *db.Store, waNumber string) *UpdateConversationFocusTool {
	return &UpdateConversationFocusTool{store: store, wa: waNumber}
}

func (t UpdateConversationFocusTool) Name() string {
	return "UpdateConversationFocus"
}

func (t UpdateConversationFocusTool) Description() string {
	return `Gunakan tool ini untuk mencatat ID orang yang sedang menjadi topik utama pembicaraan saat ini ke dalam state percakapan. 
Sangat penting digunakan setelah menemukan orang baru agar pertanyaan berikutnya (seperti "apa sapaannya?") memiliki konteks yang tepat. 
Input harus berupa JSON dengan key "person_id" (UUID).`
}

func (t UpdateConversationFocusTool) Call(ctx context.Context, input string) (string, error) {
	var payload struct {
		PersonID string `json:"person_id"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err != nil {
		payload.PersonID = input
	}
	if payload.PersonID == "" {
		return "Parameter person_id wajib diisi", nil
	}

	state, err := t.store.Chat.GetState(ctx, t.wa)
	if err != nil {
		return fmt.Sprintf("Gagal mengambil state: %v", err), nil
	}

	state.LastReferencedPersonID = &payload.PersonID
	if err := t.store.Chat.UpdateState(ctx, state); err != nil {
		return fmt.Sprintf("Gagal update state: %v", err), nil
	}

	return fmt.Sprintf("Fokus percakapan berhasil diperbarui ke Person ID: %s", payload.PersonID), nil
}

func (t UpdateConversationFocusTool) CallWithContext(ctx context.Context, input string, callbacksHandler ...callbacks.Handler) (string, error) {
	return t.Call(ctx, input)
}

// UpdatePersonWANumberTool allows the agent to update a person's WhatsApp number.
type UpdatePersonWANumberTool struct {
	store *db.Store
}

var _ tools.Tool = UpdatePersonWANumberTool{}

func NewUpdatePersonWANumberTool(store *db.Store) *UpdatePersonWANumberTool {
	return &UpdatePersonWANumberTool{store: store}
}

func (t UpdatePersonWANumberTool) Name() string {
	return "UpdatePersonWANumber"
}

func (t UpdatePersonWANumberTool) Description() string {
	return `Update nomor WhatsApp seseorang di database. 
Gunakan tool ini HANYA jika ada permintaan eksplisit untuk memperbarui nomor HP/WA seseorang yang sudah ada di sistem. 
Input harus berupa JSON dengan key:
  - "person_id" (wajib): UUID orang yang akan diupdate.
  - "wa_number" (wajib): nomor WhatsApp baru (format: 628...).`
}

func (t UpdatePersonWANumberTool) Call(ctx context.Context, input string) (string, error) {
	var payload struct {
		PersonID string `json:"person_id"`
		WANumber string `json:"wa_number"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err != nil {
		return "Input tidak valid, harus JSON dengan person_id dan wa_number", nil
	}
	if payload.PersonID == "" || payload.WANumber == "" {
		return "Parameter person_id dan wa_number wajib diisi", nil
	}

	// Clean the WA number (remove +, spaces, etc)
	cleanWA := strings.TrimLeft(payload.WANumber, "+")
	cleanWA = strings.ReplaceAll(cleanWA, " ", "")
	cleanWA = strings.ReplaceAll(cleanWA, "-", "")

	if err := t.store.Persons.UpdateWANumber(ctx, payload.PersonID, cleanWA); err != nil {
		return fmt.Sprintf("Gagal update nomor WA: %v", err), nil
	}

	return fmt.Sprintf("Berhasil memperbarui nomor WhatsApp untuk Person ID %s menjadi %s", payload.PersonID, cleanWA), nil
}

func (t UpdatePersonWANumberTool) CallWithContext(ctx context.Context, input string, callbacksHandler ...callbacks.Handler) (string, error) {
	return t.Call(ctx, input)
}
