// sweat-dreams menu bar indicator.
// Polls `sweat-dreams status --json` and shows whether the Mac is being held awake.
// Click the icon for details and a Stop button.
import Cocoa

let TOOL = "\(NSHomeDirectory())/.local/bin/sweat-dreams"

struct Status {
    var holding = false
    var leases = 0
    var battery = 100
    var power = "?"
    var batteryBlocked = false
    var holdMins: Int? = nil
}

func run(_ args: [String]) -> String {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: TOOL)
    p.arguments = args
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = Pipe()
    do { try p.run() } catch { return "" }
    let d = pipe.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    return String(data: d, encoding: .utf8) ?? ""
}

func poll() -> Status {
    var s = Status()
    let out = run(["status", "--json"])
    guard let d = out.data(using: .utf8),
          let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return s }
    s.holding = j["holding"] as? Bool ?? false
    s.leases = j["leases"] as? Int ?? 0
    s.battery = j["battery"] as? Int ?? 100
    s.power = j["power"] as? String ?? "?"
    s.batteryBlocked = j["battery_blocked"] as? Bool ?? false
    return s
}

class App: NSObject, NSApplicationDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    var timer: Timer?

    func applicationDidFinishLaunching(_ n: Notification) {
        item.menu = NSMenu()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in self.refresh() }
    }

    func refresh() {
        let s = poll()
        if let b = item.button {
            // Filled cup = holding you awake. Hollow = idle. Battery-blocked = warning.
            b.title = s.holding ? "☕︎" : (s.batteryBlocked ? "☕︎!" : "○")
            b.toolTip = s.holding
                ? "sweat-dreams: preventing sleep — \(s.leases) holder(s)"
                : "sweat-dreams: idle"
        }
        let m = NSMenu()
        let head = s.holding
            ? "● Preventing sleep — \(s.leases) agent session(s)"
            : (s.batteryBlocked ? "▲ Holding off — battery \(s.battery)% below floor" : "○ Idle — Mac can sleep")
        m.addItem(withTitle: head, action: nil, keyEquivalent: "")
        m.addItem(withTitle: "Power: \(s.power) \(s.battery)%", action: nil, keyEquivalent: "")
        m.addItem(NSMenuItem.separator())

        for line in run(["status"]).split(separator: "\n") where line.hasPrefix("    ") {
            m.addItem(withTitle: line.trimmingCharacters(in: .whitespaces), action: nil, keyEquivalent: "")
        }
        m.addItem(NSMenuItem.separator())

        let stop = NSMenuItem(title: "Stop keeping awake", action: #selector(stopIt), keyEquivalent: "s")
        stop.target = self
        stop.isEnabled = s.holding || s.leases > 0
        m.addItem(stop)

        let quit = NSMenuItem(title: "Quit indicator", action: #selector(quitIt), keyEquivalent: "q")
        quit.target = self
        m.addItem(quit)
        item.menu = m
    }

    @objc func stopIt() { _ = run(["kill"]); refresh() }
    @objc func quitIt() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)   // menu bar only, no Dock icon
let d = App()
app.delegate = d
app.run()
