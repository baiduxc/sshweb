package main

// probe.go — 公开探针系统：
//   管理端生成 token → 任意服务器 curl 一键安装 bash agent → 周期上报 CPU/内存/磁盘/网速
//   农场里出现一只 📡 探针鸡，头顶主机名，点击查看状态卡片
//   支持：完全公开 / 密码查看 / IP 第三段掩码

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Probe struct {
	ID        string    `json:"id"`
	Token     string    `json:"token"`
	Name      string    `json:"name,omitempty"`     // 备注名，空则用主机名
	Public    bool      `json:"public"`             // true=完全公开 false=密码查看
	ViewPass  string    `json:"viewPass,omitempty"` // 仅存于 data.json(0600)，任何接口不下发
	MaskIP    bool      `json:"maskIP"`             // IP 第三段掩码
	CreatedAt time.Time `json:"createdAt"`
}

type probeStats struct {
	Hostname  string  `json:"hostname"`
	OS        string  `json:"os"`
	IP        string  `json:"ip"`
	CPU       float64 `json:"cpu"`       // 0-100
	MemTotal  int64   `json:"memTotal"`  // KB
	MemUsed   int64   `json:"memUsed"`   // KB
	DiskTotal int64   `json:"diskTotal"` // KB
	DiskUsed  int64   `json:"diskUsed"`  // KB
	RxRate    int64   `json:"rxRate"`    // B/s 下行
	TxRate    int64   `json:"txRate"`    // B/s 上行
	Load1     float64 `json:"load1"`     // 1 分钟负载
	Uptime    int64   `json:"uptime"`    // 运行秒数
	Procs     int     `json:"procs"`     // 进程数
	CPUModel  string  `json:"cpuModel"`  // CPU 型号
	CPUCores  int     `json:"cpuCores"`  // 逻辑核数
	LastSeen  time.Time
}

type probeRuntime struct {
	mu    sync.Mutex
	items map[string]*probeStats // probeID -> stats
}

func newProbeRuntime() *probeRuntime {
	return &probeRuntime{items: map[string]*probeStats{}}
}

func (p *probeRuntime) report(id string, st *probeStats) {
	p.mu.Lock()
	p.items[id] = st
	p.mu.Unlock()
}

func (p *probeRuntime) get(id string) *probeStats {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.items[id]
}

func (p *probeRuntime) remove(id string) {
	p.mu.Lock()
	delete(p.items, id)
	p.mu.Unlock()
}

func maskIPIp(ip string) string {
	parts := strings.Split(ip, ".")
	if len(parts) == 4 {
		parts[2] = "xxx"
		return strings.Join(parts, ".")
	}
	return ip
}

// 按查看者身份生成探针视图
func (a *App) probeView(pr *Probe, forAdmin bool, unlocked bool) map[string]any {
	st := a.probes.get(pr.ID)
	online := st != nil && time.Since(st.LastSeen) < 15*time.Second
	v := map[string]any{
		"id":     pr.ID,
		"name":   pr.Name,
		"public": pr.Public,
		"online": online,
	}
	if st != nil {
		v["hostname"] = st.Hostname
	}
	canSee := forAdmin || pr.Public || unlocked
	if canSee {
		if st != nil {
			ip := st.IP
			if pr.MaskIP && !forAdmin {
				ip = maskIPIp(ip)
			}
			if pr.Name != "" {
				v["name"] = pr.Name
			}
			v["os"] = st.OS
			v["ip"] = ip
			v["cc"] = lookupCC(st.IP)
			v["cpu"] = st.CPU
			v["memTotal"] = st.MemTotal
			v["memUsed"] = st.MemUsed
			v["diskTotal"] = st.DiskTotal
			v["diskUsed"] = st.DiskUsed
			v["rxRate"] = st.RxRate
			v["txRate"] = st.TxRate
			v["load1"] = st.Load1
			v["uptime"] = st.Uptime
			v["procs"] = st.Procs
			v["cpuModel"] = st.CPUModel
			v["cpuCores"] = st.CPUCores
			v["lastSeen"] = st.LastSeen.Unix()
		}
	} else {
		v["locked"] = true
	}
	return v
}

func (a *App) probesForClient(forAdmin bool, unlocked map[string]bool) []map[string]any {
	out := []map[string]any{}
	for _, pr := range a.store.Probes() {
		out = append(out, a.probeView(pr, forAdmin, unlocked[pr.ID]))
	}
	return out
}

