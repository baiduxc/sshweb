package main

// store.go — SQLite 持久化存储（modernc.org/sqlite 纯 Go 驱动，无 cgo，单二进制）
//   表：meta(k,v) 密码等元数据 / servers / probes / players(JSON blob)
//       blocks(x,y,z,type) 主键 (x,y,z) / apikeys(key,name,created_at)
//   首次启动自动从旧 data.json 迁移一次，迁移后旧文件改名 data.json.migrated

import (
	crand "crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type FarmPlayer struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Materials int    `json:"materials"`
	LastBonus string `json:"lastBonus,omitempty"`
	IP        string `json:"ip"`
	CreatedAt string `json:"createdAt,omitempty"`
	// 断线重连原地恢复：最后位置
	HasPos bool    `json:"hasPos,omitempty"`
	PX     float64 `json:"px,omitempty"`
	PY     float64 `json:"py,omitempty"`
	PZ     float64 `json:"pz,omitempty"`
}

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
	mu        sync.Mutex
	db        *sql.DB
	dir       string
	Password  string
	Servers   []*Server
	ProbeList []*Probe
	Players   map[string]*FarmPlayer
}

const schemaSQL = `
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS servers(id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS probes(id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS players(ip TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS blocks(x INTEGER NOT NULL, y INTEGER NOT NULL, z INTEGER NOT NULL, type TEXT NOT NULL, PRIMARY KEY(x,y,z));
CREATE TABLE IF NOT EXISTS apikeys(key TEXT PRIMARY KEY, name TEXT, created_at TEXT);
`

func openDB(dir string) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)", filepath.Join(dir, "sshweb.db"))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // 单连接避免 SQLITE_BUSY
	if _, err := db.Exec(schemaSQL); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// legacyStore 旧 data.json 的结构（迁移用；tag 必须与旧版序列化键一致，否则迁移丢数据）
type legacyStore struct {
	Password  string
	Servers   []*Server
	Blocks    map[string]string      `json:"blocks"`
	ProbeList []*Probe               `json:"probes"`
	Players   map[string]*FarmPlayer `json:"players"`
}

