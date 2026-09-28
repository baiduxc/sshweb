package main

// game.go — 多人农场大厅：玩家位置同步、鸡血量裁决、方块世界持久化、游客国家识别

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const chickenMaxHP = 100

type chickenState struct {
	HP   int  `json:"hp"`
	Down bool `json:"down"`
}

type gameClient struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Country string  `json:"country"` // 两位国家码，空=内网/未知
	Admin   bool    `json:"admin"`
	X       float64 `json:"x"`
	Y       float64 `json:"-"` // 初始高度（建筑顶上出生）
	Z       float64 `json:"z"`
	RY      float64 `json:"ry"`

	rec  *FarmPlayer // IP 绑定的持久档案（游客）
	conn *websocket.Conn
	send chan []byte
	hub  *gameHub
	once sync.Once
}

type playerHPState struct {
	HP   int  `json:"hp"`
	Down bool `json:"down"`
}

const playerMaxHP = 100

type gameHub struct {
	mu       sync.Mutex
	clients  map[*gameClient]struct{}
	chickens map[string]*chickenState
	probeHP  map[string]*chickenState
	playerHP map[string]*playerHPState
	store    *Store
	probeRT  *probeRuntime
}

func newGameHub(store *Store) *gameHub {
	return &gameHub{
		clients: map[*gameClient]struct{}{}, chickens: map[string]*chickenState{},
		probeHP: map[string]*chickenState{}, playerHP: map[string]*playerHPState{},
		store: store,
	}
}

func (h *gameHub) probe(id string) *chickenState {
	h.mu.Lock()
	defer h.mu.Unlock()
	st, ok := h.probeHP[id]
	if !ok {
		st = &chickenState{HP: chickenMaxHP}
		h.probeHP[id] = st
	}
	return st
}

func (h *gameHub) player(id string) *playerHPState {
	h.mu.Lock()
	defer h.mu.Unlock()
	st, ok := h.playerHP[id]
	if !ok {
		st = &playerHPState{HP: playerMaxHP}
		h.playerHP[id] = st
	}
	return st
}

func (h *gameHub) probeHPSnapshot() map[string]chickenState {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := map[string]chickenState{}
	for k, v := range h.probeHP {
		out[k] = *v
	}
	return out
}

func (h *gameHub) serverName(id string) string {
	if sv := h.store.Get(id); sv != nil && sv.Name != "" {
		return sv.Name
	}
	return "鸡"
}

func (h *gameHub) probeName(id string) string {
	if pr := h.store.ProbeByID(id); pr != nil {
		if pr.Name != "" {
			return pr.Name
		}
		if h.probeRT != nil {
			if st := h.probeRT.get(id); st != nil && st.Hostname != "" {
				return st.Hostname
			}
		}
	}
	return "探针"
}

func (h *gameHub) eventName(clientID string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.ID == clientID {
			return c.Name
		}
	}
	return "某只鸡"
}

func (h *gameHub) event(text string) {
	h.broadcast(map[string]any{"t": "event", "text": text}, nil)
}

func (h *gameHub) chicken(id string) *chickenState {
	h.mu.Lock()
	defer h.mu.Unlock()
	st, ok := h.chickens[id]
	if !ok {
		st = &chickenState{HP: chickenMaxHP}
		h.chickens[id] = st
	}
	return st
}

func (h *gameHub) chickensSnapshot() map[string]chickenState {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := map[string]chickenState{}
	for _, sv := range h.store.List() {
		if st, ok := h.chickens[sv.ID]; ok {
			out[sv.ID] = *st
		} else {
			out[sv.ID] = chickenState{HP: chickenMaxHP}
		}
	}
	return out
}

type playerInfo struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Country   string  `json:"country"`
	Admin     bool    `json:"admin"`
	X         float64 `json:"x"`
	Z         float64 `json:"z"`
	RY        float64 `json:"ry"`
	HP        int     `json:"hp"`
	Down      bool    `json:"down"`
	Materials int     `json:"materials"`
}

func (c *gameClient) infoWithHP(h *gameHub) playerInfo {
	pi := playerInfo{ID: c.ID, Name: c.Name, Country: c.Country, Admin: c.Admin, X: c.X, Z: c.Z, RY: c.RY}
	st := h.player(c.ID)
	pi.HP, pi.Down = st.HP, st.Down
	if c.rec != nil {
		pi.Materials = c.rec.Materials
	}
	return pi
}

