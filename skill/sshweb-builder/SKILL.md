---
name: sshweb-builder
description: 在 SSHWeb Minecraft 农场中通过 HTTP API 批量建造体素结构（房子/塔/金字塔/球/墙/树/文字）、填充区域、控制玩家角色（移动/飞行）。当用户要求在 SSHWeb 农场里建东西、放置方块、造建筑或控制角色时使用本技能。
---

# SSHWeb Builder

通过 SSHWeb 面板的 Skill API 在 3D 农场中批量建造方块结构。

## 前置条件

1. 管理员在面板「☰ 管理 → 🤖 AI Skill API Key」生成一个 Key（形如 `sw_xxx`）。
2. 面板地址（如 `http://your-panel:45678`）。

## 用法

```bash
# 查看服务器状态（地图尺寸、材质列表、在线玩家）
python3 scripts/build.py --url http://PANEL --key sw_XXX state

# 在指定位置建一座房子
python3 scripts/build.py --url http://PANEL --key sw_XXX --template house --offset 0,0,0

# 填充区域（xz 平面 y0..y1）
python3 scripts/build.py --url http://PANEL --key sw_XXX --fill -10,0,-10,10,3,10 --type stone

# 建塔 / 金字塔 / 球 / 墙 / 树 / 文字
python3 scripts/build.py --url http://PANEL --key sw_XXX --template tower --offset 20,0,0
python3 scripts/build.py --url http://PANEL --key sw_XXX --template pyramid --size 15
python3 scripts/build.py --url http://PANEL --key sw_XXX --template sphere --size 9 --type glowstone
python3 scripts/build.py --url http://PANEL --key sw_XXX --template wall --size 20 --type brick
python3 scripts/build.py --url http://PANEL --key sw_XXX --template tree --offset -30,0,10
python3 scripts/build.py --url http://PANEL --key sw_XXX --template text --text "HELLO" --type wool_red --offset 0,5,40

# 清空一个区域
python3 scripts/build.py --url http://PANEL --key sw_XXX --fill -10,0,-10,10,10,10 --type air

# 控制玩家角色（传送/飞行）
python3 scripts/build.py --url http://PANEL --key sw_XXX --player 0,10,0 --flying
```

## API 摘要（build.py 内部使用）

| 端点 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/skill/state` | GET | `X-API-Key` | 地图尺寸、材质列表、在线玩家、方块总数 |
| `/api/skill/blocks` | POST | `X-API-Key` | `{"ops":[{"op":"add\|remove","x","y","z","type"}]}`，限速 2000 ops/s/key |
| `/api/skill/player` | POST | `X-API-Key` | `{"id","x","y","z","yaw","pitch","flying"}` 控制在线角色 |

坐标系：地面 y=0，建造范围 x,z ∈ [-80,80]，y ∈ [0,64]。可用材质通过 `state` 命令查询（草方块 grass、泥土 dirt、石头 stone、圆石 cobble、三种木板/原木、玻璃 glass、砖块 brick、沙 sand、雪 snow、冰 ice、黑曜石 obsidian、五种矿石、TNT、萤石 glowstone、书架 bookshelf、16 色羊毛 wool_*、发音方块 note1-7）。

## 注意

- 单次请求最多 20000 ops；超过会自动分批。
- 建造结果通过 WebSocket 实时推送到所有打开的网页端，无需刷新。
- `--type air` 表示删除方块。