func loadStore(dir string) (*Store, error) {
	db, err := openDB(dir)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db, dir: dir, Password: "admin888", Players: map[string]*FarmPlayer{}}

	// 从旧 data.json 一次性迁移
	jsonPath := filepath.Join(dir, "data.json")
	if b, err := os.ReadFile(jsonPath); err == nil {
		var old legacyStore
		if err := json.Unmarshal(b, &old); err != nil {
			db.Close()
			return nil, fmt.Errorf("data.json 解析失败: %w", err)
		}
		s.Password = old.Password
		s.Servers = old.Servers
		s.ProbeList = old.ProbeList
		if old.Players != nil {
			s.Players = old.Players
		}
		if err := s.save(); err != nil {
			db.Close()
			return nil, err
		}
		if len(old.Blocks) > 0 {
			tx, err := db.Begin()
			if err != nil {
				db.Close()
				return nil, err
			}
			st, err := tx.Prepare("INSERT OR REPLACE INTO blocks(x,y,z,type) VALUES(?,?,?,?)")
			if err != nil {
				tx.Rollback()
				db.Close()
				return nil, err
			}
			n := 0
			for k, v := range old.Blocks {
				if v == "-" || v == "" {
					continue
				}
				var x, y, z int
				if _, err := fmt.Sscanf(k, "%d,%d,%d", &x, &y, &z); err != nil {
					continue
				}
				if _, err := st.Exec(x, y, z, v); err == nil {
					n++
				}
			}
			st.Close()
			if err := tx.Commit(); err != nil {
				db.Close()
				return nil, err
			}
			log.Printf("[store] 从 data.json 迁移 %d 个方块到 SQLite", n)
		}
		if err := os.Rename(jsonPath, jsonPath+".migrated"); err != nil {
			log.Printf("[store] data.json 改名失败: %v", err)
		} else {
			log.Printf("[store] 旧 data.json 已迁移到 SQLite，改名为 data.json.migrated")
		}
		return s, nil
	}

	// 正常从 SQLite 加载
	if v, err := s.metaGet("password"); err == nil && v != "" {
		s.Password = v
	} else {
		if env := os.Getenv("SSHWEB_PASSWORD"); env != "" {
			s.Password = env
		} else {
			log.Printf("[sshweb] 警告: 未设置 SSHWEB_PASSWORD，正在使用默认密码 admin888，请尽快在界面右上角修改")
		}
		if err := s.save(); err != nil {
			return nil, err
		}
	}
	rows, err := db.Query("SELECT data FROM servers")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		rows.Scan(&raw)
		var sv Server
		if json.Unmarshal([]byte(raw), &sv) == nil {
			s.Servers = append(s.Servers, &sv)
		}
	}
	rows2, err := db.Query("SELECT data FROM probes")
	if err != nil {
		return nil, err
	}
	defer rows2.Close()
	for rows2.Next() {
		var raw string
		rows2.Scan(&raw)
		var pr Probe
		if json.Unmarshal([]byte(raw), &pr) == nil {
			s.ProbeList = append(s.ProbeList, &pr)
		}
	}
	rows3, err := db.Query("SELECT ip, data FROM players")
	if err != nil {
		return nil, err
	}
	defer rows3.Close()
	for rows3.Next() {
		var ip, raw string
		rows3.Scan(&ip, &raw)
		var p FarmPlayer
		if json.Unmarshal([]byte(raw), &p) == nil {
			s.Players[ip] = &p
		}
	}

	// 灾难恢复（只执行一次）：v0.5.0 的迁移 bug 曾丢探针/玩家数据（legacyStore 缺 json tag）。
	// data.json.migrated 存在且未恢复过时，把其中 SQLite 里缺失的探针/服务器/玩家按 ID 合并回来。
	didRecover, _ := s.metaGet("recovered_migrated")
	if didRecover == "" {
		if b, err := os.ReadFile(jsonPath + ".migrated"); err == nil {
			var old legacyStore
			if json.Unmarshal(b, &old) == nil {
				np, ns, npl := 0, 0, 0
				haveP := map[string]bool{}
				for _, pr := range s.ProbeList {
					haveP[pr.ID] = true
				}
				for _, pr := range old.ProbeList {
					if pr != nil && !haveP[pr.ID] {
						s.ProbeList = append(s.ProbeList, pr)
						np++
					}
				}
				haveS := map[string]bool{}
				for _, sv := range s.Servers {
					haveS[sv.ID] = true
				}
				for _, sv := range old.Servers {
					if sv != nil && !haveS[sv.ID] {
						s.Servers = append(s.Servers, sv)
						ns++
					}
				}
				for ip, pl := range old.Players {
					if _, ok := s.Players[ip]; !ok && pl != nil {
						s.Players[ip] = pl
						npl++
					}
				}
				if np+ns+npl > 0 {
					if err := s.save(); err == nil {
						log.Printf("[store] 从 data.json.migrated 恢复：%d 探针 / %d 服务器 / %d 玩家", np, ns, npl)
					}
				}
			}
			s.metaSet("recovered_migrated", "1")
		}
	}
	return s, nil
}

func (s *Store) metaGet(k string) (string, error) {
	var v string
	err := s.db.QueryRow("SELECT v FROM meta WHERE k=?", k).Scan(&v)
	return v, err
}

func (s *Store) metaSet(k, v string) {
	s.db.Exec("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)", k, v)
}

// save 把密码/服务器/探针/玩家整体写回 SQLite（数据量小，全量替换简单可靠）
func (s *Store) save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked()
}

func (s *Store) saveLocked() error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("INSERT OR REPLACE INTO meta(k,v) VALUES('password',?)", s.Password); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM servers"); err != nil {
		return err
	}
	st, _ := tx.Prepare("INSERT INTO servers(id,data) VALUES(?,?)")
	for _, sv := range s.Servers {
		b, _ := json.Marshal(sv)
		st.Exec(sv.ID, string(b))
	}
	st.Close()
	if _, err := tx.Exec("DELETE FROM probes"); err != nil {
		return err
	}
	st2, _ := tx.Prepare("INSERT INTO probes(id,data) VALUES(?,?)")
	for _, pr := range s.ProbeList {
		b, _ := json.Marshal(pr)
		st2.Exec(pr.ID, string(b))
	}
	st2.Close()
	if _, err := tx.Exec("DELETE FROM players"); err != nil {
		return err
	}
	st3, _ := tx.Prepare("INSERT INTO players(ip,data) VALUES(?,?)")
	for ip, p := range s.Players {
		b, _ := json.Marshal(p)
		st3.Exec(ip, string(b))
	}
	st3.Close()
	return tx.Commit()
}

func (s *Store) SaveAsync() { go s.save() }

// UpdatePlayerPos 记录游客最后位置（内存即时，落盘由 SaveAsync 节流）
func (s *Store) UpdatePlayerPos(ip string, x, y, z float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, ok := s.Players[ip]; ok && p != nil {
		p.HasPos, p.PX, p.PY, p.PZ = true, x, y, z
	}
}

