#!/usr/bin/env python3
"""SSHWeb Builder — 通过 Skill API 在 SSHWeb Minecraft 农场批量建造体素结构。

纯 python3 stdlib，无第三方依赖。

用法示例：
  python3 build.py --url http://panel:45678 --key sw_XXX state
  python3 build.py --url http://panel:45678 --key sw_XXX --template house --offset 0,0,0
  python3 build.py --url http://panel:45678 --key sw_XXX --fill x0,y0,z0,x1,y1,z1 --type stone
  python3 build.py --url http://panel:45678 --key sw_XXX --template text --text HELLO --type wool_red
  python3 build.py --url http://panel:45678 --key sw_XXX --player 0,10,0 --flying
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

MAX_OPS_PER_REQUEST = 20000

# 5x7 点阵字体（文字模板用）
FONT = {
    'A': ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    'B': ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    'C': ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    'D': ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    'E': ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    'F': ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    'G': ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
    'H': ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    'I': ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    'J': ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    'K': ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    'L': ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    'M': ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    'N': ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    'O': ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    'P': ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    'Q': ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    'R': ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    'S': ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    'T': ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    'U': ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    'V': ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    'W': ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    'X': ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    'Y': ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    'Z': ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    '0': ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    '1': ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    '2': ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    '3': ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
    '4': ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    '5': ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    '6': ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    '7': ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    '8': ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    '9': ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    '!': ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    '?': ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
    '.': ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    '-': ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    ' ': ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}


class Client:
    def __init__(self, url, key, timeout=30):
        self.url = url.rstrip('/')
        self.key = key
        self.timeout = timeout

    def _req(self, path, data=None, method=None):
        body = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(
            self.url + path, data=body,
            method=method or ('POST' if data is not None else 'GET'))
        req.add_header('Content-Type', 'application/json')
        req.add_header('X-API-Key', self.key)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read() or b'{}')
        except urllib.error.HTTPError as e:
            raise SystemExit('API 错误 %s: %s' % (e.code, e.read().decode(errors='replace')))

    def state(self):
        return self._req('/api/skill/state')

    def blocks(self, ops):
        total_applied = total_rejected = 0
        for i in range(0, len(ops), MAX_OPS_PER_REQUEST):
            chunk = ops[i:i + MAX_OPS_PER_REQUEST]
            r = self._req('/api/skill/blocks', {'ops': chunk})
            total_applied += r.get('applied', 0)
            total_rejected += r.get('rejected', 0)
        return total_applied, total_rejected

    def player(self, **kw):
        return self._req('/api/skill/player', kw)


def op_add(ops, x, y, z, t):
    ops.append({'op': 'add', 'x': int(x), 'y': int(y), 'z': int(z), 'type': t})


def op_remove(ops, x, y, z):
    ops.append({'op': 'remove', 'x': int(x), 'y': int(y), 'z': int(z)})


def parse_xyz(s):
    parts = [int(float(v)) for v in s.split(',')]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError('需要 x,y,z 格式')
    return parts


def parse_box(s):
    parts = [int(float(v)) for v in s.split(',')]
    if len(parts) != 6:
        raise argparse.ArgumentTypeError('需要 x0,y0,z0,x1,y1,z1 格式')
    return parts


# ---------------- 模板 ----------------

def tpl_house(ox, oy, oz, size, btype, _text=None):
    """size x size 木屋：木板墙 + 原木柱 + 玻璃窗 + 门洞 + 屋顶"""
    ops = []
    n = max(5, size)
    wall, corner, win = 'planks_oak', 'log_oak', 'glass'
    for x in range(n):
        for z in range(n):
            op_add(ops, ox + x, oy, oz + z, 'cobble')  # 地板
            op_add(ops, ox + x, oy + 5, oz + z, 'log_spruce')  # 屋顶
    for y in range(1, 5):
        for x in range(n):
            for z in (0, n - 1):
                t = corner if x in (0, n - 1) else btype or wall
                if t == wall and y == 2 and 2 <= x <= n - 3 and x % 3 == 2:
                    t = win
                op_add(ops, ox + x, oy + y, oz + z, t)
        for z in range(1, n - 1):
            for x in (0, n - 1):
                t = corner if z in (0, n - 1) else btype or wall
                op_add(ops, ox + x, oy + y, oz + z, t)
    # 门洞（南墙中间 2 格）
    mx = n // 2
    for y in (1, 2, 3):
        op_remove(ops, ox + mx, oy + y, oz + n - 1)
        if mx >= 1:
            op_remove(ops, ox + mx - 1, oy + y, oz + n - 1)
    return ops


def tpl_tower(ox, oy, oz, size, btype, _text=None):
    """方塔：size x size 截面，高度 size*4，顶部瞭望台"""
    ops = []
    n = max(3, size)
    h = n * 4
    t = btype or 'brick'
    for y in range(h + 1):
        for x in range(n):
            for z in range(n):
                edge = x in (0, n - 1) or z in (0, n - 1)
                if edge:
                    # 窗洞
                    if y % 4 == 2 and ((x == n // 2 and z in (0, n - 1)) or (z == n // 2 and x in (0, n - 1))):
                        op_add(ops, ox + x, oy + y, oz + z, 'glass')
                    else:
                        op_add(ops, ox + x, oy + y, oz + z, t)
                elif y == 0:
                    op_add(ops, ox + x, oy + y, oz + z, 'stone')
    # 瞭望台
    for x in range(-1, n + 1):
        for z in range(-1, n + 1):
            op_add(ops, ox + x, oy + h, oz + z, 'stone')
            if x in (-1, n) or z in (-1, n):
                op_add(ops, ox + x, oy + h + 1, oz + z, t)
    return ops


def tpl_pyramid(ox, oy, oz, size, btype, _text=None):
    n = max(3, size)
    ops = []
    t = btype or 'sand'
    layer = 0
    y = oy
    while n > 0:
        for x in range(n):
            for z in range(n):
                op_add(ops, ox + x + layer, y, oz + z + layer, t)
        y += 1
        n -= 2
        layer += 1
    return ops


def tpl_sphere(ox, oy, oz, size, btype, _text=None):
    r = max(2, size / 2.0)
    ops = []
    t = btype or 'snow'
    ri = int(r)
    for x in range(-ri, ri + 1):
        for y in range(-ri, ri + 1):
            for z in range(-ri, ri + 1):
                d = (x * x + y * y + z * z) ** .5
                if d <= r and d > r - 1.2:  # 空心球壳
                    op_add(ops, ox + x, oy + y + ri, oz + z, t)
    return ops


def tpl_wall(ox, oy, oz, size, btype, _text=None):
    n = max(3, size)
    h = max(2, n // 3)
    ops = []
    t = btype or 'cobble'
    for x in range(n):
        for y in range(h):
            op_add(ops, ox + x, oy + y, oz, t)
        # 垛口
        if x % 2 == 0:
            op_add(ops, ox + x, oy + h, oz, t)
    return ops


def tpl_tree(ox, oy, oz, size, btype, _text=None):
    trunk = max(4, size or 5)
    ops = []
    for y in range(trunk):
        op_add(ops, ox, oy + y, oz, 'log_oak')
    # 树冠：三层叶子
    leaf = btype or 'wool_green'
    for ly, rad in ((trunk - 1, 2), (trunk, 2), (trunk + 1, 1), (trunk + 2, 0)):
        for x in range(-rad, rad + 1):
            for z in range(-rad, rad + 1):
                if abs(x) == rad and abs(z) == rad and rad == 2:
                    continue
                if x == 0 and z == 0 and ly < trunk + 1:
                    continue
                op_add(ops, ox + x, oy + ly, oz + z, leaf)
    return ops


def tpl_text(ox, oy, oz, size, btype, text=None):
    text = (text or 'HI').upper()
    t = btype or 'glowstone'
    ops = []
    cx = 0
    for ch in text:
        glyph = FONT.get(ch, FONT['?'])
        for row in range(7):
            for col in range(5):
                if glyph[row][col] == '1':
                    op_add(ops, ox + cx + col, oy + (6 - row), oz, t)
        cx += 6
    return ops


TEMPLATES = {
    'house': tpl_house, 'tower': tpl_tower, 'pyramid': tpl_pyramid,
    'sphere': tpl_sphere, 'wall': tpl_wall, 'tree': tpl_tree, 'text': tpl_text,
}


def main():
    ap = argparse.ArgumentParser(description='SSHWeb 农场建造工具（Skill API）')
    ap.add_argument('--url', required=True, help='面板地址，如 http://127.0.0.1:45678')
    ap.add_argument('--key', required=True, help='API Key（sw_ 开头，面板管理页生成）')
    ap.add_argument('command', nargs='?', default='build', choices=['build', 'state'],
                    help='state=查看服务器状态；build=建造（默认）')
    ap.add_argument('--template', choices=sorted(TEMPLATES), help='体素模板')
    ap.add_argument('--fill', type=parse_box, metavar='X0,Y0,Z0,X1,Y1,Z1',
                    help='填充长方体区域（负坐标用等号形式，如 --fill=-70,0,-70,-60,0,-60）')
    ap.add_argument('--type', default=None, help='方块类型（--fill 默认 stone；air=删除）')
    ap.add_argument('--offset', type=parse_xyz, default=[0, 0, 0], metavar='X,Y,Z',
                    help='模板基点（默认 0,0,0；负坐标用等号形式，如 --offset=-30,0,10）')
    ap.add_argument('--size', type=int, default=9, help='模板尺寸参数（默认 9）')
    ap.add_argument('--text', default=None, help='文字模板内容（A-Z 0-9 ! ? . -）')
    ap.add_argument('--player', type=parse_xyz, metavar='X,Y,Z', help='控制角色：传送坐标（负坐标用等号形式）')
    ap.add_argument('--flying', action='store_true', help='控制角色：开启飞行')
    ap.add_argument('--no-flying', action='store_true', help='控制角色：关闭飞行')
    ap.add_argument('--yaw', type=float, default=None, help='控制角色：朝向')
    ap.add_argument('--player-id', default=None, help='控制角色：玩家 id（默认第一个在线玩家）')
    ap.add_argument('--timeout', type=int, default=30)
    args = ap.parse_args()

    c = Client(args.url, args.key, args.timeout)

    if args.command == 'state':
        st = c.state()
        print(json.dumps(st, ensure_ascii=False, indent=2))
        return

    # 控制角色
    if args.player or args.flying or args.no_flying or args.yaw is not None:
        payload = {'id': args.player_id or ''}
        if args.player:
            payload['x'], payload['y'], payload['z'] = args.player
        if args.flying:
            payload['flying'] = True
        if args.no_flying:
            payload['flying'] = False
        if args.yaw is not None:
            payload['yaw'] = args.yaw
        r = c.player(**payload)
        print('player 控制:', json.dumps(r, ensure_ascii=False))
        return

    ops = []
    if args.fill:
        x0, y0, z0, x1, y1, z1 = args.fill
        t = args.type or 'stone'
        for x in range(min(x0, x1), max(x0, x1) + 1):
            for y in range(min(y0, y1), max(y0, y1) + 1):
                for z in range(min(z0, z1), max(z0, z1) + 1):
                    if t == 'air':
                        op_remove(ops, x, y, z)
                    else:
                        op_add(ops, x, y, z, t)
    if args.template:
        ox, oy, oz = args.offset
        ops += TEMPLATES[args.template](ox, oy, oz, args.size, args.type, args.text)

    if not ops:
        ap.error('需要 --fill 或 --template（或 --player 控制角色）')

    applied, rejected = c.blocks(ops)
    print('建造完成：applied=%d rejected=%d（共 %d ops）' % (applied, rejected, len(ops)))
    if rejected:
        print('提示：rejected 通常是坐标越界（x,z∈[-80,80], y∈[0,64]）或未知材质，用 state 命令查看材质列表')


if __name__ == '__main__':
    main()
