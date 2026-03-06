package http

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/baniakhzab/backend/internal/auth"
	"github.com/baniakhzab/backend/internal/config"
	"github.com/baniakhzab/backend/internal/db"
	"github.com/baniakhzab/backend/internal/llm"
	"github.com/baniakhzab/backend/internal/whatsapp"
)

const (
	accessTokenCookieName    = "baniakhzab_access_token"
	ajnabiyyahCacheMaxSize   = 500
	waConsumeRateLimit       = 10
	waConsumeRateLimitWindow = time.Minute
)

type Server struct {
	cfg        config.Config
	store      *db.Store
	logger     logger
	wa         *whatsapp.Client
	jwt        *auth.JWTManager
	llm        *llm.Client
	oneTimeTTL time.Duration

	ajnabiyyahCache   map[string]*llm.AjnabiyyahResult
	ajnabiyyahOrder   []string
	ajnabiyyahMaxSize int
	ajnabiyyahCacheMu sync.RWMutex

	corsAllowedOrigin   string
	waConsumeRateLimiter *rateLimiter

	sseClients map[chan []byte]bool
	sseMu      sync.RWMutex
}

type logger interface {
	Info(msg string, args ...any)
	Error(msg string, args ...any)
}

type rateLimiter struct {
	mu      sync.Mutex
	entries map[string][]time.Time
	limit   int
	window  time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		entries: make(map[string][]time.Time),
		limit:   limit,
		window:  window,
	}
}

func (rl *rateLimiter) Allow(key string, now time.Time) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if key == "" {
		key = "unknown"
	}

	cutoff := now.Add(-rl.window)
	entry := rl.entries[key]
	kept := entry[:0]
	for _, ts := range entry {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}

	if len(kept) >= rl.limit {
		rl.entries[key] = kept
		return false
	}

	kept = append(kept, now)
	rl.entries[key] = kept
	return true
}

