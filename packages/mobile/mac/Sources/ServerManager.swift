import Foundation
import Combine

class ServerManager: ObservableObject {
    @Published var isRunning: Bool = false
    @Published var isExpoRunning: Bool = false
    @Published var isSimulatorRunning: Bool = false
    @Published var serverURL: String = ""
    @Published var logs: [String] = []
    
    var onStatusChange: (() -> Void)?
    
    private var process: Process?
    private var outputPipe: Pipe?
    private var expoProcess: Process?
    private var expoOutputPipe: Pipe?
    private var monitorTimer: Timer?
    private let port = 4096
    private let expoPort = 8081
    
    func startMonitoring() {
        addLog("🔍 Starting server monitor...")
        checkAllStatus()
        monitorTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.checkAllStatus()
        }
    }
    
    private func checkAllStatus() {
        checkServerStatusQuiet()
        checkExpoStatusQuiet()
        checkSimulatorStatusQuiet()
    }
    
    private func checkServerStatusQuiet() {
        let url = URL(string: "http://localhost:\(port)/global/health")!
        var request = URLRequest(url: url)
        request.timeoutInterval = 1
        
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            guard let self = self else { return }
            DispatchQueue.main.async {
                let running = (response as? HTTPURLResponse)?.statusCode == 200
                if running != self.isRunning {
                    self.isRunning = running
                    if running {
                        self.updateServerURL()
                    }
                    self.onStatusChange?()
                }
            }
        }.resume()
    }
    
    private func checkExpoStatusQuiet() {
        let url = URL(string: "http://localhost:\(expoPort)/status")!
        var request = URLRequest(url: url)
        request.timeoutInterval = 1
        
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            guard let self = self else { return }
            DispatchQueue.main.async {
                let running = (response as? HTTPURLResponse)?.statusCode == 200
                if running != self.isExpoRunning {
                    self.isExpoRunning = running
                }
            }
        }.resume()
    }
    
    private func checkSimulatorStatusQuiet() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
            task.arguments = ["simctl", "list", "devices", "booted", "-j"]
            
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()
            
            guard (try? task.run()) != nil else { return }
            task.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let devices = json["devices"] as? [String: [[String: Any]]] else { return }
            
            let hasBooted = devices.values.contains { $0.contains { ($0["state"] as? String) == "Booted" } }
            
            DispatchQueue.main.async {
                if hasBooted != self?.isSimulatorRunning {
                    self?.isSimulatorRunning = hasBooted
                }
            }
        }
    }
    
    func startOpenCodeServer() {
        let opencodePath = findOpenCodeBinary()
        if opencodePath.isEmpty {
            addLog("❌ opencode binary not found")
            return
        }
        
        let cmd = "\(opencodePath) serve --port \(port) --hostname 0.0.0.0"
        addLog("$ \(cmd)")
        
        stopExistingOpenCodeProcess()
        
        let newProcess = Process()
        newProcess.executableURL = URL(fileURLWithPath: opencodePath)
        newProcess.arguments = ["serve", "--port", "\(port)", "--hostname", "0.0.0.0"]
        
        let pipe = Pipe()
        newProcess.standardOutput = pipe
        newProcess.standardError = pipe
        outputPipe = pipe
        
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let output = String(data: data, encoding: .utf8) else { return }
            let lines = output.components(separatedBy: .newlines).filter { !$0.isEmpty }
            DispatchQueue.main.async {
                for line in lines {
                    self?.addLog("📝 \(line)")
                }
            }
        }
        
        newProcess.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                guard let self = self, self.process != nil else { return }
                self.isRunning = false
                self.addLog("⚠️ OpenCode server exited (code: \(proc.terminationStatus))")
                self.process = nil
                self.onStatusChange?()
            }
        }
        
        do {
            try newProcess.run()
            process = newProcess
            isRunning = true
            updateServerURL()
            addLog("✅ OpenCode server started (PID: \(newProcess.processIdentifier))")
            onStatusChange?()
        } catch {
            addLog("❌ Failed to start: \(error.localizedDescription)")
        }
    }
    
    func startExpoServer() {
        let bunPath = findBunBinary()
        if bunPath.isEmpty {
            addLog("❌ bun binary not found")
            return
        }
        
        guard let projectPath = findMobileProjectPath() else {
            addLog("❌ Mobile project not found")
            return
        }
        
        let cmd = "cd \(projectPath) && \(bunPath) run start"
        addLog("$ \(cmd)")
        
        stopExistingExpoProcess()
        
        let newProcess = Process()
        newProcess.executableURL = URL(fileURLWithPath: bunPath)
        newProcess.arguments = ["run", "start"]
        newProcess.currentDirectoryURL = URL(fileURLWithPath: projectPath)
        
        let pipe = Pipe()
        newProcess.standardOutput = pipe
        newProcess.standardError = pipe
        expoOutputPipe = pipe
        
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let output = String(data: data, encoding: .utf8) else { return }
            let lines = output.components(separatedBy: .newlines).filter { !$0.isEmpty }
            DispatchQueue.main.async {
                for line in lines {
                    self?.addLog("📱 \(line)")
                }
            }
        }
        
        newProcess.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                guard let self = self, self.expoProcess != nil else { return }
                self.isExpoRunning = false
                self.addLog("⚠️ Expo server exited (code: \(proc.terminationStatus))")
                self.expoProcess = nil
            }
        }
        
        do {
            try newProcess.run()
            expoProcess = newProcess
            isExpoRunning = true
            addLog("✅ Expo dev server started (PID: \(newProcess.processIdentifier))")
        } catch {
            addLog("❌ Failed to start Expo: \(error.localizedDescription)")
        }
    }
    
    func stopOpenCodeServer() {
        addLog("$ kill OpenCode server processes on port \(port)")
        
        if let proc = process, proc.isRunning {
            proc.terminate()
        }
        process = nil
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
        
        if let pid = findProcessOnPort(port) {
            addLog("$ kill -TERM \(pid)")
            kill(pid, SIGTERM)
        }
        
        isRunning = false
        addLog("✅ OpenCode server stopped")
        onStatusChange?()
    }
    
    func stopExpoServer() {
        addLog("$ kill Expo server processes on port \(expoPort)")
        
        if let proc = expoProcess, proc.isRunning {
            proc.terminate()
        }
        expoProcess = nil
        expoOutputPipe?.fileHandleForReading.readabilityHandler = nil
        expoOutputPipe = nil
        
        if let pid = findProcessOnPort(expoPort) {
            addLog("$ kill -TERM \(pid)")
            kill(pid, SIGTERM)
        }
        
        isExpoRunning = false
        addLog("✅ Expo server stopped")
    }
    
    func startSimulator() {
        guard isRunning && isExpoRunning else {
            addLog("⚠️ Start servers first")
            return
        }
        
        addLog("$ open -a Simulator")
        isSimulatorRunning = true
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let openTask = Process()
            openTask.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            openTask.arguments = ["-a", "Simulator"]
            try? openTask.run()
            openTask.waitUntilExit()
            
            DispatchQueue.main.async {
                self?.addLog("✅ Simulator opened")
                self?.launchAppInSimulator()
            }
        }
    }
    
    private func launchAppInSimulator() {
        guard let projectPath = findMobileProjectPath() else { return }
        let bunPath = findBunBinary()
        guard !bunPath.isEmpty else { return }
        
        let cmd = "cd \(projectPath) && \(bunPath) run ios"
        addLog("$ \(cmd)")
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let task = Process()
            task.executableURL = URL(fileURLWithPath: bunPath)
            task.arguments = ["run", "ios"]
            task.currentDirectoryURL = URL(fileURLWithPath: projectPath)
            
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = pipe
            
            pipe.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                guard !data.isEmpty, let output = String(data: data, encoding: .utf8) else { return }
                let lines = output.components(separatedBy: .newlines).filter { !$0.isEmpty }
                DispatchQueue.main.async {
                    for line in lines {
                        self?.addLog("📱 \(line)")
                    }
                }
            }
            
            try? task.run()
            task.waitUntilExit()
            
            DispatchQueue.main.async {
                self?.addLog("✅ App launched")
            }
        }
    }
    
    func stopSimulator() {
        addLog("$ xcrun simctl shutdown all")
        isSimulatorRunning = false
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
            task.arguments = ["simctl", "shutdown", "all"]
            try? task.run()
            task.waitUntilExit()
            
            DispatchQueue.main.async {
                self?.addLog("✅ Simulator stopped")
            }
        }
    }
    
    func clearLogs() {
        logs.removeAll()
        addLog("🗑️ Logs cleared")
    }
    
    func copyAllLogs() -> String {
        logs.joined(separator: "\n")
    }
    
    private func stopExistingOpenCodeProcess() {
        if let proc = process, proc.isRunning {
            proc.terminate()
            process = nil
        }
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
    }
    
    private func stopExistingExpoProcess() {
        if let proc = expoProcess, proc.isRunning {
            proc.terminate()
            expoProcess = nil
        }
        expoOutputPipe?.fileHandleForReading.readabilityHandler = nil
        expoOutputPipe = nil
    }
    
    private func findProcessOnPort(_ port: Int) -> Int32? {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        task.arguments = ["-ti", ":\(port)"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        
        guard (try? task.run()) != nil else { return nil }
        task.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              let pid = Int32(output.components(separatedBy: .newlines).first ?? "") else { return nil }
        return pid
    }
    
    private func findOpenCodeBinary() -> String {
        for path in ["/opt/homebrew/bin/opencode", "/usr/local/bin/opencode"] {
            if FileManager.default.isExecutableFile(atPath: path) { return path }
        }
        
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        task.arguments = ["opencode"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        
        guard (try? task.run()) != nil else { return "" }
        task.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !path.isEmpty else { return "" }
        return path
    }
    
    private func findBunBinary() -> String {
        let homePath = FileManager.default.homeDirectoryForCurrentUser.path
        for path in ["\(homePath)/.bun/bin/bun", "/opt/homebrew/bin/bun", "/usr/local/bin/bun"] {
            if FileManager.default.isExecutableFile(atPath: path) { return path }
        }
        
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        task.arguments = ["bun"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        
        guard (try? task.run()) != nil else { return "" }
        task.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !path.isEmpty else { return "" }
        return path
    }
    
    private func findMobileProjectPath() -> String? {
        let path = "\(FileManager.default.homeDirectoryForCurrentUser.path)/code/opencode/packages/mobile"
        return FileManager.default.fileExists(atPath: "\(path)/package.json") ? path : nil
    }
    
    private func updateServerURL() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/sbin/ifconfig")
        
        let pipe = Pipe()
        task.standardOutput = pipe
        
        guard (try? task.run()) != nil else {
            serverURL = "http://localhost:\(port)"
            return
        }
        task.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let output = String(data: data, encoding: .utf8) else {
            serverURL = "http://localhost:\(port)"
            return
        }
        
        var inEn0 = false
        for line in output.components(separatedBy: .newlines) {
            if line.hasPrefix("en0:") { inEn0 = true; continue }
            if inEn0 && !line.hasPrefix("\t") && !line.isEmpty { inEn0 = false }
            if inEn0 && line.contains("inet ") && !line.contains("inet6") {
                let parts = line.trimmingCharacters(in: .whitespaces).components(separatedBy: " ")
                if let idx = parts.firstIndex(of: "inet"), idx + 1 < parts.count {
                    let ip = parts[idx + 1]
                    if ip != "127.0.0.1" {
                        serverURL = "http://\(ip):\(port)"
                        return
                    }
                }
            }
        }
        serverURL = "http://localhost:\(port)"
    }
    
    private func addLog(_ message: String) {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        logs.append("[\(formatter.string(from: Date()))] \(message)")
        if logs.count > 200 { logs.removeFirst(50) }
    }
    
    deinit {
        monitorTimer?.invalidate()
        stopExistingOpenCodeProcess()
        stopExistingExpoProcess()
    }
}
