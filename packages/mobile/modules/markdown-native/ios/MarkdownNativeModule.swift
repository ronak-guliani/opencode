import ExpoModulesCore
import UIKit

public class MarkdownNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MarkdownNative")

    View(MarkdownNativeView.self) {
      Prop("content") { (view, content: String) in
        view.setContent(content)
      }
      Prop("style") { (view, style: [String: Any]) in
        view.setStyle(style)
      }
      Prop("selectable") { (view, selectable: Bool) in
        view.setSelectable(selectable)
      }
    }
  }
}