func NewServer(cfg config.Config, store *db.Store, l logger) *Server {
	waClient := whatsapp.NewClient(
		cfg.WhatsApp.BaseURL,
		cfg.WhatsApp.BasicUser,
		cfg.WhatsApp.BasicPass,
	)

	// Load saved device ID from database
	ctx := context.Background()
	if err := store.Settings.EnsureTable(ctx); err != nil {
		l.Error("failed to ensure app_settings table", "error", err)
	} else if savedID, err := store.Settings.Get(ctx, "gowa_device_id"); err != nil {
		l.Error("failed to load gowa_device_id from db", "error", err)
	} else if savedID != "" {
		waClient.SetDeviceID(savedID)
		l.Info("loaded gowa device id from db", "device_id", savedID)
	}

	if err := store.Chat.EnsureTable(ctx); err != nil {
		l.Error("failed to ensure chat tables", "error", err)
	} else {
		l.Info("chat memory tables ready")
	}

	jwtManager := auth.NewJWTManager(cfg.Auth.JWTSecret)
	llmClient := llm.NewClient(cfg.LLM)

	ttl := cfg.Auth.OneTimeTokenTTLMinutes
	if ttl <= 0 {
		ttl = 10
	}

	return &Server{
		cfg:                 cfg,
		store:               store,
		logger:              l,
		wa:                  waClient,
		jwt:                 jwtManager,
		llm:                 llmClient,
		oneTimeTTL:          time.Duration(ttl) * time.Minute,
		ajnabiyyahCache:     make(map[string]*llm.AjnabiyyahResult),
		ajnabiyyahOrder:     make([]string, 0, ajnabiyyahCacheMaxSize),
		ajnabiyyahMaxSize:   ajnabiyyahCacheMaxSize,
		ajnabiyyahCacheMu:   sync.RWMutex{},
		corsAllowedOrigin:   frontendOrigin(cfg.Auth.FrontendBaseURL),
		waConsumeRateLimiter: newRateLimiter(waConsumeRateLimit, waConsumeRateLimitWindow),
		sseClients:          make(map[chan []byte]bool),
		sseMu:               sync.RWMutex{},
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(s.corsMiddleware)

	r.Get("/healthz", s.handleHealth)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/dev", s.handleDevAuth)
		r.Get("/admin/summary", s.handleAdminSummary)
		r.Post("/whatsapp/webhook", s.handleWhatsAppWebhook)
		r.With(s.waConsumeRateLimitMiddleware).Post("/auth/wa/consume", s.handleWAConsume)

		r.Get("/whatsapp/setup/qr", s.handleWhatsAppSetupQR)
		r.Post("/whatsapp/setup/code", s.handleWhatsAppSetupCode)
		r.Post("/whatsapp/setup/logout", s.handleWhatsAppSetupLogout)
		r.Get("/whatsapp/setup/status", s.handleWhatsAppSetupStatus)
		r.Get("/whatsapp/messages/stream", s.handleWhatsAppMessagesStream)
		r.Post("/whatsapp/messages/send", s.handleWhatsAppMessagesSend)

		r.Group(func(r chi.Router) {
			r.Use(s.authMiddleware)

			r.Get("/persons", s.handleListPersons)
			r.Get("/parent-couples", s.handleParentCouples)
			r.Post("/persons", s.handleCreatePerson)
			r.Get("/persons/{id}", s.handleGetPerson)
			r.Put("/persons/{id}", s.handleUpdatePerson)
			r.Delete("/persons/{id}", s.handleDeletePerson)

			r.Get("/tree", s.handleTree)
			r.Post("/llm/ajnabiyyah", s.handleAjnabiyyah)
		})
	})

	return r
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleAdminSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	persons, err := s.store.Persons.List(ctx, 1, 0)
	if err != nil {
		s.logger.Error("admin summary persons failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load summary")
		return
	}

	type summary struct {
		PersonsCount int `json:"persons_count"`
	}

	res := summary{
		PersonsCount: len(persons),
	}

	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleDevAuth(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if !s.cfg.IsDevelopment() {
		writeError(w, http.StatusForbidden, "dev auth disabled")
		return
	}

	person, err := s.store.Persons.GetByWANumber(ctx, "local-dev")
	if err != nil {
		input := db.PersonInput{
			FullName:   "Local Dev",
			Gender:     "",
			WANumber:   "local-dev",
			Alamat:     "",
			FatherID:   nil,
			MotherID:   nil,
			SpouseIDs:  nil,
			Generation: "",
		}
		person, err = s.store.Persons.Insert(ctx, input)
		if err != nil {
			s.logger.Error("create dev person failed", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to create dev user")
			return
		}
	}

	accessToken, err := s.jwt.Generate(person.ID, person.WANumber, 24*time.Hour)
	if err != nil {
		s.logger.Error("generate dev jwt failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	s.setAccessTokenCookie(w, accessToken, 24*time.Hour)

	writeJSON(w, http.StatusOK, map[string]any{
		"token_type": "cookie",
		"person":     person,
	})
}

func (s *Server) handleListPersons(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	persons, err := s.store.Persons.List(ctx, limit, offset)
	if err != nil {
		s.logger.Error("list persons failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list persons")
		return
	}

	writeJSON(w, http.StatusOK, persons)
}

func (s *Server) handleParentCouples(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	
	couples, err := s.store.Persons.GetParentCouples(ctx)
	if err != nil {
		s.logger.Error("list parent couples failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list parent couples")
		return
	}
	
	writeJSON(w, http.StatusOK, couples)
}

func (s *Server) handleCreatePerson(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var input db.PersonInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if input.FullName == "" {
		writeError(w, http.StatusBadRequest, "full_name is required")
		return
	}

	person, err := s.store.Persons.Insert(ctx, input)
	if err != nil {
		s.logger.Error("create person failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create person")
		return
	}

	writeJSON(w, http.StatusCreated, person)
}

func (s *Server) handleGetPerson(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	person, err := s.store.Persons.GetByID(ctx, id)
	if err != nil {
		writeError(w, http.StatusNotFound, "person not found")
		return
	}

	writeJSON(w, http.StatusOK, person)
}

func (s *Server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	var input db.PersonInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if input.FullName == "" {
		writeError(w, http.StatusBadRequest, "full_name is required")
		return
	}

	person, err := s.store.Persons.Update(ctx, id, input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update person")
		return
	}

	writeJSON(w, http.StatusOK, person)
}

func (s *Server) handleDeletePerson(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	if err := s.store.Persons.Delete(ctx, id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete person")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTree(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	persons, err := s.store.Persons.List(ctx, 1000, 0)
	if err != nil {
		s.logger.Error("list persons for tree failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load tree")
		return
	}

	type treePerson struct {
		db.Person
		Name         string  `json:"name"`
		ParentID     *string `json:"parent_id,omitempty"`
		SpouseID     *string `json:"spouse_id,omitempty"`
		IsMantu      bool    `json:"is_mantu"`
		BirthDate    *string `json:"birth_date,omitempty"`
		StatusMahram *bool   `json:"status_mahram,omitempty"`
	}

	out := make([]treePerson, 0, len(persons))
	for i := range persons {
		p := persons[i]

		var parentID *string
		if p.FatherID != nil {
			parentID = p.FatherID
		} else if p.MotherID != nil {
			parentID = p.MotherID
		}

		var spouseID *string
		if len(p.SpouseIDs) > 0 {
			first := p.SpouseIDs[0]
			spouseID = &first
		}

		hasParents := p.FatherID != nil || p.MotherID != nil
		out = append(out, treePerson{
			Person:       p,
			Name:         p.FullName,
			ParentID:     parentID,
			SpouseID:     spouseID,
			IsMantu:      (!hasParents && spouseID != nil),
			BirthDate:    nil,
			StatusMahram: nil,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"persons": out,
	})
}

type ajnabiyyahRequest struct {
	PersonAID string `json:"person_a_id"`
	PersonBID string `json:"person_b_id"`
}

func (s *Server) handleAjnabiyyah(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req ajnabiyyahRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.PersonAID = strings.TrimSpace(req.PersonAID)
	req.PersonBID = strings.TrimSpace(req.PersonBID)
	if req.PersonAID == "" || req.PersonBID == "" {
		writeError(w, http.StatusBadRequest, "person_a_id and person_b_id are required")
		return
	}
	key := req.PersonAID + ":" + req.PersonBID

	s.ajnabiyyahCacheMu.RLock()
	if cached, ok := s.ajnabiyyahCache[key]; ok {
		s.ajnabiyyahCacheMu.RUnlock()
		writeJSON(w, http.StatusOK, cached)
		return
	}
	s.ajnabiyyahCacheMu.RUnlock()

	res, err := s.llm.RunAjnabiyyah(ctx, s.store, req.PersonAID, req.PersonBID)
	if err != nil {
		s.logger.Error("ajnabiyyah llm failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to run ajnabiyyah analysis")
		return
	}

	s.cacheAjnabiyyahResult(key, res)

	writeJSON(w, http.StatusOK, res)
}

type whatsappWebhookPayload struct {
	Event    string `json:"event"`
	DeviceID string `json:"device_id"`
	Payload  struct {
		ID       string `json:"id"`
		ChatID   string `json:"chat_id"`
		From     string `json:"from"`
		FromName string `json:"from_name"`
		Body     string `json:"body"`
	} `json:"payload"`
}

func (s *Server) handleWhatsAppWebhook(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var payload whatsappWebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "invalid webhook payload"})
		return
	}

	if payload.Event != "message" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}

	body := strings.TrimSpace(payload.Payload.Body)
	bodyLower := strings.ToLower(body)

	fromJID := payload.Payload.From
	if fromJID == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "missing from"})
		return
	}

	waNumber := normalizeWANumber(fromJID)
	if waNumber == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "invalid from"})
		return
	}

	person, err := s.store.Persons.GetByWANumber(ctx, waNumber)
	if err != nil {
		s.logger.Info("GetByWANumber failed during webhook", "fromJID", fromJID, "waNumber", waNumber, "error", err)
	}

	pid := ""
	pname := payload.Payload.FromName
	if person != nil {
		pid = person.ID
		pname = person.FullName
	} else {
		s.logger.Info("GetByWANumber returned nil person (not found)", "fromJID", fromJID, "waNumber", waNumber)
	}
	msgData := map[string]any{
		"id":         payload.Payload.ID,
		"chat_jid":   payload.Payload.ChatID,
		"from_jid":   fromJID,
		"from_name":  pname,
		"body":       body,
		"is_from_me": false,
		"person_id":  pid,
		"timestamp":  time.Now().Format(time.RFC3339),
	}
	if b, err := json.Marshal(msgData); err == nil {
		s.broadcastSSE(b)
	}

	const ajnabiyyahPhrase = "tolong tunjukkan kepada saya yang termasuk bukan mahrom dari silsilah bani akhzab"
	const relationPrefix = "tolong tunjukkan hubungan saya dengan si "

	if strings.EqualFold(body, "AUTH") {
		if person == nil {
			_ = s.wa.SendText(ctx, waNumber, "Nomor Anda belum terdaftar di sistem.")
			writeJSON(w, http.StatusOK, map[string]string{"status": "unknown-wa"})
			return
		}

		token, err := randomToken()
		if err != nil {
			s.logger.Error("generate token failed", "error", err)
			writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "failed to generate token"})
			return
		}
		tokenHash := hashToken(token)

		expiresAt := time.Now().Add(s.oneTimeTTL)
		if _, err := s.store.Tokens.CreateOneTime(ctx, person.WANumber, tokenHash, expiresAt); err != nil {
			s.logger.Error("store token failed", "error", err)
			writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "failed to store token"})
			return
		}

		loginURL, err := url.Parse(s.cfg.Auth.FrontendBaseURL)
		if err != nil {
			s.logger.Error("invalid frontend base url", "error", err)
			writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "invalid configuration"})
			return
		}
		loginURL.Path = "/login"
		q := loginURL.Query()
		q.Set("token", token)
		loginURL.RawQuery = q.Encode()

		msg := "Silakan klik link berikut untuk login: " + loginURL.String()
		if err := s.wa.SendText(ctx, waNumber, msg); err != nil {
			s.logger.Error("send whatsapp message failed", "error", err)
			writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "failed to send whatsapp message"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	if bodyLower == ajnabiyyahPhrase {
		writeJSON(w, http.StatusOK, map[string]string{"status": "processing"})
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			if err := s.handleWhatsAppAjnabiyyahCommand(bgCtx, waNumber); err != nil {
				s.logger.Error("handle whatsapp ajnabiyyah command failed", "error", err)
			}
		}()
		return
	}

	if strings.HasPrefix(bodyLower, relationPrefix) {
		name := strings.TrimSpace(body[len(relationPrefix):])
		if name == "" {
			if err := s.wa.SendText(ctx, waNumber, "Sebutkan nama setelah frasa 'tolong tunjukkan hubungan saya dengan si'."); err != nil {
				s.logger.Error("send whatsapp missing name message failed", "error", err)
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "invalid-relationship-command"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "processing"})
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			if err := s.handleWhatsAppRelationshipCommand(bgCtx, waNumber, name); err != nil {
				s.logger.Error("handle whatsapp relationship command failed", "error", err)
			}
		}()
		return
	}

	// Fallback to LangChainGo Agent
	if person == nil {
		_ = s.wa.SendText(ctx, waNumber, "Maaf, nomor Anda belum terdaftar di sistem silsilah Bani Akhzab.")
		writeJSON(w, http.StatusOK, map[string]string{"status": "unknown-wa-agent"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "processing"})

	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		aiRes, err := s.llm.ChatWithMemory(bgCtx, s.store, person, waNumber, body)
		if err != nil {
			s.logger.Error("chat with memory failed", "error", err)
			_ = s.wa.SendText(bgCtx, waNumber, "Maaf, sistem AI sedang mengalami gangguan saat memproses pertanyaan Anda.")
			return
		}

		if err := s.wa.SendText(bgCtx, waNumber, aiRes); err != nil {
			s.logger.Error("send whatsapp agent response failed", "error", err)
		}
	}()
}