// ---------------- 方块（直写 SQLite） ----------------

func (s *Store) BlockGet(key string) string {
	var x, y, z int
	if _, err := fmt.Sscanf(key, "%d,%d,%d", &x, &y, &z); err != nil {
		return ""
	}
	var typ string
	err := s.db.QueryRow("SELECT type FROM blocks WHERE x=? AND y=? AND z=?", x, y, z).Scan(&typ)
	if err != nil {
		return ""
	}
	return typ
}

func (s *Store) SetBlock(key, val string) {
	var x, y, z int
	if _, err := fmt.Sscanf(key, "%d,%d,%d", &x, &y, &z); err != nil {
		return
	}
	if val == "" || val == "-" {
		s.db.Exec("DELETE FROM blocks WHERE x=? AND y=? AND z=?", x, y, z)
		return
	}
	s.db.Exec("INSERT OR REPLACE INTO blocks(x,y,z,type) VALUES(?,?,?,?)", x, y, z, val)
}

func (s *Store) BlocksCopy() map[string]string {
	out := map[string]string{}
	rows, err := s.db.Query("SELECT x,y,z,type FROM blocks")
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var x, y, z int
		var typ string
		if rows.Scan(&x, &y, &z, &typ) == nil {
			out[fmt.Sprintf("%d,%d,%d", x, y, z)] = typ
		}
	}
	return out
}

// ClearBlocks 清空全部方块（管理员一键清图）
func (s *Store) ClearBlocks() error {
	_, err := s.db.Exec("DELETE FROM blocks")
	return err
}

func (s *Store) BlockCount() int {
	var n int
	s.db.QueryRow("SELECT COUNT(*) FROM blocks").Scan(&n)
	return n
}

// ColumnTop 返回某列 (x,z) 最高方块顶面 y（无方块为 0）
func (s *Store) ColumnTop(x, z int) int {
	var top sql.NullInt64
	s.db.QueryRow("SELECT MAX(y)+1 FROM blocks WHERE x=? AND z=?", x, z).Scan(&top)
	if top.Valid {
		return int(top.Int64)
	}
	return 0
}

// ---------------- 玩家 ----------------

func (s *Store) GetOrCreatePlayer(ip string) *FarmPlayer {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Players == nil {
		s.Players = map[string]*FarmPlayer{}
	}
	if p, ok := s.Players[ip]; ok {
		return p
	}
	b := make([]byte, 2)
	crand.Read(b)
	p := &FarmPlayer{
		ID:        newID()[:10],
		Name:      fmt.Sprintf("农夫-%x", b),
		Materials: 50,
		IP:        ip,
		CreatedAt: time.Now().Format(time.RFC3339),
	}
	s.Players[ip] = p
	go s.save()
	return p
}

func (s *Store) PlayerByIP(ip string) *FarmPlayer {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Players == nil {
		return nil
	}
	return s.Players[ip]
}

// ---------------- 探针 ----------------

func (s *Store) Probes() []*Probe {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]*Probe, len(s.ProbeList))
	copy(out, s.ProbeList)
	return out
}

func (s *Store) AddProbe(pr *Probe) {
	s.mu.Lock()
	s.ProbeList = append(s.ProbeList, pr)
	s.mu.Unlock()
	go s.save()
}

func (s *Store) DeleteProbe(id string) {
	s.mu.Lock()
	out := s.ProbeList[:0]
	for _, v := range s.ProbeList {
		if v.ID != id {
			out = append(out, v)
		}
	}
	s.ProbeList = out
	s.mu.Unlock()
	go s.save()
}

func (s *Store) ProbeByToken(token string) *Probe {
	if token == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, v := range s.ProbeList {
		if v.Token == token {
			return v
		}
	}
	return nil
}

func (s *Store) ProbeByID(id string) *Probe {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, v := range s.ProbeList {
		if v.ID == id {
			return v
		}
	}
	return nil
}

// ---------------- 服务器 ----------------

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
			return s.saveLocked()
		}
	}
	s.Servers = append(s.Servers, sv)
	return s.saveLocked()
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
	return s.saveLocked()
}

func (s *Store) Touch(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, v := range s.Servers {
		if v.ID == id {
			v.LastUsed = time.Now()
			s.saveLocked()
			return
		}
	}
}

func (s *Store) SetPassword(pw string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Password = pw
	return s.saveLocked()
}

func (s *Store) Close() {
	if s.db != nil {
		s.db.Close()
	}
}