func (h *gameHub) join(c *gameClient) {
	myHP := h.player(c.ID) // 确保有 HP 记录
	h.mu.Lock()
	h.clients[c] = struct{}{}
	rawOthers := make([]*gameClient, 0, len(h.clients))
	for o := range h.clients {
		if o != c {
			rawOthers = append(rawOthers, o)
		}
	}
	h.mu.Unlock()
	others := make([]playerInfo, 0, len(rawOthers))
	for _, o := range rawOthers {
		others = append(others, o.infoWithHP(h))
	}

	mats := 0
	if c.rec != nil {
		mats = c.rec.Materials
	}
	c.sendMsg(map[string]any{
		"t": "init", "you": c.ID, "name": c.Name, "country": c.Country, "admin": c.Admin,
		"x": c.X, "y": c.Y, "z": c.Z, "hp": myHP.HP, "down": myHP.Down, "materials": mats,
		"players":  others,
		"chickens": h.chickensSnapshot(),
		"probeHP":  h.probeHPSnapshot(),
		"blocks":   h.store.BlocksCopy(),
	})
	h.broadcast(map[string]any{"t": "join", "player": c.infoWithHP(h)}, c)
}

func (h *gameHub) leave(c *gameClient) {
	h.mu.Lock()
	delete(h.clients, c)
	delete(h.playerHP, c.ID)
	h.mu.Unlock()
	h.broadcast(map[string]any{"t": "bye", "id": c.ID}, nil)
}

func (h *gameHub) broadcast(msg any, except *gameClient) {
	b, _ := json.Marshal(msg)
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c == except {
			continue
		}
		select {
		case c.send <- b:
		default: // 慢消费者丢帧
		}
	}
}

func (h *gameHub) autoRevive(kind, id string) {
	time.Sleep(10 * time.Second)
	h.mu.Lock()
	var changed bool
	if kind == "chicken" {
		if cur := h.chickens[id]; cur != nil && cur.Down {
			cur.HP = chickenMaxHP
			cur.Down = false
			changed = true
		}
	} else {
		if cur := h.probeHP[id]; cur != nil && cur.Down {
			cur.HP = chickenMaxHP
			cur.Down = false
			changed = true
		}
	}
	h.mu.Unlock()
	if changed {
		if kind == "chicken" {
			h.broadcast(map[string]any{"t": "chickenState", "id": id, "hp": chickenMaxHP, "down": false}, nil)
		} else {
			h.broadcast(map[string]any{"t": "probeState", "id": id, "hp": chickenMaxHP, "down": false}, nil)
		}
	}
}

func (c *gameClient) sendMsg(msg any) {
	b, _ := json.Marshal(msg)
	select {
	case c.send <- b:
	default:
	}
}

func (c *gameClient) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() { ticker.Stop(); c.conn.Close() }()
	for {
		select {
		case b, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, b); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *gameClient) readPump() {
	defer func() {
		c.once.Do(func() { c.hub.leave(c); close(c.send) })
		c.conn.Close()
	}()
	c.conn.SetReadLimit(16 * 1024)
	c.conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(70 * time.Second)); return nil })
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var m map[string]any
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		c.hub.handle(c, m)
	}
}

func isValidNote(typ string) bool {
	if len(typ) != 5 {
		return false
	}
	return typ[4] >= '1' && typ[4] <= '7'
}

func f64(v any) float64 {
	f, _ := v.(float64)
	return f
}