func (s *Server) handleWhatsAppAjnabiyyahCommand(ctx context.Context, waNumber string) error {
	person, err := s.store.Persons.GetByWANumber(ctx, waNumber)
	if err != nil {
		if sendErr := s.wa.SendText(ctx, waNumber, "Nomor Anda belum terdaftar di sistem, sehingga tidak dapat dianalisis."); sendErr != nil {
			s.logger.Error("send whatsapp unregistered message failed", "error", sendErr)
		}
		return nil
	}

	persons, err := s.store.Persons.List(ctx, 500, 0)
	if err != nil {
		return err
	}
	if len(persons) == 0 {
		if sendErr := s.wa.SendText(ctx, waNumber, "Data silsilah belum tersedia."); sendErr != nil {
			s.logger.Error("send whatsapp empty tree message failed", "error", sendErr)
		}
		return nil
	}

	selfID := person.ID
	selfGender := strings.TrimSpace(strings.ToLower(person.Gender))

	var selfFather, selfMother string
	if person.FatherID != nil {
		selfFather = *person.FatherID
	}
	if person.MotherID != nil {
		selfMother = *person.MotherID
	}

	spouseSet := make(map[string]struct{})
	for _, sid := range person.SpouseIDs {
		spouseSet[sid] = struct{}{}
	}

	type candidate struct {
		ID   string
		Name string
	}

	var candidates []candidate
	for i := range persons {
		p := persons[i]
		if p.ID == selfID {
			continue
		}
		g := strings.TrimSpace(strings.ToLower(p.Gender))
		if selfGender != "" && g != "" && g == selfGender {
			continue
		}

		if p.ID == selfFather || p.ID == selfMother {
			continue
		}
		if person.FatherID != nil && p.FatherID != nil && *person.FatherID == *p.FatherID {
			continue
		}
		if person.MotherID != nil && p.MotherID != nil && *person.MotherID == *p.MotherID {
			continue
		}
		if p.FatherID != nil && *p.FatherID == selfID {
			continue
		}
		if p.MotherID != nil && *p.MotherID == selfID {
			continue
		}

		if _, ok := spouseSet[p.ID]; ok {
			continue
		}
		if containsID(p.SpouseIDs, selfID) {
			continue
		}

		name := strings.TrimSpace(p.FullName)
		if name == "" {
			name = p.ID
		}
		candidates = append(candidates, candidate{
			ID:   p.ID,
			Name: name,
		})
	}

	if len(candidates) == 0 {
		if sendErr := s.wa.SendText(ctx, waNumber, "Tidak ditemukan anggota keluarga lain yang jelas berstatus ajnabi terhadap Anda berdasarkan data yang ada."); sendErr != nil {
			s.logger.Error("send whatsapp no candidates message failed", "error", sendErr)
		}
		return nil
	}

	pageSize := 10
	total := len(candidates)
	pages := (total + pageSize - 1) / pageSize

	index := 0
	for page := 0; page < pages; page++ {
		end := index + pageSize
		if end > total {
			end = total
		}

		var b strings.Builder
		if page == 0 {
			fmt.Fprintf(&b, "Berikut daftar anggota keluarga yang berpotensi ajnabi (bukan mahram) terhadap Anda, %s:\n", person.FullName)
		}
		fmt.Fprintf(&b, "Halaman %d/%d\n", page+1, pages)

		for i := index; i < end; i++ {
			num := i + 1
			fmt.Fprintf(&b, "%d. %s\n", num, candidates[i].Name)
		}

		text := strings.TrimSpace(b.String())
		if text == "" {
			index = end
			continue
		}

		if err := s.wa.SendText(ctx, waNumber, text); err != nil {
			return err
		}

		index = end
	}

	u, err := url.Parse(s.cfg.Auth.FrontendBaseURL)
	if err == nil {
		q := u.Query()
		q.Set("focus_id", person.ID)
		u.RawQuery = q.Encode()
		linkMsg := fmt.Sprintf("Lihat visualisasi hubungan di: %s", u.String())
		if err := s.wa.SendText(ctx, waNumber, linkMsg); err != nil {
			s.logger.Error("send whatsapp ajnabiyyah link failed", "error", err)
		}
	}

	return nil
}

