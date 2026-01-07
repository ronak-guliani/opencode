import SwiftUI

struct ContentView: View {
    @ObservedObject var serverManager: ServerManager
    
    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 8) {
                HStack {
                    Circle()
                        .fill(serverManager.isRunning ? Color.green : Color.red)
                        .frame(width: 12, height: 12)
                    
                    Text("OpenCode Server")
                        .font(.headline)
                    
                    Text(serverManager.isRunning ? "Running" : "Stopped")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Spacer()
                }
                
                HStack {
                    Circle()
                        .fill(serverManager.isExpoRunning ? Color.green : Color.red)
                        .frame(width: 12, height: 12)
                    
                    Text("Expo Dev Server")
                        .font(.headline)
                    
                    Text(serverManager.isExpoRunning ? "Running" : "Stopped")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Spacer()
                }
                
                HStack {
                    Circle()
                        .fill(serverManager.isSimulatorRunning ? Color.green : Color.red)
                        .frame(width: 12, height: 12)
                    
                    Text("iOS Simulator")
                        .font(.headline)
                    
                    Text(serverManager.isSimulatorRunning ? "Running" : "Stopped")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Spacer()
                }
            }
            .padding(.horizontal)
            .padding(.top, 12)
            
            if serverManager.isRunning {
                VStack(alignment: .leading, spacing: 8) {
                    Text("OpenCode Server URL:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    HStack {
                        Text(serverManager.serverURL)
                            .font(.system(.body, design: .monospaced))
                            .textSelection(.enabled)
                        
                        Spacer()
                        
                        Button(action: {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(serverManager.serverURL, forType: .string)
                        }) {
                            Image(systemName: "doc.on.doc")
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(8)
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(6)
                }
                .padding(.horizontal)
            }
            
            HStack(spacing: 8) {
                if serverManager.isRunning {
                    Button(action: {
                        serverManager.stopOpenCodeServer()
                    }) {
                        Text("Stop OpenCode")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                } else {
                    Button(action: {
                        serverManager.startOpenCodeServer()
                    }) {
                        Text("Start OpenCode")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                }
                
                if serverManager.isExpoRunning {
                    Button(action: {
                        serverManager.stopExpoServer()
                    }) {
                        Text("Stop Expo")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                } else {
                    Button(action: {
                        serverManager.startExpoServer()
                    }) {
                        Text("Start Expo")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.blue)
                }
            }
            .padding(.horizontal)
            
            HStack(spacing: 8) {
                if serverManager.isSimulatorRunning {
                    Button(action: {
                        serverManager.stopSimulator()
                    }) {
                        HStack {
                            Image(systemName: "iphone.slash")
                            Text("Stop Simulator")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                } else {
                    Button(action: {
                        serverManager.startSimulator()
                    }) {
                        HStack {
                            Image(systemName: "iphone")
                            Text("Start Simulator")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.blue)
                    .disabled(!serverManager.isRunning || !serverManager.isExpoRunning)
                }
            }
            .padding(.horizontal)
            
            Divider()
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Logs")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Spacer()
                    
                    Button(action: {
                        let logs = serverManager.copyAllLogs()
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(logs, forType: .string)
                    }) {
                        HStack(spacing: 2) {
                            Image(systemName: "doc.on.doc")
                            Text("Copy")
                        }
                        .font(.caption)
                    }
                    .buttonStyle(.plain)
                    .disabled(serverManager.logs.isEmpty)
                    
                    Button(action: {
                        serverManager.clearLogs()
                    }) {
                        HStack(spacing: 2) {
                            Image(systemName: "trash")
                            Text("Clear")
                        }
                        .font(.caption)
                    }
                    .buttonStyle(.plain)
                    .disabled(serverManager.logs.isEmpty)
                }
                
                ScrollView {
                    ScrollViewReader { proxy in
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(serverManager.logs.enumerated()), id: \.offset) { index, log in
                                Text(log)
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundColor(.primary)
                                    .textSelection(.enabled)
                                    .id(index)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .onChange(of: serverManager.logs.count) { _ in
                            if let lastIndex = serverManager.logs.indices.last {
                                proxy.scrollTo(lastIndex, anchor: .bottom)
                            }
                        }
                    }
                }
                .frame(height: 120)
                .padding(8)
                .background(Color.black.opacity(0.05))
                .cornerRadius(6)
            }
            .padding(.horizontal)
            .padding(.bottom)
        }
        .frame(width: 400, height: 420)
    }
}
