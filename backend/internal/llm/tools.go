package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/baniakhzab/backend/internal/db"
	"github.com/tmc/langchaingo/callbacks"
	"github.com/tmc/langchaingo/tools"
)

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
	return `Tanya langsung ke database silsilah keluarga dalam bentuk SQL (akan digenerate otomatis). Gunakan tool ini jika ditanya siapa saudara ayah, paman, sepupu, keponakan, cucu jemaah, atau jika butuh mencari sekumpulan anggota keluarga berdasarkan kriteria tertentu.
Input harus berupa JSON dengan key "question" berisi pertanyaan spesifik dalam bahasa alami (contoh: "siapa saja sepupu saya?"). Jangan gunakan ID dalam pertanyaannya jika tidak perlu, sebut nama atau diri pengguna jika konteksnya sudah jelas.`
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
		return fmt.Sprintf("Gagal generate SQL: %v", err), nil
	}

	sqlStr := strings.TrimSpace(res.SQL)
	if !strings.HasPrefix(strings.ToUpper(sqlStr), "SELECT") && !strings.HasPrefix(strings.ToUpper(sqlStr), "WITH") {
		return "Hanya query SELECT yang diperbolehkan demi keamanan.", nil
	}

	rows, err := t.store.DB.QueryContext(ctx, sqlStr)
	if err != nil {
		return fmt.Sprintf("Gagal mengeksekusi referensi query (%s): %v. Penjelasan LLM: %s", sqlStr, err, res.Explanation), nil
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return "", err
	}

	var results []map[string]any
	for rows.Next() {
		columns := make([]any, len(cols))
		columnPointers := make([]any, len(cols))
		for i := range columns {
			columnPointers[i] = &columns[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return "", err
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

	out, _ := json.Marshal(results)
	return fmt.Sprintf("Hasil query:\n%s\nPenjelasan Query yang digunakan LLM: %s", string(out), res.Explanation), nil
}
