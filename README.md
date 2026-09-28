# SSHWeb · 我的世界农场版

把你的服务器变成一座 **Minecraft 风格农场**：每台 SSH 服务器是一只鸡，公开探针是带国旗的探针鸡，游客是随机造型的农场主。在浏览器里 3D 漫游、追鸡，把鸡打倒后打开**真 PTY 网页终端**（vim / htop 原样可用），还能挖矿、建造、和其他游客互啄。

单二进制 / 单容器部署，无外部 CDN 依赖（three.js、xterm.js、306 国国旗图全部内置）。

![farm](docs/screenshots/farm.png)

## 特性

### 🐔 服务器农场
- 每台登记的 SSH 服务器 = 一只鸡，头顶显示名称与 ❤ 血量（100 血 / 5 颗进度心）
- **左键攻击**（木剑 / 弓箭 / 手枪），血量归零鸡倒地；管理员按 `F` 交互进入真 PTY 网页终端（xterm.js ↔ SSH，Ctrl+C、Tab 补全、`vim` `htop` 全屏程序原样可用），退出终端原地满血复活；倒地 10 秒无人交互也会自动复活
- 被攻击的鸡会逃跑，受击闪红 + 粒子 + 伤害数字 + 音效
- 密码或 SSH 私钥（支持口令）认证，凭据只存在你自己机器上

### 📡 公开探针（服务器状态鸡）
- 右上角「📡 加入」生成一键安装命令，**任何服务器**（不限于管理员自己的）都能接入：

  ```bash
  curl -fsSL 'https://你的域名/probe/agent.sh?t=***' | sudo bash
  ```

- 纯 bash + systemd agent，无二进制依赖（curl 缺失自动用 wget），每 5 秒上报：CPU / 内存 / 磁盘 / 上下行网速 / 负载 / 在线时长 / 进程数 / CPU 型号
- 探针鸡头顶**大信息卡**直显全部数据；国旗按上报 IP 自动识别（内置 306 国旗图，离线可用）
- 生成时可配置：**完全公开** 或 **密码查看**（游戏内登录框输入查看密码解锁，HttpOnly Cookie 保存 7 天）；IP 可选**第三段掩码**（如 `203.0.xxx.1`）
- 一键卸载：

  ```bash
  curl -fsSL 'https://你的域名/probe/uninstall.sh' | sudo bash
  ```

- 探针只有统计上报能力，**没有任何 SSH 能力**；安装命令前缀自动跟随当前访问域名，反代 / 自定义域名部署即得对应公网命令
- 探针鸡同样可以被攻击、倒地、自动复活，纯粹图一乐

### 🎮 多人游戏性
- **游客免登录直接进入**：随机造型农场主（肤色 / 衣着按 ID 哈希生成，人人不同），可攻击鸡、攻击其他游客、自由建造
- **游客身份与 IP 深度绑定**：昵称、建造材料持久保存，重进不丢；右上角「✏️ 改名」（≤32 字符）
- **建造系统**：开局送 50 材料；泥土🟫 / 木头🪵 / 石头🪨 三种建材直接放技能栏，左键放置（**白色预览框**指示落点），可跳起向上搭高；⛏️ 拆除返还材料；方块全端实时同步并持久化到 data.json
- **发音方块（管理员）**：🎵 Do Re Mi Fa Sol La Si 七种彩色方块，按键 `1`-`7` 直接选中，放置时发出对应音高（全端同步播放），可以拼音符琴、做声控陷阱
- **管理员无限材料**：管理员建造/放置发音方块不消耗库存，材料数不扣减
- **每日奖励**：每天添加一个探针 → 材料 +100（服务端权威计数，防刷；奖励**实时到账**，无需刷新页面）
- 建筑悬空时可以从下方走过（方块底面高于头顶即放行），齐胸方块仍会挡路
- 玩家 100 血，被啄倒弹出死亡界面（显示凶手），随机点复活；复活点落在建筑上时自动站到建筑顶上，不会卡进方块
- 围栏、谷仓、掩体石墙、树、水塘、玩家方块全部有碰撞；石墙和围栏可以跳上去
- 左上角统计面板：探针鸡在线 / 网站鸡在线 / 暴躁鸡（倒地数）/ 我的材料
- 顶部事件播报：「XXX 啄倒了 XXX」
- 手机可玩：自动显示虚拟摇杆，右半屏拖动视角、点按攻击
- 指针锁定操作：点击画面隐藏鼠标转视角，`ESC` 释放

