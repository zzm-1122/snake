# Snake Demo

原生 `HTML + CSS + JavaScript` 实现的街机新版贪吃蛇。无需构建步骤，直接打开页面即可运行。

## Features

- 20 x 20 网格地图
- 多食物玩法：食物、金币、护盾、毒物、加速、缓速
- 分数升级关卡，关卡提升后自动增加障碍物
- 护盾可抵消一次撞墙、撞障碍或自撞
- 碰撞检测（撞墙/撞自己/撞障碍）
- 本地最高分记录（`localStorage`）
- 键盘控制、暂停继续、结束后空格重开
- 移动端虚拟方向键
- 吃食物、转向、结束、破纪录等事件音效
- 粒子、轨迹和面板反馈效果

## Structure

- `index.html`：页面结构
- `style.css`：视觉样式
- `script.js`：游戏状态、渲染、输入、音效
- `test/script.test.js`：基于 Node.js 的回归测试

## Run

```bash
open demo/index.html
```

也可以直接在浏览器中打开 `demo/index.html`。

## Test

在仓库根目录执行：

```bash
node demo/test/script.test.js
```

测试覆盖：

- 自撞判定，包括合法进入即将移走的尾巴格
- 金币奖励、毒物惩罚、护盾抵消撞击
- 升级生成障碍物、暂停停止移动
- `localStorage` 不可用时的启动容错
- 方向键、`WASD` 和空格键的默认行为拦截

## Controls

- `↑ ↓ ← →` / `W A S D`：移动
- `P` / `Space`：暂停或继续
- `Space`：游戏结束后重新开始
