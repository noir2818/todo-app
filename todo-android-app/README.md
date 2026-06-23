# Todo 工作台 Android App

这个目录把 `mobile-todo-workbench` 的手机端网站打包为 Android App。技术方案使用 Capacitor，本地数据、任务、番茄钟、备忘录等功能会作为 WebView 内的本地应用运行。

## 构建准备

需要安装：

- Node.js
- Java JDK 21
- Android SDK / Android Studio

首次安装依赖：

```bash
npm install
```

同步安卓工程：

```bash
npm run cap:sync
```

构建调试 APK：

```bash
npm run android:build:debug
```

构建成功后，APK 通常在：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

已验证的本机调试包路径：

```text
todo-android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

安装到已连接的安卓手机：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

仓库也包含 GitHub Actions 工作流 `Build Android Debug APK`，推送后会自动构建并上传 `todo-workbench-debug-apk` Artifact。

## AI 接口配置

Android App 内部是本地 WebView，不能直接使用站点部署时的 `/api/chat` Functions。若要启用 AI 助手，请在打包前编辑 `web/app-config.js`：

```js
window.TODO_APP_CONFIG = {
  apiBaseUrl: "https://你的 Cloudflare Pages 域名"
};
```

留空时，应用会继续使用相对路径 `/api/chat`，本地 App 环境中 AI 请求通常不可用，但其他离线功能可正常使用。