### 🔐 权限模型
- 游客：看鸡、打架、建造；**看不到任何 SSH 连接信息，无法打开终端**
- 管理员（右上角登录）：农场主形态 👑 + 全部武器 + 倒地鸡 `F` 交互进终端 + 管理面板（服务器 / 探针 / 改密码）
- 探针查看密码在登录框输入即可解锁对应探针，无需管理员权限

## 快速开始

### Docker（推荐）

```bash
docker run -d --name sshweb \
  -p 45678:45678 \
  -e SSHWEB_PASSWORD='你的强密码' \
  -v sshweb-data:/data \
  --restart unless-stopped \
  ghcr.io/baiduxc/sshweb:latest
```

打开 `http://服务器IP:45678` 直接进入农场（游客免登录）；管理员点右上角「登录」。

### docker compose

```bash
git clone https://github.com/baiduxc/sshweb.git && cd sshweb
SSHWEB_PASSWORD='你的强密码' docker compose up -d
```

### 直接运行

```bash
go build -o sshweb .
./sshweb -listen :45678 -data ./data
```

或从 [Releases](https://github.com/baiduxc/sshweb/releases) 下载预编译二进制（linux amd64 / arm64、darwin arm64）。

## 配置

| 参数 / 环境变量 | 默认 | 说明 |
|---|---|---|
| `-listen` | `:45678` | 监听地址 |
| `-data` / `SSHWEB_DATA` | `data` | 数据目录（`data.json`，0600） |
| `SSHWEB_PASSWORD` | `admin888` | 仅**首次启动**生效；之后用管理面板修改 |

### Nginx 反向代理 + HTTPS 示例

```nginx
location / {
    proxy_pass http://127.0.0.1:45678;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;        # WebSocket（终端 / 游戏大厅）
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_set_header X-Forwarded-Proto $scheme;    # 探针安装命令跟随 https
    proxy_set_header X-Forwarded-Host $host;       # 探针安装命令跟随你的域名
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # 游客/探针国家识别
}
```

## 操作说明

| 操作 | 键位 |
|---|---|
| 移动 / 疾跑 | `WASD` / `Shift` |
| 跳跃 | `空格` |
| 锁定鼠标（转视角） | 点击画面；`ESC` 释放 |
| 攻击 / 挖矿 / 放置 | `左键`（按当前技能自动判定） |
| 切换技能 | `Q` / 点击技能栏；管理员 `1`-`7` = 发音方块，`8`/`9`/`0` = 泥土/木头/石头；游客 `1`-`5` |
| 交互（倒地鸡 → 终端） | `F`（仅管理员） |
| 管理面板 | `E`（仅管理员） |

## 安全须知（请先读完再暴露公网）

- 本面板等价于「把 SSH 入口搬进浏览器」：首次启动**务必**设置强密码（`SSHWEB_PASSWORD` 或界面修改），默认密码等于没有密码
- 所有凭据（SSH 密码 / 私钥、管理密码、探针 token、探针查看密码）只保存在你自己机器的 `data.json`（0600），任何 API 响应都不下发
- 探针 token 是安装凭据：泄露者只能冒充上报数据，无法读取任何信息；必要时删除探针重新生成
- 游客与 IP 绑定仅用于昵称/材料持久化，不存储任何可识别个人信息
- 建议置于 HTTPS 反代之后；有条件用防火墙限制端口来源
- 目标服务器主机密钥不做校验（面板托管场景），适合自建内网 / 云机管理

## 从源码构建

```bash
git clone https://github.com/baiduxc/sshweb.git
cd sshweb
go build .            # Go ≥ 1.25
# 或
docker build -t sshweb .
```

## 致谢

3D 场景基于 [three.js](https://threejs.org/)；终端基于 [xterm.js](https://xtermjs.org/)；国旗图来自 [flagcdn.com](https://flagcdn.com/)（公共领域）；国家识别使用 [ip-api.com](https://ip-api.com/) 免费接口（仅查询访问者 IP 归属国，结果服务端缓存）。

## License

[MIT](LICENSE)