func (h *gameHub) handle(c *gameClient, m map[string]any) {
	switch m["t"] {
	case "pos":
		c.X, c.Z, c.RY = f64(m["x"]), f64(m["z"]), f64(m["ry"])
		h.broadcast(map[string]any{"t": "pos", "id": c.ID, "x": c.X, "z": c.Z, "ry": c.RY, "mv": m["mv"]}, c)

	case "hit":
		target, _ := m["target"].(string)
		id, _ := m["id"].(string)
		dmg := int(f64(m["dmg"]))
		if dmg <= 0 || dmg > 20 || id == "" {
			return
		}
		fx := map[string]any{"t": "hitfx", "kind": target, "id": id, "x": m["x"], "y": m["y"], "z": m["z"], "dmg": dmg, "by": c.ID}
		h.broadcast(fx, c)
		switch target {
		case "chicken":
			st := h.chicken(id)
			h.mu.Lock()
			if !st.Down {
				st.HP -= dmg
				if st.HP <= 0 {
					st.HP = 0
					st.Down = true
				}
			}
			snap := *st
			h.mu.Unlock()
			h.broadcast(map[string]any{"t": "chickenState", "id": id, "hp": snap.HP, "down": snap.Down}, nil)
			if snap.Down && snap.HP == 0 {
				go h.autoRevive("chicken", id)
				h.event(fmt.Sprintf("%s 啄倒了 %s", c.Name, h.serverName(id)))
			}
		case "probe":
			st := h.probe(id)
			h.mu.Lock()
			if !st.Down {
				st.HP -= dmg
				if st.HP <= 0 {
					st.HP = 0
					st.Down = true
				}
			}
			snap := *st
			h.mu.Unlock()
			h.broadcast(map[string]any{"t": "probeState", "id": id, "hp": snap.HP, "down": snap.Down}, nil)
			if snap.Down && snap.HP == 0 {
				go h.autoRevive("probe", id)
				h.event(fmt.Sprintf("%s 啄倒了探针 %s", c.Name, h.probeName(id)))
			}
		case "player":
			pst := h.player(id)
			h.mu.Lock()
			if !pst.Down {
				pst.HP -= dmg
				if pst.HP <= 0 {
					pst.HP = 0
					pst.Down = true
				}
			}
			psnap := *pst
			var tc *gameClient
			for o := range h.clients {
				if o.ID == id {
					tc = o
				}
			}
			h.mu.Unlock()
			if tc != nil {
				tc.sendMsg(map[string]any{"t": "hurt", "dmg": dmg, "from": c.Name, "by": c.ID, "hp": psnap.HP, "down": psnap.Down})
			}
			h.broadcast(map[string]any{"t": "playerState", "id": id, "hp": psnap.HP, "down": psnap.Down}, nil)
			if psnap.Down && psnap.HP == 0 {
				h.event(fmt.Sprintf("%s 啄倒了 %s", c.Name, h.eventName(id)))
			}
		}

	case "revive":
		id, _ := m["id"].(string)
		st := h.chicken(id)
		h.mu.Lock()
		st.HP = chickenMaxHP
		st.Down = false
		h.mu.Unlock()
		h.broadcast(map[string]any{"t": "chickenState", "id": id, "hp": chickenMaxHP, "down": false}, nil)

	case "reqMaterials":
		// 客户端请求同步材料数（如添加探针获得奖励后）
		if c.rec != nil {
			c.sendMsg(map[string]any{"t": "materials", "n": c.rec.Materials})
		}

	case "rename":
		name, _ := m["name"].(string)
		name = strings.TrimSpace(name)
		rn := []rune(name)
		if len(rn) == 0 || len(rn) > 32 || c.rec == nil {
			return
		}
		c.rec.Name = string(rn)
		c.Name = c.rec.Name
		h.store.SaveAsync()
		h.broadcast(map[string]any{"t": "rename", "id": c.ID, "name": c.Name}, nil)

	case "playerRevive":
		// 玩家死亡后自己点复活 → 服务端随机出生点（若该列被建筑覆盖，复活到建筑顶上）
		pst := h.player(c.ID)
		h.mu.Lock()
		pst.HP = playerMaxHP
		pst.Down = false
		h.mu.Unlock()
		nx := float64(rand.Intn(40) - 20)
		nz := float64(rand.Intn(40) - 20)
		ny := float64(h.store.ColumnTop(int(nx), int(nz)))
		c.X, c.Z = nx, nz
		c.sendMsg(map[string]any{"t": "respawn", "x": nx, "y": ny, "z": nz})
		h.broadcast(map[string]any{"t": "playerState", "id": c.ID, "hp": playerMaxHP, "down": false, "x": nx, "z": nz}, c)

	case "block":
		op, _ := m["op"].(string)
		x, y, z := int(f64(m["x"])), int(f64(m["y"])), int(f64(m["z"]))
		if x < -80 || x > 80 || y < 0 || y > 20 || z < -80 || z > 80 {
			return
		}
		typ, _ := m["type"].(string)
		key := fmt.Sprintf("%d,%d,%d", x, y, z)
		val := ""
		switch op {
		case "add":
			if typ != "dirt" && typ != "wood" && typ != "stone" && !(strings.HasPrefix(typ, "note") && isValidNote(typ)) {
				return
			}
			// 游客：服务端权威扣材料
			if !c.Admin && c.rec != nil {
				if c.rec.Materials <= 0 {
					c.sendMsg(map[string]any{"t": "toast", "text": "建造材料不足，明天添加一个探针可获得 +100"})
					c.sendMsg(map[string]any{"t": "materials", "n": c.rec.Materials})
					return
				}
				if cur := h.store.BlockGet(key); cur != "" && cur != "-" {
					return // 已有方块
				}
				c.rec.Materials--
				h.store.SaveAsync()
				c.sendMsg(map[string]any{"t": "materials", "n": c.rec.Materials})
			}
			val = typ
		case "del":
			val = "-"
			if !c.Admin && c.rec != nil {
				if cur := h.store.BlockGet(key); cur != "" && cur != "-" {
					c.rec.Materials++
					if c.rec.Materials > 9999 {
						c.rec.Materials = 9999
					}
					h.store.SaveAsync()
					c.sendMsg(map[string]any{"t": "materials", "n": c.rec.Materials})
				}
			}
		default:
			return
		}
		h.store.SetBlock(key, val)
		h.broadcast(map[string]any{"t": "block", "op": op, "x": x, "y": y, "z": z, "type": typ, "by": c.ID}, c)
	}
}

