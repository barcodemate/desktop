# BarcodeMate

A local desktop workspace for barcode design, batch generation, reusable projects and label printing. Built with Electron, React and TypeScript for macOS and Windows.

## Download

[Download for Windows and Mac](https://barcodemate.com/desktop/) · [GitHub release and checksums](https://github.com/barcodemate/desktop/releases/tag/v0.4.1)

Version 0.4.1 provides Windows x64, Mac Apple Silicon and Intel Mac packages, including household labels and phone synchronization. Windows installation and app workflows, plus macOS packaged app workflows, passed automated tests. Intel Mac physical hardware and real printers remain unverified. App interface: 24 languages, automatic system-language selection on first launch, a persistent language selector, and right-to-left layouts for Arabic, Persian and Hebrew.

Installers are not publisher-signed; Mac packages are not notarized. The operating system may warn or block installation. Test a printed sample before a large print run.

## What works

- 108 barcode formats from BWIPP / bwip-js, including retail, GS1, industrial, postal and 2D formats.
- CSV / TSV / text import and pasted spreadsheets with column mapping, leading-zero preservation, per-row quantities, names, formats and captions.
- Exact integer sequences with start, step, count, zero padding, prefix/suffix and shuffled unique values.
- Editable batches, selection, error reporting, pagination, background validation and cancellable ZIP exports.
- Label layouts for A4, US Letter and thermal paper. Custom dimensions, margins, gutters, rows/columns, print order and partially used sheets.
- Real-size label preview, vector PDF export and native printer handoff. Oversized barcodes are flagged instead of silently resized.
- PNG, SVG, JPEG, GIF, BMP and uncompressed RGB TIFF. PNG/JPEG/BMP/TIFF carry physical resolution metadata; GIF has no standard DPI metadata.
- Module width aligned to printer dots, bar height, quiet zones, rotation, colors, captions, text settings and expert encoder options.
- GS1 common-field, Wi-Fi, vCard and URL assistants. Raster logos on selected 2D formats and dot styling where supported.
- Portable `.barcodemate` project files, local project library, recovery autosave and undo/redo.
- Local image decoding via ZXing WASM in a worker; file, drop and paste input. Decoder supports fewer formats than generation.
- 24 interface languages and light/dark themes. No telemetry, account or remote fonts. Barcode work stays local; optional household voice input sends audio and the current label list to the configured gateway.

Generation is not registration of a product number. Design diagnostics are not an ISO/IEC quality grade. Use an actual printed sample and scanner before production.

## Run and validate

Requires Node.js 24+ and npm. Run all commands from the repository root.

```sh
npm ci
npm run build
npm test
npm run test:app
npm start
```

Local data lives in Electron's per-user application-data directory. Use **Save project** to choose a portable project file. The library and recovery data are private to each OS user. Storage errors are surfaced instead of silently discarding data.

## Package locally

```sh
npm run build
npx electron-builder --mac dmg --arm64 --publish never
npx electron-builder --win nsis --x64 --publish never
```

Build Windows on a Windows runner for representative runtime tests. The included workflow only validates and stores CI artifacts; it does not publish releases. Signing/notarization credentials are not configured. Public releases are published separately after package validation and checksum verification.

## Scope and status

- [BCStudio research and comparison](docs/BCSTUDIO_RESEARCH.md)
- [Validation evidence and remaining checks](docs/VALIDATION.md)

This build prioritizes import → sequence → layout → print. It is not yet a complete replacement for every BCStudio professional feature. EPS/AI, CMYK/overprint, specialized assistants and other differences are listed explicitly in the comparison.

## License

BarcodeMate is licensed under the [MIT License](LICENSE). Third-party components retain their respective licenses; their notices are bundled at `THIRD_PARTY_NOTICES.txt`. No proprietary BCStudio components or copied templates are included.

## Interface languages

English, Simplified Chinese, Traditional Chinese, Spanish, French, German, Portuguese, Japanese, Korean, Italian, Russian, Arabic, Hindi, Indonesian, Turkish, Vietnamese, Thai, Polish, Dutch, Ukrainian, Malay, Bengali, Persian and Hebrew.

The language selector is at the bottom of the sidebar. Switching language also updates application menus and keeps your project data, barcodes and print geometry unchanged. Native OS dialogs follow OS settings. Dictionaries ship inside the application; language switching works offline. Technical error details from third-party encoders may retain their original wording. Translation corrections are welcome in `src/i18n/`.


## 家庭收纳标签（0.3.0 已发布）

新增独立家庭标签工作区，24 种界面语言、厨房/收纳盒基础名称、批量清单、可编辑双语与数量、完整尺寸目录、自定义毫米布局、对位测试、PDF 和本地项目保存。地区仅影响尺寸排序，不过滤选项。家庭项目使用独立 JSON 格式，不修改条码项目。

Kitchen 与 Storage boxes 按语言和分类独立保存。名称与数量可直接编辑，默认厨房集合按24种语言分别提供；零数量保留。英文厨房每张标签可以有独立的 Best before 日期，预览名称、日期及背景随当前日期选择高亮，打印仍为黑白。浏览器和桌面共用组件，自动保存、撤销和备份导入导出均已验证。

0.3.0默认连接BarcodeMate的HTTPS语音网关；只有主动使用语音时才发送录音和当前清单，API key始终留在服务端。可通过 `BARCODEMATE_HOME_API` 改用自己的网关，设为空字符串可禁用云端语音。基本编辑和打印不依赖网络。本地已用合成中文、英文、法文通过云端识别，桌面录音编码与原生 PDF 流程也已验证；真实硬件麦克风、其他语音语言和实体耗材仍待实测。旧版用户需安装 0.3.0 才能使用家庭标签。

家庭预览支持手动等比缩放：拿实物纸张对齐屏幕中的左右边缘，再保存此屏幕比例。仅预览的标签边框包含空白格；超出窗口时滚动查看，不改变 PDF 或打印尺寸。换屏幕/缩放后重新比对，打印先做普通纸对位测试。

## Phone synchronization (0.4.0)

Open Home labels: **Sync with phone** directly displays the QR code and a short explanation. Scan it with the phone camera, or use **Copy link** to connect from another computer. The hint beside the button explains how. Initial connection failures retry automatically. The mobile web page can edit the shared list or record speech; the computer updates its preview and keeps control of printing. Pairing does not use IP addresses as identity and works across different networks. No project is uploaded until the phone joins.

One phone can join each session. While the waiting computer page stays open, its code stays valid automatically. After a long absence, expired invitations are replaced automatically without affecting an established connection. The shared project is held temporarily in server memory for at most 24 hours and disappears when sharing ends or the service restarts. Both devices retain working drafts in their current tab's session storage. Reconnect to deliver queued changes; export a backup before closing an unsynchronized tab. Concurrent edits require choosing the whole project version after reviewing the conflict. Pairing and voice are optional online features, with keys kept on the gateway server.