func (s *Server) handleWhatsAppRelationshipCommand(ctx context.Context, waNumber, targetName string) error {
	personA, err := s.store.Persons.GetByWANumber(ctx, waNumber)
	if err != nil {
		if sendErr := s.wa.SendText(ctx, waNumber, "Nomor Anda belum terdaftar di sistem, sehingga tidak dapat dianalisis."); sendErr != nil {
			s.logger.Error("send whatsapp unregistered message failed", "error", sendErr)
		}
		return nil
	}

	matches, err := s.store.Persons.SearchByName(ctx, targetName, 5)
	if err != nil {
		return err
	}
	if len(matches) == 0 {
		msg := fmt.Sprintf("Nama \"%s\" tidak ditemukan di data keluarga.", targetName)
		if sendErr := s.wa.SendText(ctx, waNumber, msg); sendErr != nil {
			s.logger.Error("send whatsapp name not found message failed", "error", sendErr)
		}
		return nil
	}

	personB := matches[0]
	if personB.ID == personA.ID {
		if sendErr := s.wa.SendText(ctx, waNumber, "Itu adalah diri Anda sendiri."); sendErr != nil {
			s.logger.Error("send whatsapp self relation message failed", "error", sendErr)
		}
		return nil
	}

	res, err := s.llm.CheckRelationship(ctx, s.store, personA.ID, personB.ID)
	if err != nil {
		s.logger.Error("llm relationship check failed", "error", err)
		if sendErr := s.wa.SendText(ctx, waNumber, "Maaf, fitur analisis hubungan belum dapat digunakan saat ini."); sendErr != nil {
			s.logger.Error("send whatsapp relationship error message failed", "error", sendErr)
		}
		return nil
	}

	label := strings.TrimSpace(res.Label)
	explanation := strings.TrimSpace(res.Explanation)

	var b strings.Builder
	fmt.Fprintf(&b, "Hubungan antara %s dan %s:\n", personA.FullName, personB.FullName)
	if label != "" {
		fmt.Fprintf(&b, "Ringkasan: %s\n", label)
	}
	if explanation != "" {
		fmt.Fprintf(&b, "Penjelasan: %s\n", explanation)
	}
	if label == "" && explanation == "" {
		if strings.TrimSpace(res.Raw) != "" {
			b.WriteString(strings.TrimSpace(res.Raw))
		}
	}

	text := strings.TrimSpace(b.String())
	if text != "" {
		if err := s.wa.SendText(ctx, waNumber, text); err != nil {
			return err
		}
	}

	u, err := url.Parse(s.cfg.Auth.FrontendBaseURL)
	if err == nil {
		q := u.Query()
		q.Set("a", personA.ID)
		q.Set("b", personB.ID)
		u.RawQuery = q.Encode()
		linkMsg := fmt.Sprintf("Lihat visualisasi hubungan di: %s", u.String())
		if err := s.wa.SendText(ctx, waNumber, linkMsg); err != nil {
			s.logger.Error("send whatsapp relationship link failed", "error", err)
		}
	}

	return nil
}

