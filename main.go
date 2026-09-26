package main

import (
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/baiduxc/sshweb/internal/sshx"

	"github.com/gorilla/websocket"
)

//go:embed all:web
var embeddedWeb embed.FS

var version = "0.2.0"

// ---------------- 数据模型 ----------------

type Server struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Host       string    `json:"host"`
	Port       int       `json:"port"`
	User       string    `json:"user"`
	AuthKind   string    `json:"authKind"` // password | key
	Password   string    `json:"password,omitempty"`
	PrivateKey string    `json:"privateKey,omitempty"`
	KeyPass    string    `json:"keyPass,omitempty"`
	Note       string    `json:"note,omitempty"`
	Region     string    `json:"region,omitempty"`
	LastUsed   time.Time `json:"lastUsed,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

type Store struct {
	mu       sync.Mutex
	path     string
	Password string
	Servers  []*Server
}

func loadStore(dir string) (*Store, error) {
	s := &Store{path: filepath.Join(dir, "data.json"), Password: "admin888"}
	if b, err := os.ReadFile(s.path); err == nil {
		if err := json.Unmarshal(b, s); err != nil {
			return nil, err
		}
		s.path = filepath.Join(dir, "data.json")
		return s, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if env := os.Getenv("SSHWEB_PASSWORD"); env != "" {
		s.Password = env
	} else {
		log.Printf("[sshweb] 警告: 未设置 SSHWEB_PASSWORD，正在使用默认密码 admin888，请尽快在界面右上角修改")
	}
	if err := s.save(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) save() error {
	b, _ := json.MarshalIndent(s, "", "  ")
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *Store) List() []*Server {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]*Server, len(s.Servers))
	copy(out, s.Servers)
	return out
}

func (s *Store) Get(id string) *Server {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, v := range s.Servers {
		if v.ID == id {
			return v
		}
	}
	return nil
}

func (s *Store) Put(sv *Server) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, v := range s.Servers {
		if v.ID == sv.ID {
			sv.CreatedAt, sv.LastUsed = v.CreatedAt, v.LastUsed
			s.Servers[i] = sv
			return s.save()
		}
	}
	s.Servers = append(s.Servers, sv)
	return s.save()
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.Servers[:0]
	for _, v := range s.Servers {
		if v.ID != id {
			out = append(out, v)
		}
	}
	s.Servers = out
	return s.save()
}

func (s *Store) Touch(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, v := range s.Servers {
		if v.ID == id {
			v.LastUsed = time.Now()
			s.save()
			return
		}
	}
}

func newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ---------------- 会话 ----------------

type Sessions struct {
	mu sync.Mutex
	m  map[string]time.Time
}

func (ss *Sessions) valid(tok string) bool {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	exp, ok := ss.m[tok]
	if !ok {
		return false
	}
	if time.Now().After(exp) {
		delete(ss.m, tok)
		return false
	}
	ss.m[tok] = time.Now().Add(24 * time.Hour)
	return true
}

func (ss *Sessions) newToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	tok := hex.EncodeToString(b)
	ss.mu.Lock()
	ss.m[tok] = time.Now().Add(24 * time.Hour)
	ss.mu.Unlock()
	return tok
}

// ---------------- HTTP ----------------

type App struct {
	store    *Store
	sessions *Sessions
	pool     *sshx.Pool
	upgrader websocket.Upgrader
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func (s *Store) SetPassword(pw string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Password = pw
	return s.save()
}

func (a *App) authOK(r *http.Request) bool {
	c, err := r.Cookie("sshweb_session")
	return err == nil && a.sessions.valid(c.Value)
}

func (a *App) require(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.authOK(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "未登录"})
			return
		}
		next(w, r)
	}
}

func requestIsTLS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, 400, map[string]string{"error": "请求格式错误"})
		return
	}
	if subtle.ConstantTimeCompare([]byte(body.Password), []byte(a.store.Password)) != 1 {
		time.Sleep(500 * time.Millisecond)
		writeJSON(w, 401, map[string]string{"error": "密码错误"})
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: "sshweb_session", Value: a.sessions.newToken(), Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, MaxAge: 86400, Secure: requestIsTLS(r),
	})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	var in struct {
		Old string `json:"old"`
		New string `json:"new"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, 400, map[string]string{"error": "请求格式错误"})
		return
	}
	if len(in.New) < 6 {
		writeJSON(w, 400, map[string]string{"error": "新密码至少 6 位"})
		return
	}
	if subtle.ConstantTimeCompare([]byte(in.Old), []byte(a.store.Password)) != 1 {
		writeJSON(w, 401, map[string]string{"error": "原密码错误"})
		return
	}
	if err := a.store.SetPassword(in.New); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "sshweb_session", Value: "", Path: "/", MaxAge: -1})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) handleSession(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"loggedIn": a.authOK(r), "version": version})
}

func sanitize(s *Server) map[string]any {
	return map[string]any{
		"id": s.ID, "name": s.Name, "host": s.Host, "port": s.Port,
		"user": s.User, "authKind": s.AuthKind, "note": s.Note, "region": s.Region,
		"hasSecret": s.Password != "" || s.PrivateKey != "",
		"lastUsed":  s.LastUsed, "createdAt": s.CreatedAt,
	}
}

