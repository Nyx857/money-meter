// 在终端里打印二维码：xcrun swift tools/qr.swift "http://192.168.1.2:8765/"
import Foundation
import CoreImage
import CoreGraphics
import AppKit

let args = CommandLine.arguments
let msg = args.count > 1 ? args[1] : "https://example.com"
guard let data = msg.data(using: .utf8) else { exit(1) }

guard let filter = CIFilter(name: "CIQRCodeGenerator") else { exit(2) }
filter.setValue(data, forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")
guard let img = filter.outputImage else { exit(3) }

let w = Int(img.extent.width)
let h = Int(img.extent.height)
guard w > 0, h > 0 else { exit(4) }

var px = [UInt8](repeating: 255, count: w * h * 4)
let cs = CGColorSpaceCreateDeviceRGB()
px.withUnsafeMutableBytes { buf in
    let ctx = CIContext(options: [.workingColorSpace: NSNull()])
    ctx.render(img, toBitmap: buf.baseAddress!, rowBytes: w * 4,
               bounds: CGRect(x: 0, y: 0, width: w, height: h),
               format: .RGBA8, colorSpace: cs)
}

func dark(_ x: Int, _ y: Int) -> Bool {
    let i = (y * w + x) * 4
    return px[i] < 128
}

// 判断图像是"从上到下"还是"从下到上"：左上角是定位图案（黑边、白环、黑心）
func lookTopLeft(_ flip: Bool) -> Bool {
    let y0 = flip ? h - 1 : 0
    let dy = flip ? -1 : 1
    return dark(0, y0) && !dark(1, y0 + dy) && dark(3, y0 + 3 * dy)
}
let flip = !lookTopLeft(false)

// 也可以存成 PNG：xcrun swift tools/qr.swift <url> out.png
if args.count > 2 && args[2].hasSuffix(".png") {
    let scale = 12
    let size = (w + 8) * scale
    let cs2 = CGColorSpaceCreateDeviceRGB()
    guard let ctx2 = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                               bytesPerRow: 0, space: cs2,
                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(5) }
    ctx2.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx2.fill(CGRect(x: 0, y: 0, width: size, height: size))
    ctx2.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    for y in 0..<h {
        for x in 0..<w {
            let yy = flip ? h - 1 - y : y
            if dark(x, yy) {
                ctx2.fill(CGRect(x: (x + 4) * scale, y: size - (y + 5) * scale,
                                 width: scale, height: scale))
            }
        }
    }
    guard let cg = ctx2.makeImage() else { exit(6) }
    let rep = NSBitmapImageRep(cgImage: cg)
    guard let png = rep.representation(using: .png, properties: [:]) else { exit(7) }
    try? png.write(to: URL(fileURLWithPath: args[2]))
    print("saved \(args[2]) \(w)x\(h)")
    exit(0)
}

// 终端配色：深色模块黑底、浅色模块白底，避免主题色干扰
let DARK = "\u{001B}[40m  "
let LIGHT = "\u{001B}[47m  "
let RESET = "\u{001B}[0m"
let quiet = 4

var out = ""
for row in 0..<(h + quiet * 2) {
    for col in 0..<(w + quiet * 2) {
        let x = col - quiet
        let y = row - quiet
        if x < 0 || y < 0 || x >= w || y >= h {
            out += LIGHT
        } else {
            let yy = flip ? h - 1 - y : y
            out += dark(x, yy) ? DARK : LIGHT
        }
    }
    out += RESET + "\n"
}
print(out, terminator: "")
