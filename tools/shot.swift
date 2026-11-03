// 用 WKWebView 真渲染页面并截图：xcrun swift tools_shot.swift <url> <out.png> <w> <h> [js]
import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count >= 5 else {
    print("usage: shot.swift <url> <out.png> <w> <h> [js]")
    exit(2)
}
let url = URL(string: args[1])!
let outPath = args[2]
let W = Double(args[3]) ?? 393
let H = Double(args[4]) ?? 852
let preJS = args.count > 5 ? args[5] : ""

let app = NSApplication.shared
app.setActivationPolicy(.regular)

let conf = WKWebViewConfiguration()
let hook = WKUserScript(source: """
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(String(e.message) + ' @' + e.lineno); });
window.addEventListener('unhandledrejection', function (e) { window.__errs.push('promise: ' + String(e.reason)); });
""", injectionTime: .atDocumentStart, forMainFrameOnly: true)
conf.userContentController.addUserScript(hook)

let win = NSWindow(contentRect: NSRect(x: 60, y: 60, width: W, height: H),
                   styleMask: [.borderless], backing: .buffered, defer: false)
win.backgroundColor = .black
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: W, height: H), configuration: conf)
win.contentView = web
win.makeKeyAndOrderFront(nil)
win.orderFrontRegardless()
app.activate(ignoringOtherApps: true)

func spin(_ seconds: Double) {
    let end = Date().addingTimeInterval(seconds)
    while Date() < end { RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02)) }
}

web.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 30))
spin(2.6)

if !preJS.isEmpty {
    var finished = false
    web.evaluateJavaScript(preJS) { _, err in
        if let err = err { print("PRE-JS ERROR: \(err)") }
        finished = true
    }
    var guardCount = 0
    while !finished && guardCount < 100 { spin(0.02); guardCount += 1 }
    spin(0.7)
}

let probe = """
JSON.stringify({
  errs: window.__errs || [],
  hasApp: !!window.__mm,
  cfg: window.__mm ? window.__mm.state.cfg : null,
  perSec: window.__mm ? window.__mm.basePerSec(window.__mm.state.cfg) : null,
  todayText: document.getElementById('amountMain').textContent + (document.getElementById('amountDec')||{textContent:''}).textContent,
  status: document.getElementById('statusText').textContent,
  mult: document.getElementById('multBadge').textContent,
  scrollH: document.documentElement.scrollHeight,
  innerH: window.innerHeight,
  overflowX: document.documentElement.scrollWidth > window.innerWidth,
  note: document.title
})
"""

var payload = "{}"
var shotDone = false
web.evaluateJavaScript(probe) { res, err in
    if let err = err { print("PROBE ERROR: \(err)") }
    if let s = res as? String { payload = s }
    web.takeSnapshot(with: nil) { image, snapErr in
        defer { shotDone = true }
        guard let image = image, snapErr == nil else {
            print("SNAPSHOT FAILED: \(String(describing: snapErr))")
            return
        }
        guard let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else {
            print("PNG ENCODE FAILED")
            return
        }
        try? png.write(to: URL(fileURLWithPath: outPath))
        print("SHOT \(outPath) \(rep.pixelsWide)x\(rep.pixelsHigh)")
    }
}

var g = 0
while !shotDone && g < 400 { spin(0.02); g += 1 }
spin(0.1)
print("PROBE \(payload)")
exit(shotDone ? 0 : 1)