type waConsumeRequest struct {
	Token string `json:"token"`
}

func (s *Server) handleWAConsume(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req waConsumeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}
	tokenHash := hashToken(req.Token)

	now := time.Now()
	t, err := s.store.Tokens.GetValid(ctx, tokenHash, now)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid or expired token")
		return
	}

	person, err := s.store.Persons.GetByWANumber(ctx, t.WANumber)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "wa number is not linked")
		return
	}

	if err := s.store.Tokens.MarkUsed(ctx, t.ID, now); err != nil {
		s.logger.Error("mark token used failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to consume token")
		return
	}

	accessToken, err := s.jwt.Generate(person.ID, person.WANumber, 24*time.Hour)
	if err != nil {
		s.logger.Error("generate jwt failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to generate access token")
		return
	}
	s.setAccessTokenCookie(w, accessToken, 24*time.Hour)

	writeJSON(w, http.StatusOK, map[string]any{
		"token_type": "cookie",
		"person":     person,
	})
}

func (s *Server) checkSetupPassword(r *http.Request) bool {
	expected := strings.TrimSpace(s.cfg.WhatsApp.SetupPassword)
	actual := strings.TrimSpace(r.Header.Get("X-Setup-Password"))
	if expected == "" {
		return s.cfg.IsDevelopment()
	}
	return actual == expected
}

