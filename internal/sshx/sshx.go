package sshx

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

type ServerInfo struct {
	Host       string
	Port       int
	User       string
	AuthKind   string // password | key
	Password   string
	PrivateKey string
	KeyPass    string
}

func (s *ServerInfo) addr() string {
	return net.JoinHostPort(s.Host, fmt.Sprint(s.Port))
}

func (s *ServerInfo) clientConfig() (*ssh.ClientConfig, error) {
	var auth []ssh.AuthMethod
	switch s.AuthKind {
	case "key":
		var signer ssh.Signer
		var err error
		if strings.TrimSpace(s.KeyPass) != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(s.PrivateKey), []byte(s.KeyPass))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(s.PrivateKey))
		}
		if err != nil {
			return nil, fmt.Errorf("私钥解析失败: %v", err)
		}
		auth = append(auth, ssh.PublicKeys(signer))
	default:
		auth = append(auth, ssh.Password(s.Password))
	}
	return &ssh.ClientConfig{
		User:            s.User,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 面板托管场景：接受任意主机密钥
		Timeout:         10 * time.Second,
	}, nil
}

func (s *ServerInfo) dial() (*ssh.Client, error) {
	cfg, err := s.clientConfig()
	if err != nil {
		return nil, err
	}
	return ssh.Dial("tcp", s.addr(), cfg)
}

type TestResult struct {
	Hostname string
	Uptime   string
	Uname    string
	Err      string
}

// TestConn 连通性 + 认证验证 + 基本信息
func TestConn(si *ServerInfo, timeout time.Duration) TestResult {
	done := make(chan TestResult, 1)
	go func() {
		c, err := si.dial()
		if err != nil {
			done <- TestResult{Err: friendlyErr(err)}
			return
		}
		defer c.Close()
		res := TestResult{}
		session, err := c.NewSession()
		if err != nil {
			done <- TestResult{}
			return
		}
		defer session.Close()
		if out, err := session.Output("uname -sr 2>/dev/null; echo; (uptime -p 2>/dev/null || uptime) 2>/dev/null; echo; hostname 2>/dev/null"); err == nil {
			lines := []string{}
			for _, ln := range strings.Split(strings.TrimSpace(string(out)), "\n") {
				if strings.TrimSpace(ln) != "" {
					lines = append(lines, ln)
				}
			}
			get := func(i int) string {
				if i < len(lines) {
					return strings.TrimSpace(lines[i])
				}
				return ""
			}
			res.Uname, res.Uptime, res.Hostname = get(0), get(1), get(2)
		}
		done <- res
	}()
	select {
	case r := <-done:
		return r
	case <-time.After(timeout):
		return TestResult{Err: "连接超时"}
	}
}

func friendlyErr(err error) string {
	msg := err.Error()
	low := strings.ToLower(msg)
	switch {
	case strings.Contains(low, "unable to authenticate") || strings.Contains(low, "no supported auth") || strings.Contains(low, "no auth"):
		return "认证失败：用户名或密码/私钥不正确"
	case strings.Contains(low, "timeout"):
		return "连接超时：检查地址、端口与防火墙"
	case strings.Contains(low, "connection refused"):
		return "连接被拒绝：目标机 SSH 服务未启动或端口错误"
	case strings.Contains(low, "no such host"):
		return "域名解析失败"
	case strings.Contains(low, "network is unreachable"):
		return "网络不可达"
	case strings.Contains(low, "cipher") || strings.Contains(low, "mac "):
		return "SSH 算法协商失败: " + msg
	default:
		return msg
	}
}

// ---------------- 终端桥：WS <-> SSH PTY ----------------

// 二进制帧首字节协议
const (
	FInput  = 1 // 客户端→服务端：键盘输入
	FOutput = 2 // 服务端→客户端：终端输出
	FResize = 3 // 客户端→服务端：{"cols":N,"rows":N}
	FNotice = 4 // 服务端→客户端：系统提示文本
)

type session struct {
	mu     sync.Mutex
	sess   *ssh.Session
	client *ssh.Client
	ws     *websocket.Conn
	closed bool
}

type Pool struct{}

func NewPool() *Pool { return &Pool{} }

// Attach 建立 SSH PTY 并双向桥接到 WebSocket，直到任一侧断开
func (p *Pool) Attach(ws *websocket.Conn, si *ServerInfo) error {
	client, err := si.dial()
	if err != nil {
		ws.WriteMessage(websocket.TextMessage, []byte("SSH 连接失败: "+friendlyErr(err)))
		return err
	}
	sess, err := client.NewSession()
	if err != nil {
		client.Close()
		return err
	}
	modes := ssh.TerminalModes{
		ssh.ECHO: 1, ssh.IGNCR: 0, ssh.ICRNL: 1, ssh.OPOST: 1,
		ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400,
	}
	cols, rows := 120, 34
	if err := sess.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		sess.Close()
		client.Close()
		return fmt.Errorf("请求 PTY 失败: %v", err)
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		client.Close()
		return err
	}
	stdout, _ := sess.StdoutPipe()
	stderr, _ := sess.StderrPipe()
	if err := sess.Start("bash -l || sh"); err != nil {
		sess.Close()
		client.Close()
		return fmt.Errorf("启动 shell 失败: %v", err)
	}

	s := &session{sess: sess, client: client, ws: ws}

	var wg sync.WaitGroup
	wg.Add(2)
	// SSH → WS
	go func() {
		defer wg.Done()
		buf := make([]byte, 32*1024)
		r := io.MultiReader(stdout, stderr)
		for {
			n, rerr := r.Read(buf)
			if n > 0 {
				if werr := s.writeBinary(FOutput, buf[:n]); werr != nil {
					return
				}
			}
			if rerr != nil {
				return
			}
		}
	}()
	// WS → SSH
	go func() {
		defer wg.Done()
		for {
			mt, data, rerr := ws.ReadMessage()
			if rerr != nil || mt != websocket.BinaryMessage || len(data) == 0 {
				s.close()
				return
			}
			switch data[0] {
			case FInput:
				stdin.Write(data[1:])
			case FResize:
				var sz struct {
					Cols int `json:"cols"`
					Rows int `json:"rows"`
				}
				// WindowChange 需要绝对行列数（不是增量）
				if json.Unmarshal(data[1:], &sz) == nil && sz.Cols >= 2 && sz.Rows >= 2 {
					_ = sess.WindowChange(sz.Rows, sz.Cols)
					rows, cols = sz.Rows, sz.Cols
				}
			}
		}
	}()

	ws.SetPingHandler(func(app string) error {
		return ws.WriteControl(websocket.PongMessage, []byte(app), time.Now().Add(5*time.Second))
	})

	waitErr := sess.Wait()
	s.notify(fmt.Sprintf("\r\n\x1b[90m[会话结束 %v]\x1b[0m\r\n", waitErr))
	s.close()
	wg.Wait()
	return nil
}

func (s *session) writeBinary(kind byte, payload []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return fmt.Errorf("closed")
	}
	msg := make([]byte, 0, len(payload)+1)
	msg = append(msg, kind)
	msg = append(msg, payload...)
	s.ws.SetWriteDeadline(time.Now().Add(30 * time.Second))
	return s.ws.WriteMessage(websocket.BinaryMessage, msg)
}

func (s *session) notify(text string) { s.writeBinary(FNotice, []byte(text)) }

func (s *session) close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.mu.Unlock()
	s.sess.Close()
	s.client.Close()
	s.ws.Close()
}
