# 第十一号森林 · The 11th Forest

一款基于 Phaser 4 的俯视角二次元像素风射击游戏。你将踏入不该存在的第十一号森林 —— 在这里,每片玫瑰花瓣都可能是一颗子弹,每段寂静之下都藏着一首未唱完的歌。

![screenshot](screenshot.png)

## 关于

**第十一号森林** 是一款哥特庭院风的俯视角像素射击游戏,主打手绘质感的二次元美术。玩家扮演一名被森林召来的孤独猎人,在一座座被诅咒的庭园中穿行 —— 玫瑰会还击,大树记得你讲过的每一个名字。

- **类型:** 俯视角射击 / Roguelite(规划中)
- **美术:** 二次元像素风
- **视角:** 俯视,跟随 / 锁定
- **状态:** 预制作 / 早期原型

## 技术栈

| 层       | 选择                                                       |
|----------|------------------------------------------------------------|
| 游戏引擎 | [Phaser 4](https://github.com/phaserjs/phaser)             |
| UI       | [React 19](https://react.dev)                              |
| 构建     | [Vite 6](https://vite.dev)                                 |
| 语言     | [TypeScript 5.7](https://www.typescriptlang.org)           |
| 音乐     | [MiniMax](https://MiniMax.io) AI 音乐生成                  |

## 快速开始

环境要求: Node.js 18+。

```bash
npm install
npm run dev       # 启动开发服务器(带匿名统计)
npm run dev-nolog # 启动开发服务器(不带统计)
npm run build     # 生产构建,产物输出到 dist/
```

开发服务器默认运行在 `http://localhost:8080`。

## 项目结构

| 路径                       | 说明                                  |
|----------------------------|---------------------------------------|
| `index.html`               | HTML 外壳                             |
| `src/main.tsx`             | React 入口                            |
| `src/App.tsx`              | 顶层 React 组件                       |
| `src/PhaserGame.tsx`       | Phaser 与 React 之间的桥接            |
| `src/game/`                | 游戏源码                              |
| `src/game/main.ts`         | Phaser 游戏配置与启动                 |
| `src/game/scenes/`         | Phaser 场景目录(MainMenu / Game / …)  |
| `src/game/EventBus.ts`     | 跨边界事件总线                        |
| `public/assets/`           | 静态资源(贴图、音频)                  |
| `public/style.css`         | 页面级 CSS                            |

## AI 生成音乐

游戏配乐通过 **MiniMax** AI 音乐生成服务制作。每一首曲目按游戏氛围打标 prompt(例如 *"暮色玫瑰庭院,缓钢琴配低音弦乐"*),生成结果落到 `public/assets/audio/` 下。

如需重新生成某首曲子,使用 MiniMax 音乐 API,传入同目录下 `.prompt.json` 中保存的 prompt 即可。

## 开发提示

直接编辑 `src/` 下任何文件,Vite 会自动热更新。

新增一个 Phaser 场景:

1. 在 `src/game/scenes/MyScene.ts` 创建场景类。
2. 在 `src/game/main.ts` 的 `scene` 数组里注册。
3. 在场景的 `create()` 中通过 `EventBus.emit('current-scene-ready', this)` 通知 React,以便外部获取场景句柄:

```ts
class MyScene extends Phaser.Scene {
    constructor () { super('MyScene'); }

    create () {
        // … 你的游戏对象

        EventBus.emit('current-scene-ready', this);
    }
}
```

## 文档

详细的设计、机制、美术与工具文档存放在 [`docs/`](./docs/),每个主题一个 `UPPERCASE-ENGLISH.md` 文件。完整索引见 [`docs/README.md`](./docs/README.md)。

## 许可证

MIT —— 见 [LICENSE](./LICENSE)。

> 原始 Phaser + React + TypeScript 模板版权 © Phaser Studio Inc.,MIT 协议。