/* ---------------- HTTP API ---------------- */

// POST /api/probe/join  (admin) — 生成探针 {public, viewPass, maskIP, name}
func (a *App) handleProbeJoin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]string{"error": "method not allowed"})
		return
	}
	var body struct {
		Public   bool   `json:"public"`
		ViewPass string `json:"viewPass"`
		MaskIP   bool   `json:"maskIP"`
		Name     string `json:"name"`
	}
	json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
	if !body.Public && len(body.ViewPass) < 4 {
		writeJSON(w, 400, map[string]string{"error": "密码查看模式需要至少 4 位密码"})
		return
	}
	b := make([]byte, 16)
	rand.Read(b)
	pr := &Probe{
		ID:        newID()[:12],
		Token:     hex.EncodeToString(b),
		Name:      strings.TrimSpace(body.Name),
		Public:    body.Public,
		ViewPass:  body.ViewPass,
		MaskIP:    body.MaskIP,
		CreatedAt: time.Now(),
	}
	a.store.AddProbe(pr)
	// 每日奖励：添加一个探针 → 该 IP 绑定的玩家 +100 建造材料（每天限一次）
	bonus := 0
	if rec := a.store.GetOrCreatePlayer(gameClientIP(r)); rec != nil {
		today := time.Now().Format("2006-01-02")
		if rec.LastBonus != today {
			rec.LastBonus = today
			rec.Materials += 100
			bonus = 100
			a.store.SaveAsync()
		}
	}
	base := requestBaseURL(r)
	writeJSON(w, 200, map[string]any{
		"id":        pr.ID,
		"install":   fmt.Sprintf("curl -fsSL '%s/probe/agent.sh?t=%s' | sudo bash", base, pr.Token),
		"uninstall": fmt.Sprintf("curl -fsSL '%s/probe/uninstall.sh' | sudo bash", base),
		"bonus":     bonus,
	})
}

// GET /api/probes (admin) — 列表；DELETE /api/probes?id=xx — 删除
func (a *App) handleProbes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		base := requestBaseURL(r)
		out := []map[string]any{}
		for _, pr := range a.store.Probes() {
			st := a.probes.get(pr.ID)
			online := st != nil && time.Since(st.LastSeen) < 15*time.Second
			name := pr.Name
			if name == "" && st != nil {
				name = st.Hostname
			}
			out = append(out, map[string]any{
				"id": pr.ID, "name": name, "public": pr.Public, "maskIP": pr.MaskIP,
				"online":    online,
				"install":   fmt.Sprintf("curl -fsSL '%s/probe/agent.sh?t=%s' | sudo bash", base, pr.Token),
				"createdAt": pr.CreatedAt,
			})
		}
		writeJSON(w, 200, out)
	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		a.store.DeleteProbe(id)
		a.probes.remove(id)
		writeJSON(w, 200, map[string]string{"ok": "1"})
	default:
		writeJSON(w, 405, map[string]string{"error": "method not allowed"})
	}
}

