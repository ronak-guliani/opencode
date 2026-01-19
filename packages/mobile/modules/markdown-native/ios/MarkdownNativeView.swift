import ExpoModulesCore
import UIKit
import Down
class MarkdownNativeView: ExpoView {
  private let textView = UITextView()
  private var styleOptions: [String: Any] = [:]
  private var currentMarkdown = ""
  
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setupTextView()
  }
  
  private func setupTextView() {
    textView.isEditable = false
    textView.isSelectable = true
    textView.backgroundColor = .clear
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    textView.showsVerticalScrollIndicator = false
    textView.showsHorizontalScrollIndicator = false
    textView.contentMode = .topLeft
    textView.isUserInteractionEnabled = true
    addSubview(textView)
  }
  
  override func layoutSubviews() {
    super.layoutSubviews()
    textView.frame = bounds
  }
  
  func setContent(_ markdown: String) {
    currentMarkdown = markdown
    
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }
      
      do {
        let down = Down(markdownString: markdown)
        let attributedString = try down.toAttributedString()
        
        DispatchQueue.main.async {
          self.textView.attributedText = attributedString
        }
      } catch {
        print("MarkdownNative: Rendering error - \(error)")
      }
    }
  }
  
  func setStyle(_ style: [String: Any]) {
    styleOptions = style
    if !currentMarkdown.isEmpty {
      setContent(currentMarkdown)
    }
  }
  
  func setSelectable(_ selectable: Bool) {
    textView.isSelectable = selectable
  }
}