func (s *Server) handleWhatsAppSetupQR(w http.ResponseWriter, r *http.Request) {
	if !s.checkSetupPassword(r) {
		writeError(w, http.StatusUnauthorized, "invalid setup password")
		return
	}

	res, err := s.wa.GetLoginQR(r.Context())
	if err != nil {
		s.logger.Error("get login qr failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get login qr from gowa")
		return
	}

	// Persist the device ID to the database
	if deviceID := s.wa.GetDeviceID(); deviceID != "" {
		if err := s.store.Settings.Set(r.Context(), "gowa_device_id", deviceID); err != nil {
			s.logger.Error("failed to save gowa_device_id", "error", err)
		} else {
			s.logger.Info("saved gowa device id to db", "device_id", deviceID)
		}
	}

	writeJSON(w, http.StatusOK, res)
}

type waSetupCodeRequest struct {
	Phone string `json:"phone"`
}

func (s *Server) handleWhatsAppSetupCode(w http.ResponseWriter, r *http.Request) {
	if !s.checkSetupPassword(r) {
		writeError(w, http.StatusUnauthorized, "invalid setup password")
		return
	}

	var req waSetupCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Phone = strings.TrimSpace(req.Phone)
	if req.Phone == "" {
		writeError(w, http.StatusBadRequest, "phone is required")
		return
	}

	res, err := s.wa.GetLoginCode(r.Context(), req.Phone)
	if err != nil {
		s.logger.Error("get login code failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get login code from gowa")
		return
	}

	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleWhatsAppSetupLogout(w http.ResponseWriter, r *http.Request) {
	if !s.checkSetupPassword(r) {
		writeError(w, http.StatusUnauthorized, "invalid setup password")
		return
	}

	err := s.wa.Logout(r.Context())
	if err != nil {
		s.logger.Error("logout failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to logout from gowa")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func normalizeWANumber(jid string) string {
	if jid == "" {
		return ""
	}
	parts := strings.SplitN(jid, "@", 2)
	return parts[0]
}

func randomToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func containsID(list []string, id string) bool {
	for _, v := range list {
		if v == id {
			return true
		}
	}
	return false
}

type authContextKey struct{}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var token string

		authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				writeError(w, http.StatusUnauthorized, "invalid authorization header")
				return
			}
			token = strings.TrimSpace(parts[1])
		} else if c, err := r.Cookie(accessTokenCookieName); err == nil {
			token = strings.TrimSpace(c.Value)
		}

		if token == "" {
			writeError(w, http.StatusUnauthorized, "missing authentication token")
			return
		}

		claims, err := s.jwt.Parse(token)
		if err != nil {
			s.clearAccessTokenCookie(w)
			writeError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		ctx := context.WithValue(r.Context(), authContextKey{}, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" && s.corsAllowedOrigin != "" && strings.EqualFold(origin, s.corsAllowedOrigin) {
			w.Header().Set("Access-Control-Allow-Origin", s.corsAllowedOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Setup-Password")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Add("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) waConsumeRateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.waConsumeRateLimiter == nil {
			next.ServeHTTP(w, r)
			return
		}
		clientIP := requestClientIP(r)
		if !s.waConsumeRateLimiter.Allow(clientIP, time.Now()) {
			writeError(w, http.StatusTooManyRequests, "too many auth attempts, please try again later")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func requestClientIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}

	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func frontendOrigin(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return strings.ToLower(u.Scheme + "://" + u.Host)
}

func (s *Server) setAccessTokenCookie(w http.ResponseWriter, token string, ttl time.Duration) {
	expiresAt := time.Now().Add(ttl)
	http.SetCookie(w, &http.Cookie{
		Name:     accessTokenCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		Secure:   !s.cfg.IsDevelopment(),
		SameSite: http.SameSiteStrictMode,
	})
}

func (s *Server) clearAccessTokenCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     accessTokenCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   !s.cfg.IsDevelopment(),
		SameSite: http.SameSiteStrictMode,
	})
}