// POST /api/probe/report?t=token — agent 上报
func (a *App) handleProbeReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]string{"error": "method not allowed"})
		return
	}
	token := r.URL.Query().Get("t")
	pr := a.store.ProbeByToken(token)
	if pr == nil {
		writeJSON(w, 404, map[string]string{"error": "invalid token"})
		return
	}
	var body struct {
		Hostname  string  `json:"hostname"`
		OS        string  `json:"os"`
		CPU       float64 `json:"cpu"`
		MemTotal  int64   `json:"memTotal"`
		MemUsed   int64   `json:"memUsed"`
		DiskTotal int64   `json:"diskTotal"`
		DiskUsed  int64   `json:"diskUsed"`
		RxRate    int64   `json:"rxRate"`
		TxRate    int64   `json:"txRate"`
		Load1     float64 `json:"load1"`
		Uptime    int64   `json:"uptime"`
		Procs     int     `json:"procs"`
		CPUModel  string  `json:"cpuModel"`
		CPUCores  int     `json:"cpuCores"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&body); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	a.probes.report(pr.ID, &probeStats{
		Hostname: truncate(body.Hostname, 40), OS: truncate(body.OS, 40),
		IP:  gameClientIP(r),
		CPU: body.CPU, MemTotal: body.MemTotal, MemUsed: body.MemUsed,
		DiskTotal: body.DiskTotal, DiskUsed: body.DiskUsed,
		RxRate: body.RxRate, TxRate: body.TxRate,
		Load1: body.Load1, Uptime: body.Uptime, Procs: body.Procs,
		CPUModel: truncate(body.CPUModel, 60), CPUCores: body.CPUCores,
		LastSeen: time.Now(),
	})
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// GET /probe/unlock?id=&pass= — 游客密码解锁探针查看
func (a *App) handleProbeUnlock(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	pass := r.URL.Query().Get("pass")
	pr := a.store.ProbeByID(id)
	if pr == nil {
		writeJSON(w, 404, map[string]string{"error": "探针不存在"})
		return
	}
	if subtle.ConstantTimeCompare([]byte(pr.ViewPass), []byte(pass)) != 1 {
		writeJSON(w, 403, map[string]string{"error": "查看密码错误"})
		return
	}
	setUnlockedCookie(w, id)
	writeJSON(w, 200, a.probeView(pr, false, true))
}

// GET /api/probes/public — 游客/管理员都能拉，按身份裁剪视图；解锁状态存服务端 Cookie
func (a *App) handleProbesPublic(w http.ResponseWriter, r *http.Request) {
	forAdmin := a.authOK(r)
	unlocked := readUnlockedCookies(r)
	writeJSON(w, 200, a.probesForClient(forAdmin, unlocked))
}

func readUnlockedCookies(r *http.Request) map[string]bool {
	out := map[string]bool{}
	for _, c := range r.Cookies() {
		if strings.HasPrefix(c.Name, "probe_unlock_") {
			out[strings.TrimPrefix(c.Name, "probe_unlock_")] = true
		}
	}
	return out
}

func setUnlockedCookie(w http.ResponseWriter, id string) {
	http.SetCookie(w, &http.Cookie{
		Name: "probe_unlock_" + id, Value: "1",
		Path: "/", HttpOnly: true, MaxAge: 86400 * 7, SameSite: http.SameSiteLaxMode,
	})
}

// GET /api/probe/unlockpass?pass=xx — 游客输入探针查看密码，解锁所有匹配的探针
func (a *App) handleProbeUnlockPass(w http.ResponseWriter, r *http.Request) {
	pass := r.URL.Query().Get("pass")
	if len(pass) < 4 {
		writeJSON(w, 400, map[string]string{"error": "密码太短"})
		return
	}
	n := 0
	for _, pr := range a.store.Probes() {
		if pr.Public || pr.ViewPass == "" {
			continue
		}
		if subtle.ConstantTimeCompare([]byte(pr.ViewPass), []byte(pass)) == 1 {
			setUnlockedCookie(w, pr.ID)
			n++
		}
	}
	if n == 0 {
		writeJSON(w, 403, map[string]string{"error": "没有匹配该密码的探针"})
		return
	}
	writeJSON(w, 200, map[string]any{"unlocked": n})
}

func requestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	host := r.Host
	if h := r.Header.Get("X-Forwarded-Host"); h != "" {
		host = h
	}
	return scheme + "://" + host
}

/* ---------------- agent 安装/卸载脚本 ---------------- */

func agentScript(base, token string) string {
	return `#!/usr/bin/env bash
# SSHWeb 农场探针 agent — 一键安装
set -e
PANEL="` + base + `"
TOKEN="` + token + `"
BIN=/usr/local/bin/sshweb-probe.sh
UNIT=/etc/systemd/system/sshweb-probe.service

cat > "$BIN" <<'AGENT'
#!/usr/bin/env bash
PANEL="__PANEL__"
TOKEN="__TOKEN__"
prev_rx=0; prev_tx=0; prev_t=0
num() { case "$1" in ''|*[!0-9.]*) echo 0;; *) echo "$1";; esac; }
read_net() {
  awk 'NR>2 {gsub(/:/," ",$1); rx+=$2; tx+=$10} END {print rx+0, tx+0}' /proc/net/dev
}
read_cpu() {
  read -r _ u1 n1 s1 i1 w1 irq1 sirq1 st1 _ < /proc/stat
  sleep 1
  read -r _ u2 n2 s2 i2 w2 irq2 sirq2 st2 _ < /proc/stat
  idle=$(( (i2 + w2) - (i1 + w1) ))
  total=$(( (u2+n2+s2+i2+w2+irq2+sirq2+st2) - (u1+n1+s1+i1+w1+irq1+sirq1+st1) ))
  if [ "$total" -le 0 ]; then echo 0; else echo $(( (100 * (total - idle)) / total )); fi
}
read_load() { awk '{print $1}' /proc/loadavg; }
read_procs() { awk '/^procs_running/{r=$2} /^procs_blocked/{b=$2} END{print r+b}' /proc/stat; }
read_uptime() { cut -d. -f1 /proc/uptime; }
read_cpumodel() {
  awk -F': ' '/^model name/{gsub(/"/,"",$2); print $2; exit}' /proc/cpuinfo
}
read_cores() { nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo; }
CPU_MODEL=$(read_cpumodel | tr -d '"\\' | cut -c1-60)
CPU_CORES=$(num "$(read_cores)")
HOST=$(hostname | tr -d '"\\' | cut -c1-40)
while true; do
  cpu=$(read_cpu)
  mem_total=$(awk '/^MemTotal:/{print $2+0}' /proc/meminfo)
  mem_avail=$(awk '/^MemAvailable:/{print $2+0}' /proc/meminfo)
  [ -z "$mem_avail" ] && mem_avail=$(awk '/^MemFree:/{print $2+0}' /proc/meminfo)
  mem_used=$(( mem_total - mem_avail ))
  [ "$mem_used" -lt 0 ] && mem_used=0
  disk_total=$(df -P -k / 2>/dev/null | awk 'NR==2 {print $2+0}')
  disk_used=$(df -P -k / 2>/dev/null | awk 'NR==2 {print $3+0}')
  disk_total=$(num "$disk_total"); disk_used=$(num "$disk_used")
  read -r rx tx < <(read_net)
  rx=$(num "$rx"); tx=$(num "$tx")
  load1=$(num "$(read_load)")
  procs=$(num "$(read_procs)")
  uptime_s=$(num "$(read_uptime)")
  now=$(date +%s)
  rx_rate=0; tx_rate=0
  if [ "$prev_t" -gt 0 ]; then
    dt=$(( now - prev_t ))
    [ "$dt" -gt 0 ] && { rx_rate=$(( (rx - prev_rx) / dt )); tx_rate=$(( (tx - prev_tx) / dt )); }
  fi
  prev_rx=$rx; prev_tx=$tx; prev_t=$now
  PAYLOAD="{\"hostname\":\"$HOST\",\"os\":\"$(uname -sr)\",\"cpu\":$cpu,\"memTotal\":$mem_total,\"memUsed\":$mem_used,\"diskTotal\":$disk_total,\"diskUsed\":$disk_used,\"rxRate\":$rx_rate,\"txRate\":$tx_rate,\"load1\":$load1,\"uptime\":$uptime_s,\"procs\":$procs,\"cpuModel\":\"$CPU_MODEL\",\"cpuCores\":$CPU_CORES}"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 8 -X POST "$PANEL/api/probe/report?t=$TOKEN" -H 'Content-Type: application/json' -d "$PAYLOAD" >/dev/null 2>&1 || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 8 -O /dev/null --post-data="$PAYLOAD" --header='Content-Type: application/json' "$PANEL/api/probe/report?t=$TOKEN" >/dev/null 2>&1 || true
  fi
  sleep 5
done
AGENT
sed -i "s|__PANEL__|$PANEL|; s|__TOKEN__|$TOKEN|" "$BIN"
chmod +x "$BIN"

cat > "$UNIT" <<UNIT
[Unit]
Description=SSHWeb Farm Probe Agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$BIN
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable sshweb-probe >/dev/null 2>&1
systemctl restart sshweb-probe
echo "✅ SSHWeb 探针已安装并启动（服务名 sshweb-probe）"
echo "   卸载： curl -fsSL '$PANEL/probe/uninstall.sh' | sudo bash"
`
}

const uninstallScript = `#!/usr/bin/env bash
set -e
systemctl disable --now sshweb-probe >/dev/null 2>&1 || true
rm -f /etc/systemd/system/sshweb-probe.service /usr/local/bin/sshweb-probe.sh
systemctl daemon-reload
echo "🗑️ SSHWeb 探针已卸载"
`

func (a *App) handleProbeAgentScript(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("t")
	pr := a.store.ProbeByToken(token)
	if pr == nil {
		http.Error(w, "invalid token", 404)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprint(w, agentScript(requestBaseURL(r), token))
}

func (a *App) handleProbeUninstallScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprint(w, uninstallScript)
}
