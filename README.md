# Video Local View

一个本地视频目录浏览器。安装后可在任意目录运行 `video-view`，递归查看视频文件，并在浏览器内用单个播放器切换播放。视频由本机 Express 服务按需流式读取，不会先把整个文件加载到服务器内存；刷新页面可恢复当前视频的播放位置，仍需手动点击播放。

## 环境要求

- Node.js 18 或更高版本
- npm

## 安装为全局命令

在本项目目录执行：

```powershell
npm install
npm run build
npm link
```

然后进入想浏览的视频文件夹并启动：

```powershell
cd "D:\视频资料"
video-view
```

浏览器会自动打开本地页面。按 `Ctrl+C` 可停止服务。

也可以指定另一个目录：

```powershell
video-view --dir "D:\课程视频"
video-view -d .\lessons --no-open
```

路径可使用绝对路径或相对于命令当前目录的路径；含空格时请加引号。运行 `video-view --help` 查看全部参数。

## 失焦锁屏

启动服务时，会在视频目录下自动创建 `.video/config.json`（使用 `--dir` 时，在该参数指定的视频目录下创建）：

```json
{
  "blurLockScreen": false,
  "lockPassword": ""
}
```

- `blurLockScreen: true`：点击其他软件、切换窗口或标签页、最小化浏览器时，立即遮住整个页面并暂停视频和声音。回到页面后保持锁定；刷新也保持锁定。
- 点击锁屏页上的**时间数字**恢复。`lockPassword` 默认为空，点击即可恢复；手动设置密码（例如 `"0042"`）后，点击时间展开输入框，验证通过后恢复。已有密码、开关和额外配置字段不会被覆盖。
- 解锁保留当前视频和进度；锁屏前正在播放则尝试继续播放，原来已暂停则保持暂停。
- 锁屏的颜色、字体和日历随当前主题变化，兼容森林、水墨主题以及网页全屏、原生全屏、移动端。
- `blurLockScreen` 默认是 `false`，自动锁屏默认关闭；需要时手动改为 `true`。修改配置后请**重启服务并刷新页面**。

这是浏览器内的内容遮挡，适合临时隐藏画面，不会改变本地视频服务的访问方式。点击地址栏也可能导致页面失焦，单纯移出鼠标不会触发。

## 支持的文件

目录扫描支持 MP4、M4V、MOV、WebM、MKV、AVI、WMV、MPEG、MPG、MTS、M2TS、TS、OGV 和 3GP 等常见扩展名，扩展名不区分大小写。实际是否能播放还取决于浏览器和视频编码；MP4（H.264/AAC）和 WebM 通常兼容性较好。

## 使用方式

- 左侧递归列出当前目录及子目录中的视频；空目录自动隐藏，可点刷新按钮重新扫描。
- 桌面端侧栏使用固定宽度，可通过底部按钮收起或展开，并记住收起状态。
- 右上角可切换 Forest 和 Ink Wash 主题，界面配色、标题字体和播放器控件同步切换；主题菜单会显示在播放器前方，所有界面提示均为英文；刷新页面后保留主题选择，切换主题不会重建播放器。
- 点击视频后，在右侧同一个 ArtPlayer 播放器中切换，用户自行点击播放。
- 画面底部常驻进度、播放/暂停、音量、倍速与全屏控制。
- 切换视频会卸载前一个播放器；服务端以流方式响应浏览器的 Range 请求。
- 刷新页面会在当前本地服务运行期间恢复已选视频和播放位置，不会自动播放。状态保存在当前标签页的 `sessionStorage` 中，关闭标签页或停止并重新启动服务后会重置。
- 播放位置每 5 秒最多保存一次，暂停、拖动进度、离开页面及卸载播放器时补存；播放结束后重置为开头。切换到其他视频会从头开始，只记住当前选中视频的位置。
- 不会上传视频；浏览器只保存主题偏好、左侧栏收起状态、当前服务运行期间已选视频和播放位置。浏览器存储不可用时仍可正常使用，但无法记住状态。

默认只监听 `127.0.0.1`，仅允许本机访问。需要从局域网其他设备打开时，可显式运行 `video-view --lan`。

## 开发与验证

### 主题结构

样式由 Less 编译，组件通过 `var(--text)`、`var(--accent)`、`var(--panel)` 等语义化 CSS 变量取值。运行时切换 `<html data-theme="…">`，无需重新编译，也不影响播放进度。

```text
src/
  theme.js                        # 主题注册、偏好存储
  styles/
    index.less                    # 公共布局和组件样式
    components/theme-switcher.less
    themes/
      palette.less                # 公共语义变量生成器（Less mixin）
      forest.less                 # 青山主题
      ink.less                    # 水墨主题
```

新增风格时：

1. 参照 `forest.less` 新建 `styles/themes/<id>.less`，使用 `:root[data-theme='<id>']` 和 `.theme-palette(...)` 定义配色，按需覆写字体、渐变等变量，并添加对应的 `.theme-option[data-theme-option='<id>']` 预览色。
2. 在 `styles/index.less` 导入该文件。
3. 在 `src/theme.js` 的 `themes` 注册表添加 ID、名称和说明。

主题切换菜单自动读取注册表；无需修改页面和播放器组件。`npm test` 会校验每个主题是否提供完整变量。

### 构建与测试

```powershell
npm run build
npm test
npm pack --dry-run
```

开发 Vue 页面时，在两个终端分别启动本地 API 和 Vite：

```powershell
# 终端一：31221 端口提供 Express API
npm start -- --dir "D:\视频资料" --no-open --port 31221

# 终端二：启动 Vue 开发页面
npm run dev
```

Vite 会把 `/api` 请求代理到 `127.0.0.1:31221`。正式运行时，`video-view` 会提供构建后的页面和本地 API。
