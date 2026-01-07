import Cocoa
import SwiftUI

NSApplication.shared.setActivationPolicy(.accessory)

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var popover: NSPopover!
    var serverManager: ServerManager!
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        serverManager = ServerManager()
        
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        
        if let button = statusItem.button {
            updateStatusIcon()
            button.action = #selector(togglePopover)
            button.target = self
        }
        
        popover = NSPopover()
        popover.contentSize = NSSize(width: 400, height: 420)
        popover.behavior = .semitransient
        popover.animates = false
        popover.contentViewController = NSHostingController(rootView: ContentView(serverManager: serverManager))
        
        serverManager.onStatusChange = { [weak self] in
            DispatchQueue.main.async {
                self?.updateStatusIcon()
            }
        }
        
        serverManager.startMonitoring()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.updateStatusIcon()
        }
    }
    
    @objc func togglePopover() {
        if let button = statusItem.button {
            if popover.isShown {
                popover.performClose(nil)
            } else {
                popover.show(relativeTo: button.bounds, of: button, preferredEdge: .maxY)
            }
        }
    }
    
    func updateStatusIcon() {
        guard let button = statusItem.button else { return }
        
        let coloredImage = NSImage(size: NSSize(width: 14, height: 14))
        coloredImage.lockFocus()
        
        let color: NSColor = serverManager.isRunning ? .systemGreen : .systemRed
        color.set()
        
        let rect = NSRect(x: 0, y: 0, width: 14, height: 14)
        NSBezierPath(ovalIn: rect).fill()
        
        coloredImage.unlockFocus()
        
        button.image = coloredImage
    }
}