// ---------------- 国家识别 ----------------

var (
	countryCacheMu sync.Mutex
	countryCache   = map[string]string{}
)

// lookupCC 按 IP 返回两位国家码（内网/回环/失败 = ""）。结果缓存，前端用码渲染旗子图。
func lookupCC(ip string) string {
	if ip == "" {
		return ""
	}
	parsed := net.ParseIP(ip)
	if parsed == nil || parsed.IsLoopback() || parsed.IsPrivate() || parsed.IsUnspecified() {
		return ""
	}
	countryCacheMu.Lock()
	if v, ok := countryCache[ip]; ok {
		countryCacheMu.Unlock()
		return v
	}
	countryCacheMu.Unlock()

	res := ""
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://ip-api.com/json/" + ip + "?fields=status,countryCode")
	if err == nil {
		defer resp.Body.Close()
		var d struct {
			Status      string `json:"status"`
			CountryCode string `json:"countryCode"`
		}
		if json.NewDecoder(resp.Body).Decode(&d) == nil && d.Status == "success" {
			res = strings.ToLower(d.CountryCode)
		}
	} else {
		log.Printf("[game] 国家识别失败 %s: %v", ip, err)
	}
	countryCacheMu.Lock()
	countryCache[ip] = res
	countryCacheMu.Unlock()
	return res
}

func gameClientIP(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		if i := strings.IndexByte(v, ','); i > 0 {
			return strings.TrimSpace(v[:i])
		}
		return strings.TrimSpace(v)
	}
	if v := r.Header.Get("X-Real-IP"); v != "" {
		return v
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// ---------------- WebSocket 入口 ----------------

func (a *App) handleGameWS(w http.ResponseWriter, r *http.Request) {
	ws, err := a.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	admin := a.authOK(r)
	ip := gameClientIP(r)
	c := &gameClient{
		ID:      newID()[:10],
		Name:    "",
		Country: lookupCC(ip), // 两位国家码；有缓存毫秒级，首次最多 3s
		Admin:   admin,
		conn:    ws,
		send:    make(chan []byte, 64),
		hub:     a.game,
	}
	if admin {
		c.Name = "农场主"
		c.X = float64(rand.Intn(10) - 5)
		c.Z = 12 + float64(rand.Intn(6)-3)
	} else {
		rec := a.store.GetOrCreatePlayer(ip) // IP 深度绑定：资源/名字持久
		c.rec = rec
		c.ID = rec.ID
		c.Name = rec.Name
		c.X = float64(rand.Intn(10) - 5)
		c.Z = 12 + float64(rand.Intn(6)-3)
		// 复活点抬高：防止地面被建筑铺满
		if top := a.store.ColumnTop(int(c.X), int(c.Z)); top > 0 {
			c.Y = float64(top)
		}
	}
	a.game.join(c)
	go c.writePump()
	c.readPump()
}

// 游客可见的公开鸡群列表（不含任何连接信息）
func (a *App) handleFarmPublic(w http.ResponseWriter, r *http.Request) {
	out := []map[string]any{}
	for _, s := range a.store.List() {
		out = append(out, map[string]any{"id": s.ID, "name": s.Name, "region": s.Region})
	}
	writeJSON(w, 200, out)
}