func (a *App) handleServers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		out := []map[string]any{}
		for _, s := range a.store.List() {
			out = append(out, sanitize(s))
		}
		writeJSON(w, 200, out)
	case http.MethodPost:
		var in struct {
			ID, Name, Host, User, AuthKind, Password, PrivateKey, KeyPass, Note, Region string
			Port                                                                        int
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeJSON(w, 400, map[string]string{"error": "请求格式错误"})
			return
		}
		if in.Name == "" || in.Host == "" || in.User == "" {
			writeJSON(w, 400, map[string]string{"error": "名称、主机、用户名必填"})
			return
		}
		if in.Port <= 0 || in.Port > 65535 {
			in.Port = 22
		}
		if in.AuthKind != "key" {
			in.AuthKind = "password"
		}
		sv := a.store.Get(in.ID)
		if sv == nil {
			sv = &Server{ID: newID(), CreatedAt: time.Now()}
		}
		sv.Name, sv.Host, sv.Port, sv.User, sv.AuthKind, sv.Note, sv.Region = in.Name, in.Host, in.Port, in.User, in.AuthKind, in.Note, strings.TrimSpace(in.Region)
		if in.Password != "" {
			sv.Password = in.Password
		}
		if in.PrivateKey != "" {
			sv.PrivateKey, sv.KeyPass = in.PrivateKey, in.KeyPass
		}
		if sv.AuthKind == "password" && sv.Password == "" {
			writeJSON(w, 400, map[string]string{"error": "请填写登录密码"})
			return
		}
		if sv.AuthKind == "key" && sv.PrivateKey == "" {
			writeJSON(w, 400, map[string]string{"error": "请粘贴 SSH 私钥"})
			return
		}
		if err := a.store.Put(sv); err != nil {
			writeJSON(w, 500, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, 200, sanitize(sv))
	default:
		http.Error(w, "method not allowed", 405)
	}
}

func (a *App) handleServerOne(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/servers/")
	if strings.HasSuffix(path, "/test") {
		id := strings.TrimSuffix(path, "/test")
		sv := a.store.Get(id)
		if sv == nil {
			writeJSON(w, 404, map[string]string{"error": "服务器不存在"})
			return
		}
		si := sv.ServerInfo()
		res := sshx.TestConn(&si, 8*time.Second)
		if res.Err != "" {
			writeJSON(w, 200, map[string]any{"ok": false, "error": res.Err})
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "hostname": res.Hostname, "uptime": res.Uptime, "uname": res.Uname})
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", 405)
		return
	}
	if path == "" {
		http.Error(w, "need id", 400)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": a.store.Delete(path) == nil})
}

// ---------------- WebSocket 终端 ----------------

func (a *App) handleTerminal(w http.ResponseWriter, r *http.Request) {
	if !a.authOK(r) {
		http.Error(w, "unauthorized", 401)
		return
	}
	id := r.URL.Query().Get("server")
	sv := a.store.Get(id)
	if sv == nil {
		http.Error(w, "server not found", 404)
		return
	}
	ws, err := a.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	si := sv.ServerInfo()
	if err := a.pool.Attach(ws, &si); err != nil {
		log.Printf("terminal %s@%s: %v", sv.User, sv.Host, err)
	}
	a.store.Touch(id)
}

func (s *Server) ServerInfo() sshx.ServerInfo {
	return sshx.ServerInfo{
		Host: s.Host, Port: s.Port, User: s.User, AuthKind: s.AuthKind,
		Password: s.Password, PrivateKey: s.PrivateKey, KeyPass: s.KeyPass,
	}
}

func main() {
	dataEnv := os.Getenv("SSHWEB_DATA")
	if dataEnv == "" {
		dataEnv = "data"
	}
	dir := flag.String("data", dataEnv, "数据目录")
	listen := flag.String("listen", ":45678", "监听地址")
	flag.Parse()
	if err := os.MkdirAll(*dir, 0o700); err != nil {
		log.Fatal(err)
	}

	store, err := loadStore(*dir)
	if err != nil {
		log.Fatalf("加载数据失败: %v", err)
	}
	app := &App{
		store:    store,
		sessions: &Sessions{m: map[string]time.Time{}},
		pool:     sshx.NewPool(),
		upgrader: websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/login", app.handleLogin)
	mux.HandleFunc("/api/logout", app.require(app.handleLogout))
	mux.HandleFunc("/api/password", app.require(app.handleChangePassword))
	mux.HandleFunc("/api/session", app.handleSession)
	mux.HandleFunc("/api/servers", app.require(app.handleServers))
	mux.HandleFunc("/api/servers/", app.require(app.handleServerOne))
	mux.HandleFunc("/ws/terminal", app.handleTerminal)

	webFS, _ := fs.Sub(embeddedWeb, "web")
	fileServer := http.FileServer(http.FS(webFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.Header().Set("Cache-Control", "no-cache")
		}
		fileServer.ServeHTTP(w, r)
	})

	srv := &http.Server{Addr: *listen, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	fmt.Printf("SSHWeb v%s · 监听 %s · 数据 %s\n", version, *listen, *dir)
	log.Fatal(srv.ListenAndServe())
}
