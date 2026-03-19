# packing-demo

一个基于 Vite 的 TypeScript + React 前端项目，仓库已经从空白模板改造成了一个可交互的 `Packing Demo` 单页应用。

## 项目内容

- 三种打包场景切换：`48h Weekender`、`Creator Sprint`、`Overland Escape`
- 可搜索、可过滤、可勾选的打包清单
- 实时显示重量、容积、关键物品完成度
- 面向桌面和移动端的响应式布局

## 启动方式

```bash
npm install
npm run dev
```

## 构建与检查

```bash
npm run build
npm run lint
```

## 主要文件

- `src/App.tsx`: 页面结构、交互逻辑、示例数据
- `src/App.css`: 组件级布局与视觉样式
- `src/index.css`: 全局变量、背景、排版基础样式

## 仓库说明

原始远端仓库只包含最基础的 `README.md` 和 `LICENSE`。当前版本在保留 Apache 2.0 许可证的基础上，补齐了一个可直接运行的 React + TypeScript 前端工程。