func (s *Server) cacheAjnabiyyahResult(key string, res *llm.AjnabiyyahResult) {
	s.ajnabiyyahCacheMu.Lock()
	defer s.ajnabiyyahCacheMu.Unlock()

	if _, exists := s.ajnabiyyahCache[key]; !exists {
		s.ajnabiyyahOrder = append(s.ajnabiyyahOrder, key)
	}
	s.ajnabiyyahCache[key] = res

	for len(s.ajnabiyyahCache) > s.ajnabiyyahMaxSize && len(s.ajnabiyyahOrder) > 0 {
		oldest := s.ajnabiyyahOrder[0]
		s.ajnabiyyahOrder = s.ajnabiyyahOrder[1:]
		delete(s.ajnabiyyahCache, oldest)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
	})
}

func (s *Server) broadcastSSE(data []byte) {
	s.sseMu.RLock()
	defer s.sseMu.RUnlock()
	for ch := range s.sseClients {
		// Non-blocking send
		select {
		case ch <- data:
		default:
		}
	}
}

func (s *Server) handleWhatsAppSetupStatus(w http.ResponseWriter, r *http.Request) {
	if !s.checkSetupPassword(r) {
		writeError(w, http.StatusUnauthorized, "invalid setup password")
		return
	}
	res, err := s.wa.GetDeviceStatus(r.Context())
	if err != nil {
		s.logger.Error("get device status failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get device status")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleWhatsAppMessagesStream(w http.ResponseWriter, r *http.Request) {
	if !s.checkSetupPassword(r) {
		writeError(w, http.StatusUnauthorized, "invalid setup password")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "Streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan []byte, 100)
	s.sseMu.Lock()
	s.sseClients[ch] = true
	s.sseMu.Unlock()

	defer func() {
		s.sseMu.Lock()
		delete(s.sseClients, ch)
		s.sseMu.Unlock()
		close(ch)
	}()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-ch:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		}
	}
}

type waSendReq struct {
	Phone   string `json:"phone"`
	Message string `json:"message"`
}

func (s *Server) handleWhatsAppMessagesSend(w http.ResponseWriter, r *http.Request) {
	if !s.checkSetupPassword(r) {
		writeError(w, http.StatusUnauthorized, "invalid setup password")
		return
	}
	var req waSendReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("failed to decode send message payload", "error", err)
		writeError(w, http.StatusBadRequest, "invalid request format")
		return
	}

	if req.Phone == "" || req.Message == "" {
		writeError(w, http.StatusBadRequest, "phone and message are required")
		return
	}

	err := s.wa.SendText(r.Context(), req.Phone, req.Message)
	if err != nil {
		s.logger.Error("failed to send message", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to send message")
		return
	}

	chatJid := req.Phone
	if !strings.Contains(chatJid, "@") {
		chatJid += "@s.whatsapp.net"
	}

	person, _ := s.store.Persons.GetByWANumber(r.Context(), normalizeWANumber(req.Phone))
	pid := ""
	pname := req.Phone
	if person != nil {
		pid = person.ID
		pname = person.FullName
	}

	msgData := map[string]any{
		"id":          fmt.Sprintf("out-%d", time.Now().UnixNano()),
		"chat_jid":    chatJid,
		"from_jid":    "me",
		"from_name":   "me",
		"body":        req.Message,
		"is_from_me":  true,
		"person_id":   pid,
		"person_name": pname,
		"timestamp":   time.Now().Format(time.RFC3339),
	}
	b, _ := json.Marshal(msgData)
	s.broadcastSSE(b)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
